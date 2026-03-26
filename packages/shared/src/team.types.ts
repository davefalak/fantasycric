export type PlayerRole = "WK" | "BAT" | "AR" | "BOWL";

export interface TeamPlayer {
  playerId: string;
  playerName: string;
  teamCode: string;
  role: PlayerRole;
  cost: number;
}

export interface CreateTeamRequest {
  leagueId: string;
  teamName: string;
  players: TeamPlayer[];
  captainPlayerId: string;
  viceCaptainPlayerId: string;
}

export interface LeagueTeam {
  id: string;
  leagueId: string;
  userId: string;
  teamName: string;
  players: TeamPlayer[];
  captainPlayerId: string;
  viceCaptainPlayerId: string;
  totalBudgetUsed: number;
  createdAt: string;
  updatedAt: string;
  lockedAt?: string;
}
