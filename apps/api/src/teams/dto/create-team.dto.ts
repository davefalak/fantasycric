import type { TeamPlayerRecord } from "../../common/runtime-store.ts";

export class CreateTeamDto {
  leagueId: string;
  gameDay: string;
  teamName: string;
  players: TeamPlayerRecord[];
  captainPlayerId: string;
  viceCaptainPlayerId: string;

  constructor(data: Record<string, unknown>) {
    this.leagueId = typeof data.leagueId === "string" ? data.leagueId : "";
    this.gameDay = typeof data.gameDay === "string" ? data.gameDay.slice(0, 10) : new Date().toISOString().slice(0, 10);
    this.teamName = typeof data.teamName === "string" ? data.teamName : "";
    this.players = Array.isArray(data.players) ? (data.players as TeamPlayerRecord[]) : [];
    this.captainPlayerId = typeof data.captainPlayerId === "string" ? data.captainPlayerId : "";
    this.viceCaptainPlayerId = typeof data.viceCaptainPlayerId === "string" ? data.viceCaptainPlayerId : "";
  }

  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.leagueId) {
      errors.push("League ID is required");
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(this.gameDay)) {
      errors.push("gameDay must be in YYYY-MM-DD format");
    }

    if (!this.teamName.trim()) {
      errors.push("Team name is required");
    }

    if (this.teamName.length > 100) {
      errors.push("Team name must be 100 characters or less");
    }

    if (this.players.length !== 11) {
      errors.push("A fantasy team must contain exactly 11 players");
    }

    const seenIds = new Set<string>();
    for (const player of this.players) {
      if (!player.playerId || !player.playerName || !player.teamCode || !player.role) {
        errors.push("Each player entry must include id, name, team code, and role");
        break;
      }

      if (typeof player.cost !== "number" || player.cost <= 0) {
        errors.push("Each player must have a positive cost");
        break;
      }

      if (seenIds.has(player.playerId)) {
        errors.push("Players cannot be selected more than once");
        break;
      }
      seenIds.add(player.playerId);
    }

    if (!this.captainPlayerId || !seenIds.has(this.captainPlayerId)) {
      errors.push("Captain must be one of the selected players");
    }

    if (!this.viceCaptainPlayerId || !seenIds.has(this.viceCaptainPlayerId)) {
      errors.push("Vice-captain must be one of the selected players");
    }

    if (this.captainPlayerId && this.captainPlayerId === this.viceCaptainPlayerId) {
      errors.push("Captain and vice-captain must be different players");
    }

    return { valid: errors.length === 0, errors };
  }
}
