import { type IplPlayerRecord, type PlayerTeamSummary, RuntimeStore } from "../common/runtime-store.ts";

export class PlayerService {
  private readonly store: RuntimeStore;

  constructor(store: RuntimeStore) {
    this.store = store;
  }

  async getPlayers(filters?: { teamCode?: string; role?: string; status?: string; q?: string; overseas?: string }): Promise<IplPlayerRecord[]> {
    return this.store.getPlayers(filters);
  }

  async getTeamSummaries(): Promise<PlayerTeamSummary[]> {
    return this.store.getPlayerTeamSummaries();
  }
}