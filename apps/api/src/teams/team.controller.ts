import { CreateTeamDto } from "./dto/create-team.dto.ts";
import { TeamService } from "./team.service.ts";
import type { LeagueTeamRecord } from "../common/runtime-store.ts";
import type { LeagueTeamViewRecord } from "./team.service.ts";

type TeamResponse<T> = { success: boolean; data?: T; error?: string };

export class TeamController {
  private readonly teamService: TeamService;

  constructor(teamService: TeamService) {
    this.teamService = teamService;
  }

  async createTeam(userId: string, body: Record<string, unknown>): Promise<TeamResponse<LeagueTeamRecord>> {
    try {
      const dto = new CreateTeamDto(body);
      const team = await this.teamService.createOrUpdateTeam(userId, dto);
      return { success: true, data: team };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }

  async getLeagueTeams(viewerUserId: string, leagueId: string, gameDay?: string): Promise<TeamResponse<LeagueTeamViewRecord[]>> {
    try {
      const teams = await this.teamService.getLeagueTeams(viewerUserId, leagueId, gameDay);
      return { success: true, data: teams };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }

  async getUserTeam(leagueId: string, userId: string, gameDay?: string): Promise<TeamResponse<LeagueTeamRecord | null>> {
    try {
      const team = await this.teamService.getUserTeam(leagueId, userId, gameDay);
      return { success: true, data: team };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }

  async getLeagueTeamName(userId: string, leagueId: string): Promise<TeamResponse<{ teamName: string }>> {
    try {
      const teamName = await this.teamService.getLeagueTeamName(userId, leagueId);
      return { success: true, data: { teamName } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }

  async updateLeagueTeamName(userId: string, leagueId: string, body: Record<string, unknown>): Promise<TeamResponse<{ teamName: string }>> {
    try {
      const teamName = typeof body.teamName === "string" ? body.teamName : "";
      const saved = await this.teamService.updateLeagueTeamName(userId, leagueId, teamName);
      return { success: true, data: { teamName: saved } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }
}
