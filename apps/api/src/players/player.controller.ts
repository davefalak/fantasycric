import { PlayerService } from "./player.service.ts";
import type { IplPlayerRecord, PlayerTeamSummary } from "../common/runtime-store.ts";

type PlayerResponse<T> = { success: boolean; data?: T; error?: string };

export class PlayerController {
  private readonly playerService: PlayerService;

  constructor(playerService: PlayerService) {
    this.playerService = playerService;
  }

  async getPlayers(query: URLSearchParams): Promise<PlayerResponse<IplPlayerRecord[]>> {
    try {
      const players = await this.playerService.getPlayers({
        teamCode: query.get("teamCode") || undefined,
        role: query.get("role") || undefined,
        status: query.get("status") || undefined,
        q: query.get("q") || undefined,
        overseas: query.get("overseas") || undefined
      });
      return { success: true, data: players };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }

  async getTeamSummaries(): Promise<PlayerResponse<PlayerTeamSummary[]>> {
    try {
      const teams = await this.playerService.getTeamSummaries();
      return { success: true, data: teams };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }
}