import { randomUUID } from "node:crypto";
import type { LeagueRecord, LeagueTeamRecord, RuntimeStore, TeamPlayerRecord } from "../common/runtime-store.ts";
import { CreateTeamDto } from "./dto/create-team.dto.ts";
import { ROLE_COMPOSITION_LIMITS } from "@fantasy/shared";
import { getIpl2026GameDay } from "../schedule/ipl-2026-schedule.ts";

export type LeagueTeamViewRecord = LeagueTeamRecord & { ownerDisplayName?: string };

interface TeamEligibilityResult {
  valid: boolean;
  errors: string[];
  budgetUsed: number;
}

export class TeamService {
  private readonly store: RuntimeStore;

  constructor(store: RuntimeStore) {
    this.store = store;
  }

  async createOrUpdateTeam(userId: string, createTeamDto: CreateTeamDto): Promise<LeagueTeamRecord> {
    const validation = createTeamDto.validate();
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(", ")}`);
    }

    const league = await this.store.getLeagueById(createTeamDto.leagueId);
    if (!league) {
      throw new Error("League not found");
    }

    if (!(await this.store.isLeagueMember(league.id, userId))) {
      throw new Error("User must join the league before creating a team");
    }

    const member = await this.store.getLeagueMember(league.id, userId);
    const persistedTeamName = member?.teamName?.trim() || "";
    const submittedTeamName = createTeamDto.teamName.trim();
    const resolvedTeamName = persistedTeamName || submittedTeamName;
    if (!resolvedTeamName) {
      throw new Error("Team name is required. Set your league team name first.");
    }

    const eligibility = this.validateRoster(
      createTeamDto.players,
      league,
      createTeamDto.captainPlayerId,
      createTeamDto.viceCaptainPlayerId,
      createTeamDto.gameDay
    );
    if (!eligibility.valid) {
      throw new Error(`Team validation failed: ${eligibility.errors.join(", ")}`);
    }

    const now = new Date().toISOString();
    const existing = await this.store.getUserTeam(league.id, userId, createTeamDto.gameDay);
    const payload: LeagueTeamRecord = {
      id: existing?.id ?? randomUUID(),
      leagueId: league.id,
      userId,
      gameDay: createTeamDto.gameDay,
      teamName: resolvedTeamName,
      players: createTeamDto.players,
      captainPlayerId: createTeamDto.captainPlayerId,
      viceCaptainPlayerId: createTeamDto.viceCaptainPlayerId,
      totalBudgetUsed: eligibility.budgetUsed,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      lockedAt: existing?.lockedAt
    };

    const saved = await this.store.upsertLeagueTeam(payload);
    await this.store.setLeagueMemberTeamName(league.id, userId, resolvedTeamName);
    await this.store.updateLeagueTeamNames(league.id, userId, resolvedTeamName);
    return saved;
  }

  async getLeagueTeamName(userId: string, leagueId: string): Promise<string> {
    if (!(await this.store.isLeagueMember(leagueId, userId))) {
      throw new Error("Forbidden: join this league first");
    }

    const member = await this.store.getLeagueMember(leagueId, userId);
    const persisted = member?.teamName?.trim();
    if (persisted) {
      return persisted;
    }

    const latest = await this.store.getLatestUserTeam(leagueId, userId);
    if (latest?.teamName?.trim()) {
      return latest.teamName.trim();
    }

    const [league, ownerName] = await Promise.all([
      this.store.getLeagueById(leagueId),
      this.lookupDisplayName(userId)
    ]);
    return `${ownerName} - ${league?.name || "League"}`;
  }

  async updateLeagueTeamName(userId: string, leagueId: string, teamName: string): Promise<string> {
    if (!(await this.store.isLeagueMember(leagueId, userId))) {
      throw new Error("Forbidden: join this league first");
    }

    const trimmed = teamName.trim();
    if (!trimmed) {
      throw new Error("Team name cannot be empty");
    }
    if (trimmed.length > 100) {
      throw new Error("Team name must be at most 100 characters");
    }

    await this.store.setLeagueMemberTeamName(leagueId, userId, trimmed);
    await this.store.updateLeagueTeamNames(leagueId, userId, trimmed);
    return trimmed;
  }

  async getLeagueTeams(viewerUserId: string, leagueId: string, gameDay?: string): Promise<LeagueTeamViewRecord[]> {
    if (!(await this.store.isLeagueMember(leagueId, viewerUserId))) {
      throw new Error("Forbidden: join this league to view submitted teams");
    }

    const teams = await this.store.getLeagueTeams(leagueId, gameDay);
    const now = Date.now();
    const views: LeagueTeamViewRecord[] = [];

    for (const team of teams) {
      const ownerDisplayName = await this.lookupDisplayName(team.userId);

      if (team.userId === viewerUserId) {
        views.push({ ...team, ownerDisplayName });
        continue;
      }

      const daySchedule = getIpl2026GameDay(team.gameDay);
      const isStarted = daySchedule ? now >= new Date(daySchedule.firstMatchStartAt).getTime() : true;
      if (isStarted) {
        views.push({ ...team, ownerDisplayName });
        continue;
      }

      views.push({
        ...team,
        ownerDisplayName,
        teamName: "Hidden until game starts",
        players: [],
        captainPlayerId: "",
        viceCaptainPlayerId: "",
        totalBudgetUsed: 0
      });
    }

    return views;
  }

  private async lookupDisplayName(userId: string): Promise<string> {
    if (!/^[0-9a-fA-F-]{36}$/.test(userId)) {
      return userId;
    }

    try {
      const owner = await this.store.getAuthUserById(userId);
      return owner?.displayName || userId;
    } catch {
      return userId;
    }
  }

  async getUserTeam(leagueId: string, userId: string, gameDay?: string): Promise<LeagueTeamRecord | null> {
    return this.store.getUserTeam(leagueId, userId, gameDay);
  }

  private validateRoster(
    players: TeamPlayerRecord[],
    league: LeagueRecord,
    captainPlayerId: string,
    viceCaptainPlayerId: string,
    gameDay: string
  ): TeamEligibilityResult {
    const errors: string[] = [];
    const counts = { WK: 0, BAT: 0, AR: 0, BOWL: 0 };
    const budgetUsed = players.reduce((total, player) => total + player.cost, 0);

    for (const player of players) {
      counts[player.role] += 1;
    }

    if (budgetUsed > league.totalBudget) {
      errors.push(`Team exceeds the league budget of ${league.totalBudget}`);
    }

    // Validate role counts using shared composition limits
    const roles = ["WK", "BAT", "AR", "BOWL"] as const;
    for (const role of roles) {
      const count = counts[role];
      const [min, max] = ROLE_COMPOSITION_LIMITS[role];
      const roleLabel = role === "WK" ? "wicketkeepers" : role === "BAT" ? "batters" : role === "AR" ? "all-rounders" : "bowlers";
      if (count < min || count > max) {
        errors.push(`Select between ${min} and ${max} ${roleLabel}`);
      }
    }

    const playerIds = new Set(players.map((player) => player.playerId));
    if (!playerIds.has(captainPlayerId)) {
      errors.push("Captain must belong to the team");
    }
    if (!playerIds.has(viceCaptainPlayerId)) {
      errors.push("Vice-captain must belong to the team");
    }

    const matchDay = getIpl2026GameDay(gameDay);
    if (!matchDay) {
      errors.push("Selected game day is not part of IPL 2026 schedule");
    } else if (Date.now() >= new Date(matchDay.lockAt).getTime()) {
      errors.push("Team is locked for this game day (30 minutes before first match)");
    } else {
      const playingTeams = new Set<string>();
      for (const fixture of matchDay.matches || []) {
        playingTeams.add(fixture.homeTeamCode);
        playingTeams.add(fixture.awayTeamCode);
      }

      const invalidTeamCodes = Array.from(new Set(players
        .map((player) => player.teamCode)
        .filter((teamCode) => !playingTeams.has(teamCode))));

      if (invalidTeamCodes.length > 0) {
        errors.push(`Only players from today's fixtures are allowed. Remove: ${invalidTeamCodes.join(", ")}`);
      }
    }

    const joinDeadline = new Date(league.joinDeadline);
    if (joinDeadline.getTime() <= Date.now()) {
      errors.push("The league join deadline has passed; team changes are locked");
    }

    return {
      valid: errors.length === 0,
      errors,
      budgetUsed
    };
  }
}
