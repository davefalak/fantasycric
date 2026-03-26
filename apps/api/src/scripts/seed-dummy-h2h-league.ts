import { RuntimeStore } from "../common/runtime-store.ts";
import { LeagueService } from "../leagues/league.service.ts";
import { CreateLeagueDto } from "../leagues/dto/create-league.dto.ts";
import { ScheduleService } from "../schedule/schedule.service.ts";

async function seedDummyLeague(): Promise<void> {
  const store = new RuntimeStore();
  await store.ensureLeagueSchemaCompat();
  const leagueService = new LeagueService(store);
  const scheduleService = new ScheduleService(store);

  const ownerId = "dummy-user-01";
  const league = await leagueService.createLeague(
    ownerId,
    new CreateLeagueDto({
      name: "IPL 2026 Dummy H2H League",
      description: "Auto-generated league for daily IPL game-day testing",
      memberLimit: 10,
      totalBudget: 100,
      joinDeadline: "2026-05-24T14:00:00.000Z",
      scoringPreferences: {
        format: "head-to-head",
        dailyTeamReset: true,
        lockWindowMinutesBeforeFirstMatch: 30
      }
    })
  );

  const userIds = [ownerId];
  for (let index = 2; index <= 10; index += 1) {
    const userId = `dummy-user-${String(index).padStart(2, "0")}`;
    await leagueService.joinLeague(userId, league.inviteCode);
    userIds.push(userId);
  }

  const fixtures = await scheduleService.generateHeadToHeadFixtures(league.id, userIds);
  const uniqueDays = new Set(fixtures.map((fixture) => fixture.gameDay));

  console.log(JSON.stringify({
    success: true,
    leagueId: league.id,
    inviteCode: league.inviteCode,
    memberCount: userIds.length,
    gameDaysScheduled: uniqueDays.size,
    headToHeadFixtures: fixtures.length,
    firstGameDay: [...uniqueDays][0]
  }, null, 2));
}

void seedDummyLeague();
