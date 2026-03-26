const test = require("node:test");
const assert = require("node:assert/strict");
const { RuntimeStore } = require("../src/common/runtime-store.ts");
const { LeagueService } = require("../src/leagues/league.service.ts");
const { CreateLeagueDto } = require("../src/leagues/dto/create-league.dto.ts");
const { TeamService } = require("../src/teams/team.service.ts");
const { CreateTeamDto } = require("../src/teams/dto/create-team.dto.ts");

async function createStore() {
  const store = new RuntimeStore(process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/fantasy_ipl_2026");
  await store.ensureLeagueSchemaCompat();
  await store.reset();
  return store;
}

function makePlayers() {
  return [
    { playerId: "wk1", playerName: "Keeper One", teamCode: "MI", role: "WK", cost: 8 },
    { playerId: "bat1", playerName: "Batter One", teamCode: "CSK", role: "BAT", cost: 9 },
    { playerId: "bat2", playerName: "Batter Two", teamCode: "RCB", role: "BAT", cost: 9 },
    { playerId: "bat3", playerName: "Batter Three", teamCode: "GT", role: "BAT", cost: 8 },
    { playerId: "bat4", playerName: "Batter Four", teamCode: "DC", role: "BAT", cost: 8 },
    { playerId: "ar1", playerName: "Allrounder One", teamCode: "RR", role: "AR", cost: 10 },
    { playerId: "ar2", playerName: "Allrounder Two", teamCode: "LSG", role: "AR", cost: 9 },
    { playerId: "bowl1", playerName: "Bowler One", teamCode: "SRH", role: "BOWL", cost: 8 },
    { playerId: "bowl2", playerName: "Bowler Two", teamCode: "PBKS", role: "BOWL", cost: 7 },
    { playerId: "bowl3", playerName: "Bowler Three", teamCode: "KKR", role: "BOWL", cost: 7 },
    { playerId: "bowl4", playerName: "Bowler Four", teamCode: "MI", role: "BOWL", cost: 7 }
  ];
}

test("league creation persists creator membership and supports invite join", async () => {
  const store = await createStore();
  const leagueService = new LeagueService(store);
  const joinDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const league = await leagueService.createLeague(
    "owner-1",
    new CreateLeagueDto({
      name: "Weekend Warriors",
      memberLimit: 4,
      totalBudget: 100,
      joinDeadline,
      scoringPreferences: { wicket: 25 }
    })
  );

  assert.equal(league.name, "Weekend Warriors");
  assert.equal(league.memberCount, 1);
  assert.equal(league.scoringPreferences.wicket, 25);

  const userLeagues = await leagueService.getUserLeagues("owner-1");
  assert.equal(userLeagues.length, 1);

  const joined = await leagueService.joinLeague("friend-1", league.inviteCode);
  assert.equal(joined.memberCount, 2);

  const canJoin = await leagueService.canJoinLeague(league.id);
  assert.equal(canJoin.canJoin, true);
});

test("team creation enforces budget and role composition", async () => {
  const store = await createStore();
  const leagueService = new LeagueService(store);
  const teamService = new TeamService(store);
  const joinDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const league = await leagueService.createLeague(
    "owner-1",
    new CreateLeagueDto({
      name: "Mega League",
      memberLimit: 6,
      totalBudget: 100,
      joinDeadline
    })
  );

  await leagueService.joinLeague("friend-1", league.inviteCode);

  const team = await teamService.createOrUpdateTeam(
    "friend-1",
    new CreateTeamDto({
      leagueId: league.id,
      gameDay: "2026-03-28",
      teamName: "Boundary Riders",
      players: makePlayers(),
      captainPlayerId: "ar1",
      viceCaptainPlayerId: "bat1"
    })
  );

  assert.equal(team.totalBudgetUsed, 90);
  assert.equal(team.players.length, 11);

  await assert.rejects(
    () => teamService.createOrUpdateTeam(
      "friend-1",
      new CreateTeamDto({
        leagueId: league.id,
        gameDay: "2026-03-28",
        teamName: "Too Expensive",
        players: makePlayers().map((player) => ({ ...player, cost: 15 })),
        captainPlayerId: "ar1",
        viceCaptainPlayerId: "bat1"
      })
    ),
    /Team validation failed: Team exceeds the league budget/
  );
});
