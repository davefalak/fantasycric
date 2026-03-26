const test = require("node:test");
const assert = require("node:assert/strict");

const { scorePlayerMatch, DEFAULT_SCORING_RULES } = require("../src/scoring/scoring-engine.ts");

test("applies explicit bonuses and captain multiplier", () => {
  const result = scorePlayerMatch(
    {
      batting: {
        runs: 50,
        balls: 30,
        fours: 4,
        sixes: 2,
        dismissed: false
      },
      bonuses: {
        isManOfTheMatch: true,
        inPlayingXI: true,
        isWinningTeamStarter: true,
        isImpactPlayer: true,
        leadershipRole: "CAPTAIN"
      }
    },
    {
      ...DEFAULT_SCORING_RULES,
      batting: {
        ...DEFAULT_SCORING_RULES.batting,
        milestones: [],
        runRate: {
          minimumBalls: 999,
          bands: []
        }
      }
    }
  );

  // Batting: 50 runs + 4 fours + (2*2) sixes = 58
  // Bonuses: 50 + 5 + 5 + 5 = 65
  // Subtotal: 123, Captain multiplier 2x => 246
  assert.equal(result.subtotal, 123);
  assert.equal(result.multiplier, 2);
  assert.equal(result.total, 246);
});

test("duck penalty is applied when dismissed on zero", () => {
  const result = scorePlayerMatch(
    {
      batting: {
        runs: 0,
        balls: 12,
        dismissed: true
      }
    },
    {
      ...DEFAULT_SCORING_RULES,
      batting: {
        ...DEFAULT_SCORING_RULES.batting,
        milestones: [],
        runRate: {
          minimumBalls: 999,
          bands: []
        }
      }
    }
  );

  assert.equal(result.batting, -10);
  assert.equal(result.total, -10);
});

test("bowling economy bonus applies only at 2+ overs", () => {
  const lessThan2Overs = scorePlayerMatch({
    bowling: {
      oversBowled: 1.5,
      runsConceded: 3
    }
  });

  const twoOvers = scorePlayerMatch({
    bowling: {
      oversBowled: 2,
      runsConceded: 6
    }
  });

  assert.equal(lessThan2Overs.bowling, 0);
  assert.notEqual(twoOvers.bowling, 0);
});

test("lbw or bowled wickets and wicket milestones are included", () => {
  const result = scorePlayerMatch(
    {
      bowling: {
        wickets: 4,
        lbwOrBowledWickets: 2,
        dotBalls: 6,
        wides: 1,
        noBalls: 0,
        maidens: 1,
        oversBowled: 4,
        runsConceded: 24
      }
    },
    {
      ...DEFAULT_SCORING_RULES,
      bowling: {
        ...DEFAULT_SCORING_RULES.bowling,
        economy: {
          minimumOvers: 99,
          bands: []
        }
      }
    }
  );

  // wickets: 4*40=160
  // lbw/bowled: 2*5=10
  // dot balls: 6*1=6
  // wides: 1*-2=-2
  // maiden: 1*25=25
  // milestone (4 wickets): +12 (default mapping)
  assert.equal(result.bowling, 211);
});

test("vice captain multiplier is 1.5x", () => {
  const result = scorePlayerMatch(
    {
      fielding: {
        catches: 2
      },
      bonuses: {
        leadershipRole: "VICE_CAPTAIN"
      }
    },
    {
      ...DEFAULT_SCORING_RULES,
      fielding: {
        ...DEFAULT_SCORING_RULES.fielding,
        catchBonusMinCatches: 999,
        catchBonusPoints: 0
      }
    }
  );

  // 2 catches * 10 = 20, vice captain => 30
  assert.equal(result.subtotal, 20);
  assert.equal(result.multiplier, 1.5);
  assert.equal(result.total, 30);
});
