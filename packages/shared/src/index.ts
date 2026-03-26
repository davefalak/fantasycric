export type MatchStatus = "upcoming" | "live" | "completed";

export interface MatchCard {
  id: string;
  homeTeam: string;
  awayTeam: string;
  startsAt: string;
  status: MatchStatus;
}

export * from './league.types';
export * from './team.types';
export * from './team.constants';
