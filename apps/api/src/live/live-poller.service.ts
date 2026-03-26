import type { CricbuzzLivePreview } from "./cricbuzz-live.service.ts";
import { CricbuzzLiveService } from "./cricbuzz-live.service.ts";

export interface LivePollerConfig {
  provider: "auto" | "cricbuzz" | "espn" | "cricapi" | "cricketdata";
  matchId?: string;
  intervalMs: number;
  proxy: boolean;
  sample: boolean;
}

export interface LivePollerStatus {
  running: boolean;
  lastSuccessAt?: string;
  lastError?: string;
  tickCount: number;
  config: LivePollerConfig;
  latest?: CricbuzzLivePreview;
}

export class LivePollerService {
  private readonly liveService: CricbuzzLiveService;
  private timer: NodeJS.Timeout | null = null;
  private status: LivePollerStatus;

  constructor(liveService: CricbuzzLiveService) {
    this.liveService = liveService;
    this.status = {
      running: false,
      tickCount: 0,
      config: {
        provider: "auto",
        intervalMs: 60_000,
        proxy: true,
        sample: false
      }
    };
  }

  start(partial?: Partial<LivePollerConfig>): LivePollerStatus {
    const nextConfig: LivePollerConfig = {
      ...this.status.config,
      ...(partial || {})
    };

    if (nextConfig.intervalMs < 10_000) {
      nextConfig.intervalMs = 10_000;
    }

    this.stop();
    this.status.config = nextConfig;
    this.status.running = true;
    this.status.lastError = undefined;

    // Run immediately, then interval.
    void this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, nextConfig.intervalMs);

    return this.getStatus();
  }

  stop(): LivePollerStatus {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.status.running = false;
    return this.getStatus();
  }

  getStatus(): LivePollerStatus {
    return {
      ...this.status,
      config: { ...this.status.config }
    };
  }

  getLatest(): CricbuzzLivePreview | undefined {
    return this.status.latest;
  }

  private async tick(): Promise<void> {
    this.status.tickCount += 1;
    try {
      const preview = await this.liveService.getLivePreview(
        this.status.config.matchId,
        this.status.config.sample,
        this.status.config.proxy,
        this.status.config.provider
      );
      this.status.latest = preview;
      this.status.lastSuccessAt = new Date().toISOString();
      this.status.lastError = undefined;
    } catch (error) {
      this.status.lastError = error instanceof Error ? error.message : "Unknown poller error";
    }
  }
}
