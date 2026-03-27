import { CricbuzzLiveService, type CricbuzzLivePreview, type LiveMatchHints, type LiveProvider, type ScorecardFantasyResult } from "./cricbuzz-live.service.ts";
import { LivePollerService, type LivePollerStatus } from "./live-poller.service.ts";

type ApiResponse<T> = { success: boolean; data?: T; error?: string };

export class CricbuzzLiveController {
  private readonly service: CricbuzzLiveService;
  private readonly poller: LivePollerService;

  constructor(service: CricbuzzLiveService, poller: LivePollerService) {
    this.service = service;
    this.poller = poller;
  }

  async getPreview(
    matchId?: string,
    sample = false,
    proxy = true,
    provider: LiveProvider = "auto",
    safe = false,
    hints?: LiveMatchHints
  ): Promise<ApiResponse<CricbuzzLivePreview>> {
    try {
      const preview = await this.service.getLivePreview(matchId, sample, proxy, provider, hints);
      return { success: true, data: preview };
    } catch (error) {
      if (safe) {
        const fallback = await this.service.getHealthStatus();
        console.warn("[LIVE] Returning safe-mode fallback. Health:", fallback);
        return {
          success: true,
          data: (this.service as any).buildFallbackSample(matchId, [
            error instanceof Error ? error.message : "Unknown error",
            `Safe mode enabled. Dependencies: ${JSON.stringify(fallback)}`
          ])
        };
      }
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }

  async getScorecardFantasyPoints(
    matchId?: string
  ): Promise<ApiResponse<ScorecardFantasyResult>> {
    if (!matchId) {
      return { success: false, error: "matchId query parameter is required (e.g. ?matchId=0579cb05-5cd8-493e-a513-24c4d074394f)" };
    }
    try {
      const result = await this.service.getScorecardWithFantasyPoints(matchId);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }

  async getHealthStatus(): Promise<ApiResponse<Record<string, unknown>>> {
    const status = await this.service.getHealthStatus();
    return {
      success: true,
      data: {
        espn: status.espn,
        cricbuzz: status.cricbuzz,
        cricketdata: status.cricketdata,
        message: status.message
      }
    };
  }

  startPoller(config?: Partial<{ provider: LiveProvider; matchId: string; intervalMs: number; proxy: boolean; sample: boolean }>): ApiResponse<LivePollerStatus> {
    try {
      const status = this.poller.start(config || {});
      return { success: true, data: status };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }

  stopPoller(): ApiResponse<LivePollerStatus> {
    try {
      const status = this.poller.stop();
      return { success: true, data: status };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }

  getPollerStatus(): ApiResponse<LivePollerStatus> {
    try {
      return { success: true, data: this.poller.getStatus() };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }

  getLatestFromPoller(): ApiResponse<CricbuzzLivePreview | null> {
    try {
      return { success: true, data: this.poller.getLatest() || null };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }
}
