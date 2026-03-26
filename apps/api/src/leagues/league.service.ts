// League Service - Business Logic
import { randomUUID } from "node:crypto";
import type { LeagueMemberRecord, LeagueRecord, RuntimeStore } from "../common/runtime-store.ts";
import type { ScheduleService } from "../schedule/schedule.service.ts";
import { CreateLeagueDto, LeagueResponseDto } from "./dto/create-league.dto.ts";

export class LeagueService {
  private readonly store: RuntimeStore;
  private readonly scheduleService?: ScheduleService;

  constructor(store: RuntimeStore, scheduleService?: ScheduleService) {
    this.store = store;
    this.scheduleService = scheduleService;
  }

  async createLeague(
    creatorId: string,
    createLeagueDto: CreateLeagueDto
  ): Promise<LeagueResponseDto> {
    const validation = createLeagueDto.validate();
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(", ")}`);
    }

    const league: LeagueRecord = {
      id: randomUUID(),
      creatorId,
      name: createLeagueDto.name.trim(),
      description: createLeagueDto.description?.trim(),
      memberLimit: createLeagueDto.memberLimit,
      totalBudget: createLeagueDto.totalBudget,
      joinDeadline: createLeagueDto.joinDeadline,
      scoringPreferences: createLeagueDto.scoringPreferences ?? {},
      state: "draft",
      inviteCode: await this.generateInviteCode(),
      memberCount: 1,
      createdAt: new Date().toISOString()
    };

    const creatorMembership: LeagueMemberRecord = {
      id: randomUUID(),
      leagueId: league.id,
      userId: creatorId,
      joinedAt: league.createdAt
    };

    await this.store.createLeagueWithCreator(league, creatorMembership);
    return new LeagueResponseDto(league);
  }

  async getLeagueById(leagueId: string): Promise<LeagueResponseDto | null> {
    const league = await this.store.getLeagueById(leagueId);
    if (!league) {
      return null;
    }
    return new LeagueResponseDto(league);
  }

  async getLeagueByIdForUser(userId: string, leagueId: string): Promise<LeagueResponseDto | null> {
    const league = await this.store.getLeagueById(leagueId);
    if (!league) {
      return null;
    }

    const isMember = await this.store.isLeagueMember(leagueId, userId);
    if (!isMember) {
      throw new Error("Forbidden: join this league to view details");
    }

    return new LeagueResponseDto(league);
  }

  async getLeagueByInviteCode(inviteCode: string): Promise<LeagueResponseDto | null> {
    const league = await this.store.getLeagueByInviteCode(inviteCode);
    if (!league) {
      return null;
    }
    return new LeagueResponseDto(league);
  }

  async getUserLeagues(userId: string): Promise<LeagueResponseDto[]> {
    const leagues = await this.store.getUserLeagues(userId);
    return leagues.map((entry) => new LeagueResponseDto(entry));
  }

  async canJoinLeague(leagueId: string): Promise<{ canJoin: boolean; reason?: string }> {
    const league = await this.store.getLeagueById(leagueId);
    if (!league) {
      return { canJoin: false, reason: "League not found" };
    }

    if (league.state !== "draft") {
      return { canJoin: false, reason: `League is in ${league.state} state, cannot join` };
    }

    if (league.memberCount >= league.memberLimit) {
      return { canJoin: false, reason: "League is full" };
    }

    const deadline = new Date(league.joinDeadline);
    if (Date.now() > deadline.getTime()) {
      return { canJoin: false, reason: "Join deadline has passed" };
    }

    return { canJoin: true };
  }

  async joinLeague(userId: string, inviteCode: string): Promise<LeagueResponseDto> {
    const league = await this.store.getLeagueByInviteCode(inviteCode);
    if (!league) {
      throw new Error("League not found with this invite code");
    }

    if (await this.store.isLeagueMember(league.id, userId)) {
      throw new Error("User is already a member of this league");
    }

    const deadline = new Date(league.joinDeadline);
    if (deadline.getTime() <= Date.now()) {
      throw new Error("Join deadline has passed");
    }

    if (league.state !== "draft") {
      throw new Error(`League is in ${league.state} state, cannot join`);
    }

    if (league.memberCount >= league.memberLimit) {
      throw new Error("League is full");
    }

    const joinedLeague = await this.store.addLeagueMember(league.id, userId);
    await this.refreshLeagueFixtures(league.id);
    return new LeagueResponseDto(joinedLeague);
  }

  async getAllLeagues(): Promise<LeagueResponseDto[]> {
    const leagues = await this.store.getAllLeagues();
    return leagues.map((league) => new LeagueResponseDto(league));
  }

  private async generateInviteCode(): Promise<string> {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let index = 0; index < 8; index += 1) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    if (await this.store.getLeagueByInviteCode(code)) {
      return this.generateInviteCode();
    }

    return code;
  }

  private async refreshLeagueFixtures(leagueId: string): Promise<void> {
    if (!this.scheduleService) {
      return;
    }

    const members = await this.store.getLeagueMembers(leagueId);
    const memberIds = members.map((member) => member.userId);
    if (memberIds.length < 2) {
      return;
    }

    // Rebuild full-season fixtures whenever league composition changes during draft phase.
    await this.scheduleService.generateHeadToHeadFixtures(leagueId, memberIds);
  }
}
