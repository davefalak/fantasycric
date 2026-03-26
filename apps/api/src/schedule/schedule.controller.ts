import type { HeadToHeadFixture, LeagueTableRow, LiveFixtureScore, ScheduleService } from "./schedule.service.ts";
import type { IplGameDay } from "./ipl-2026-schedule.ts";

type ApiResponse<T> = { success: boolean; data?: T; error?: string };

export class ScheduleController {
  private readonly scheduleService: ScheduleService;

  constructor(scheduleService: ScheduleService) {
    this.scheduleService = scheduleService;
  }

  getIpl2026Schedule(): ApiResponse<IplGameDay[]> {
    try {
      return { success: true, data: this.scheduleService.getIpl2026Schedule() };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }

  async getLeagueHeadToHeadFixtures(userId: string, leagueId: string, gameDay?: string): Promise<ApiResponse<HeadToHeadFixture[]>> {
    try {
      const fixtures = await this.scheduleService.getLeagueHeadToHeadFixtures(userId, leagueId, gameDay);
      return { success: true, data: fixtures };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }

  async getLeagueTable(userId: string, leagueId: string, throughGameDay?: string): Promise<ApiResponse<LeagueTableRow[]>> {
    try {
      const table = await this.scheduleService.getLeagueTable(userId, leagueId, throughGameDay);
      return { success: true, data: table };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }

  async getLeagueLiveMatchups(userId: string, leagueId: string, gameDay?: string): Promise<ApiResponse<LiveFixtureScore[]>> {
    try {
      const live = await this.scheduleService.getLeagueLiveMatchups(userId, leagueId, gameDay);
      return { success: true, data: live };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }
}
