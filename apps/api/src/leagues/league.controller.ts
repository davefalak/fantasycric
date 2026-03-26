// League Controller - HTTP Routes
import { LeagueService } from "./league.service.ts";
import { CreateLeagueDto, LeagueResponseDto } from "./dto/create-league.dto.ts";

export class LeagueController {
  private readonly leagueService: LeagueService;

  constructor(leagueService: LeagueService) {
    this.leagueService = leagueService;
  }

  async createLeague(creatorId: string, body: Record<string, unknown>): Promise<{ success: boolean; data?: LeagueResponseDto; error?: string }> {
    try {
      const createLeagueDto = new CreateLeagueDto(body);
      const league = await this.leagueService.createLeague(creatorId, createLeagueDto);
      return { success: true, data: league };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }

  async getLeague(userId: string, leagueId: string): Promise<{ success: boolean; data?: LeagueResponseDto; error?: string }> {
    try {
      const league = await this.leagueService.getLeagueByIdForUser(userId, leagueId);
      if (!league) {
        return { success: false, error: "League not found" };
      }
      return { success: true, data: league };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }

  async getLeagueByInviteCode(inviteCode: string): Promise<{ success: boolean; data?: LeagueResponseDto; error?: string }> {
    try {
      const league = await this.leagueService.getLeagueByInviteCode(inviteCode);
      if (!league) {
        return { success: false, error: "League not found with this invite code" };
      }
      return { success: true, data: league };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }

  async getUserLeagues(userId: string): Promise<{ success: boolean; data?: LeagueResponseDto[]; error?: string }> {
    try {
      const leagues = await this.leagueService.getUserLeagues(userId);
      return { success: true, data: leagues };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }

  async canJoinLeague(leagueId: string): Promise<{ success: boolean; canJoin: boolean; reason?: string; error?: string }> {
    try {
      const result = await this.leagueService.canJoinLeague(leagueId);
      return { success: true, ...result };
    } catch (error) {
      return { success: false, canJoin: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }

  async getAllLeagues(): Promise<{ success: boolean; data?: LeagueResponseDto[]; error?: string }> {
    try {
      const leagues = await this.leagueService.getAllLeagues();
      return { success: true, data: leagues };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }

  async joinLeague(userId: string, body: Record<string, unknown>): Promise<{ success: boolean; data?: LeagueResponseDto; error?: string }> {
    try {
      const inviteCode = typeof body.inviteCode === "string" ? body.inviteCode : "";
      const league = await this.leagueService.joinLeague(userId, inviteCode);
      return { success: true, data: league };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }
}
