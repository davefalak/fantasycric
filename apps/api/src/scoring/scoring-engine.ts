export type LeadershipRole = "NONE" | "CAPTAIN" | "VICE_CAPTAIN";

export interface MatchBonuses {
  isManOfTheMatch?: boolean;
  inPlayingXI?: boolean;
  isWinningTeamStarter?: boolean;
  isImpactPlayer?: boolean;
  leadershipRole?: LeadershipRole;
}

export interface BattingStats {
  runs?: number;
  balls?: number;
  fours?: number;
  sixes?: number;
  dismissed?: boolean;
}

export interface BowlingStats {
  wickets?: number;
  dotBalls?: number;
  wides?: number;
  noBalls?: number;
  maidens?: number;
  lbwOrBowledWickets?: number;
  oversBowled?: number;
  runsConceded?: number;
}

export interface FieldingStats {
  catches?: number;
  stumpings?: number;
  runOutDirect?: number;
  runOutIndirect?: number;
}

export interface PlayerMatchStats {
  batting?: BattingStats;
  bowling?: BowlingStats;
  fielding?: FieldingStats;
  bonuses?: MatchBonuses;
}

export interface RateBand {
  min?: number;
  max?: number;
  points: number;
}

export interface ThresholdBonus {
  threshold: number;
  points: number;
}

export interface ScoringRules {
  manOfTheMatch: number;
  playingXI: number;
  winningTeamStarter: number;
  impactPlayer: number;

  batting: {
    perRun: number;
    perFour: number;
    perSix: number;
    duckPenalty: number;
    milestones: ThresholdBonus[];
    runRate: {
      minimumBalls: number;
      bands: RateBand[];
    };
  };

  bowling: {
    perWicket: number;
    perDotBall: number;
    perWide: number;
    perNoBall: number;
    perMaiden: number;
    perLbwOrBowledWicket: number;
    milestones: ThresholdBonus[];
    economy: {
      minimumOvers: number;
      bands: RateBand[];
    };
  };

  fielding: {
    perCatch: number;
    perStumping: number;
    perDirectRunOut: number;
    perIndirectRunOut: number;
    catchBonusMinCatches: number;
    catchBonusPoints: number;
  };

  leadershipMultiplier: {
    captain: number;
    viceCaptain: number;
  };
}

// Ranges and milestone bonuses are configurable; these defaults are provided
// so the engine can run immediately and be tuned per league.
export const DEFAULT_SCORING_RULES: ScoringRules = {
  manOfTheMatch: 50,
  playingXI: 5,
  winningTeamStarter: 5,
  impactPlayer: 5,
  batting: {
    perRun: 1,
    perFour: 1,
    perSix: 2,
    duckPenalty: -10,
    milestones: [
      { threshold: 25, points: 4 },
      { threshold: 40, points: 8 },
      { threshold: 60, points: 12 },
      { threshold: 80, points: 16 },
      { threshold: 100, points: 20 },
      { threshold: 125, points: 25 }
    ],
    runRate: {
      minimumBalls: 10,
      bands: [
        { min: 170, points: 6 },
        { min: 150, max: 169.99, points: 4 },
        { min: 130, max: 149.99, points: 2 },
        { min: 60, max: 69.99, points: -2 },
        { min: 50, max: 59.99, points: -4 },
        { max: 49.99, points: -6 }
      ]
    }
  },
  bowling: {
    perWicket: 40,
    perDotBall: 1,
    perWide: -2,
    perNoBall: -5,
    perMaiden: 25,
    perLbwOrBowledWicket: 5,
    milestones: [
      { threshold: 2, points: 4 },
      { threshold: 3, points: 8 },
      { threshold: 4, points: 12 },
      { threshold: 5, points: 16 },
      { threshold: 6, points: 20 }
    ],
    economy: {
      minimumOvers: 2,
      bands: [
        { max: 4.99, points: 6 },
        { min: 5, max: 5.99, points: 4 },
        { min: 6, max: 6.99, points: 2 },
        { min: 10, max: 10.99, points: -2 },
        { min: 11, max: 11.99, points: -4 },
        { min: 12, points: -6 }
      ]
    }
  },
  fielding: {
    perCatch: 10,
    perStumping: 20,
    perDirectRunOut: 10,
    perIndirectRunOut: 10,
    catchBonusMinCatches: 2,
    catchBonusPoints: 10
  },
  leadershipMultiplier: {
    captain: 2,
    viceCaptain: 1.5
  }
};

export interface ScoreBreakdown {
  batting: number;
  bowling: number;
  fielding: number;
  bonuses: number;
  subtotal: number;
  multiplier: number;
  total: number;
}

function n(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function milestoneBonus(value: number, milestones: ThresholdBonus[]): number {
  let best = 0;
  for (const rule of milestones) {
    if (value >= rule.threshold) {
      best = Math.max(best, rule.points);
    }
  }
  return best;
}

function bandPoints(value: number, bands: RateBand[]): number {
  for (const band of bands) {
    const minOk = band.min === undefined || value >= band.min;
    const maxOk = band.max === undefined || value <= band.max;
    if (minOk && maxOk) {
      return band.points;
    }
  }
  return 0;
}

function battingPoints(stats: BattingStats | undefined, rules: ScoringRules): number {
  const runs = n(stats?.runs);
  const balls = n(stats?.balls);
  const fours = n(stats?.fours);
  const sixes = n(stats?.sixes);
  const dismissed = Boolean(stats?.dismissed);

  let points = 0;
  points += runs * rules.batting.perRun;
  points += fours * rules.batting.perFour;
  points += sixes * rules.batting.perSix;

  if (dismissed && runs === 0) {
    points += rules.batting.duckPenalty;
  }

  points += milestoneBonus(runs, rules.batting.milestones);

  if (balls >= rules.batting.runRate.minimumBalls && balls > 0) {
    const runRate = (runs / balls) * 100;
    points += bandPoints(runRate, rules.batting.runRate.bands);
  }

  return points;
}

function bowlingPoints(stats: BowlingStats | undefined, rules: ScoringRules): number {
  const wickets = n(stats?.wickets);
  const dotBalls = n(stats?.dotBalls);
  const wides = n(stats?.wides);
  const noBalls = n(stats?.noBalls);
  const maidens = n(stats?.maidens);
  const lbwOrBowledWickets = n(stats?.lbwOrBowledWickets);
  const oversBowled = n(stats?.oversBowled);
  const runsConceded = n(stats?.runsConceded);

  let points = 0;
  points += wickets * rules.bowling.perWicket;
  points += dotBalls * rules.bowling.perDotBall;
  points += wides * rules.bowling.perWide;
  points += noBalls * rules.bowling.perNoBall;
  points += maidens * rules.bowling.perMaiden;
  points += lbwOrBowledWickets * rules.bowling.perLbwOrBowledWicket;

  points += milestoneBonus(wickets, rules.bowling.milestones);

  if (oversBowled >= rules.bowling.economy.minimumOvers && oversBowled > 0) {
    const economy = runsConceded / oversBowled;
    points += bandPoints(economy, rules.bowling.economy.bands);
  }

  return points;
}

function fieldingPoints(stats: FieldingStats | undefined, rules: ScoringRules): number {
  const catches = n(stats?.catches);
  const stumpings = n(stats?.stumpings);
  const runOutDirect = n(stats?.runOutDirect);
  const runOutIndirect = n(stats?.runOutIndirect);

  let points = 0;
  points += catches * rules.fielding.perCatch;
  points += stumpings * rules.fielding.perStumping;
  points += runOutDirect * rules.fielding.perDirectRunOut;
  points += runOutIndirect * rules.fielding.perIndirectRunOut;

  if (catches >= rules.fielding.catchBonusMinCatches) {
    points += rules.fielding.catchBonusPoints;
  }

  return points;
}

function miscBonuses(bonuses: MatchBonuses | undefined, rules: ScoringRules): number {
  let points = 0;
  if (bonuses?.isManOfTheMatch) {
    points += rules.manOfTheMatch;
  }
  if (bonuses?.inPlayingXI) {
    points += rules.playingXI;
  }
  if (bonuses?.isWinningTeamStarter) {
    points += rules.winningTeamStarter;
  }
  if (bonuses?.isImpactPlayer) {
    points += rules.impactPlayer;
  }
  return points;
}

function getMultiplier(role: LeadershipRole | undefined, rules: ScoringRules): number {
  if (role === "CAPTAIN") {
    return rules.leadershipMultiplier.captain;
  }
  if (role === "VICE_CAPTAIN") {
    return rules.leadershipMultiplier.viceCaptain;
  }
  return 1;
}

export function scorePlayerMatch(
  playerStats: PlayerMatchStats,
  rules: ScoringRules = DEFAULT_SCORING_RULES
): ScoreBreakdown {
  const batting = battingPoints(playerStats.batting, rules);
  const bowling = bowlingPoints(playerStats.bowling, rules);
  const fielding = fieldingPoints(playerStats.fielding, rules);
  const bonuses = miscBonuses(playerStats.bonuses, rules);

  const subtotal = batting + bowling + fielding + bonuses;
  const multiplier = getMultiplier(playerStats.bonuses?.leadershipRole, rules);
  const total = Math.round(subtotal * multiplier * 100) / 100;

  return {
    batting,
    bowling,
    fielding,
    bonuses,
    subtotal,
    multiplier,
    total
  };
}
