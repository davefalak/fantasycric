import { AppController } from "./app.controller.ts";
import { AppService } from "./app.service.ts";
import { AuthController } from "./auth/auth.controller.ts";
import { AuthService } from "./auth/auth.service.ts";
import { RuntimeStore } from "./common/runtime-store.ts";
import { CricbuzzLiveController } from "./live/cricbuzz-live.controller.ts";
import { CricbuzzLiveService } from "./live/cricbuzz-live.service.ts";
import { LivePollerService } from "./live/live-poller.service.ts";
import { LeagueController } from "./leagues/league.controller.ts";
import { LeagueService } from "./leagues/league.service.ts";
import { PlayerController } from "./players/player.controller.ts";
import { PlayerService } from "./players/player.service.ts";
import { ScheduleController } from "./schedule/schedule.controller.ts";
import { ScheduleService } from "./schedule/schedule.service.ts";
import { TeamController } from "./teams/team.controller.ts";
import { TeamService } from "./teams/team.service.ts";

export class AppModule {
  private readonly store: RuntimeStore;
  private readonly livePoller: LivePollerService;
  readonly appController: AppController;
  readonly authController: AuthController;
  readonly leagueController: LeagueController;
  readonly liveController: CricbuzzLiveController;
  readonly playerController: PlayerController;
  readonly scheduleController: ScheduleController;
  readonly teamController: TeamController;

  constructor(store = new RuntimeStore()) {
    this.store = store;
    const appService = new AppService();
    const authService = new AuthService(store);
    const liveService = new CricbuzzLiveService();
    this.livePoller = new LivePollerService(liveService);
    const playerService = new PlayerService(store);
    const scheduleService = new ScheduleService(store);
    const leagueService = new LeagueService(store, scheduleService);
    const teamService = new TeamService(store);

    this.appController = new AppController(appService);
    this.authController = new AuthController(authService);
    this.leagueController = new LeagueController(leagueService);
    this.liveController = new CricbuzzLiveController(liveService, this.livePoller);
    this.playerController = new PlayerController(playerService);
    this.scheduleController = new ScheduleController(scheduleService);
    this.teamController = new TeamController(teamService);
  }

  async initialize(): Promise<void> {
    await this.store.ensureLeagueSchemaCompat();

    const shouldAutoStart = process.env.LIVE_POLL_AUTO_START !== "false";
    if (shouldAutoStart) {
      this.livePoller.start({
        provider: (process.env.LIVE_PROVIDER as "auto" | "cricbuzz" | "espn" | "cricapi" | "cricketdata") || "auto",
        intervalMs: Number(process.env.LIVE_POLL_INTERVAL_MS || 60_000),
        proxy: process.env.LIVE_PROVIDER_PROXY !== "false",
        sample: process.env.LIVE_POLL_SAMPLE === "true",
        matchId: process.env.LIVE_MATCH_ID || undefined
      });
    }
  }
}
