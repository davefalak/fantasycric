export type LeagueState = "draft" | "active" | "concluded";

export interface LeagueSettings {
  memberLimit: number;
  totalBudget: number;
  joinDeadline: string;
  scoringPreferences: Record<string, unknown>;
}

export interface CreateLeagueRequest {
  name: string;
  description?: string;
  memberLimit: number;
  totalBudget: number;
  joinDeadline: string;
  scoringPreferences?: Record<string, unknown>;
}

export interface League {
  id: string;
  creatorId: string;
  name: string;
  description?: string;
  memberLimit: number;
  totalBudget: number;
  joinDeadline: string;
  scoringPreferences: Record<string, unknown>;
  state: LeagueState;
  inviteCode: string;
  memberCount: number;
  createdAt: string;
  startsAt?: string;
  endsAt?: string;
}

export interface LeagueMember {
  id: string;
  leagueId: string;
  userId: string;
  joinedAt: string;
}

export interface JoinLeagueRequest {
  inviteCode: string;
}

export interface LeagueJoinEligibility {
  canJoin: boolean;
  reason?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
