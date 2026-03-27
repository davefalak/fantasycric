import { scorePlayerMatch, type ScoreBreakdown } from "../scoring/scoring-engine.ts";

export type LiveProvider = "auto" | "espn" | "cricbuzz" | "cricketdata";

export interface LiveMatchHints {
  teamA?: string;
  teamB?: string;
  series?: string;
}

export interface LiveMatchSummary {
  matchId: string;
  url: string;
}

export interface LiveBattingStat {
  playerName: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  strikeRate: number;
  dismissal?: string;
}

export interface LiveBowlingStat {
  playerName: string;
  overs: number;
  maidens: number;
  runsConceded: number;
  wickets: number;
}

export interface LiveFantasyPlayerStat {
  playerName: string;
  batting: {
    runs: number;
    balls: number;
    fours: number;
    sixes: number;
  };
  bowling: {
    wickets: number;
    maidens: number;
    oversBowled: number;
    runsConceded: number;
  };
  fielding: {
    catches: number;
    stumpings: number;
    runOutDirect: number;
    runOutIndirect: number;
  };
  fantasyPreviewPoints: number;
}

export interface ScorecardBatting {
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  strikeRate: number;
  dismissed: boolean;
  dismissalText: string;
}

export interface ScorecardBowling {
  overs: number;
  maidens: number;
  runsConceded: number;
  wickets: number;
  wides: number;
  noBalls: number;
  economy: number;
  lbwOrBowledWickets: number;
}

export interface ScorecardFielding {
  catches: number;
  stumpings: number;
  runOutIndirect: number;
}

export interface ScorecardFantasyPlayer {
  playerId: string;
  playerName: string;
  team: string;
  batting: ScorecardBatting | null;
  bowling: ScorecardBowling | null;
  fielding: ScorecardFielding;
  fantasyPoints: number;
  breakdown: ScoreBreakdown;
}

export interface ScorecardFantasyResult {
  matchId: string;
  matchName: string;
  status: string;
  fetchedAt: string;
  teams: string[];
  innings: string[];
  players: ScorecardFantasyPlayer[];
  notes: string[];
}

export interface CricbuzzLivePreview {
  source: "cricbuzz" | "espn" | "cricketdata";
  fetchedAt: string;
  matchId: string;
  matchUrl: string;
  fetchedFromUrl: string;
  scoreText?: string;
  batting: LiveBattingStat[];
  bowling: LiveBowlingStat[];
  fantasyPlayers: LiveFantasyPlayerStat[];
  notes: string[];
}

export class CricbuzzLiveService {
  private readonly baseUrl: string;
  private readonly cricketDataApiBase: string;
  private readonly cricketDataApiKey: string;
  private readonly cricketDataCacheTtlMs: number;
  private readonly cricketDataDailyHitBudget: number;
  private readonly cricketDataCache = new Map<string, { preview: CricbuzzLivePreview; expiresAt: number }>();
  private cricketDataHitsDayKey: string;
  private cricketDataHitsUsedToday: number;

  constructor(baseUrl = process.env.CRICBUZZ_BASE_URL || "https://www.cricbuzz.com") {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.cricketDataApiBase = (process.env.CRICKETDATA_API_BASE || "https://api.cricapi.com/v1").replace(/\/$/, "");
    this.cricketDataApiKey = process.env.CRICKETDATA_API_KEY || "dfeec2e3-8dc7-4db0-8836-ad186dbb5bd0";
    this.cricketDataCacheTtlMs = Math.max(60_000, Number(process.env.CRICKETDATA_CACHE_TTL_MS || 900_000));
    this.cricketDataDailyHitBudget = Math.max(1, Number(process.env.CRICKETDATA_DAILY_HIT_BUDGET || 90));
    this.cricketDataHitsDayKey = this.getUtcDayKey();
    this.cricketDataHitsUsedToday = 0;
  }

  async getLivePreview(
    matchId?: string,
    useSample = false,
    allowProxy = true,
    provider: LiveProvider = "auto",
    hints?: LiveMatchHints
  ): Promise<CricbuzzLivePreview> {
    if (useSample) {
      return this.getSamplePreview(matchId || "148962");
    }

    if (provider === "espn") {
      return this.getEspnPreview(matchId, allowProxy, hints);
    }

    if (provider === "cricbuzz") {
      return this.getCricbuzzPreview(matchId, allowProxy, hints);
    }

    if (provider === "cricketdata") {
      return this.getCricketDataPreview(matchId, hints);
    }

    const errors: string[] = [];
    try {
      return await this.getEspnPreview(matchId, allowProxy, hints);
    } catch (error) {
      errors.push(`espn: ${error instanceof Error ? error.message : "failed"}`);
    }

    try {
      return await this.getCricbuzzPreview(matchId, allowProxy, hints);
    } catch (error) {
      errors.push(`cricbuzz: ${error instanceof Error ? error.message : "failed"}`);
    }

    try {
      return await this.getCricketDataPreview(matchId, hints);
    } catch (error) {
      errors.push(`cricketdata: ${error instanceof Error ? error.message : "failed"}`);
    }

    return this.buildFallbackSample(matchId, errors);
  }

  private async getCricketDataPreview(matchId?: string, hints?: LiveMatchHints): Promise<CricbuzzLivePreview> {
    if (!this.cricketDataApiKey) {
      throw new Error("CRICKETDATA_API_KEY is not configured.");
    }

    const cacheKey = matchId ? `cricketdata:match:${matchId}` : "cricketdata:current";
    const cached = this.cricketDataCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return this.clonePreviewWithNote(
        cached.preview,
        `CricketData cache hit. Reusing cached response for ${Math.round(this.cricketDataCacheTtlMs / 60000)} minutes to conserve daily hits.`
      );
    }

    if (this.isCricketDataBudgetExhausted()) {
      const stale = this.getBestStaleCricketDataPreview(matchId);
      if (stale) {
        return this.clonePreviewWithNote(
          stale,
          `CricketData daily budget gate active (${this.cricketDataHitsUsedToday}/${this.cricketDataDailyHitBudget}). Serving stale cached result and skipping upstream API hit.`
        );
      }
      throw new Error(`CricketData daily budget exhausted (${this.cricketDataHitsUsedToday}/${this.cricketDataDailyHitBudget}) and no cached data is available.`);
    }

    if (matchId) {
      const payload = await this.fetchCricketDataJson("match_info", { id: matchId });
      const match = payload.data && typeof payload.data === "object"
        ? payload.data as Record<string, unknown>
        : undefined;
      if (!match) {
        throw new Error("CricketData match_info returned no match data.");
      }

      const preview = this.parseCricketDataPreview(match, `${this.cricketDataApiBase}/match_info`, "match_info", payload.info);
      this.storeCricketDataCache(cacheKey, preview);
      this.storeCricketDataCache(`cricketdata:match:${preview.matchId}`, preview);
      return preview;
    }

    const payload = await this.fetchCricketDataJson("currentMatches", { offset: "0" });
    const matches = Array.isArray(payload.data) ? payload.data as Array<Record<string, unknown>> : [];
    const picked = this.pickCurrentCricketDataMatch(matches, hints);
    if (!picked) {
      throw new Error("CricketData currentMatches returned no active match.");
    }

    const preview = this.parseCricketDataPreview(picked, `${this.cricketDataApiBase}/currentMatches`, "currentMatches", payload.info);
    this.storeCricketDataCache(cacheKey, preview);
    this.storeCricketDataCache(`cricketdata:match:${preview.matchId}`, preview);
    return preview;
  }

  async getScorecardWithFantasyPoints(matchId: string): Promise<ScorecardFantasyResult> {
    const payload = await this.fetchCricketDataJson("match_scorecard", { id: matchId });
    const data = payload.data as Record<string, unknown> | undefined;
    if (!data || !Array.isArray(data.scorecard)) {
      throw new Error(`No scorecard data found for match ${matchId}. The match may not have started or the scorecard is not available yet.`);
    }

    const teams = Array.isArray(data.teams) ? (data.teams as string[]) : [];
    const matchName = typeof data.name === "string" ? data.name : "";
    const status = typeof data.status === "string" ? data.status : "";
    const scorecardInnings = data.scorecard as Array<Record<string, unknown>>;

    interface PlayerAcc {
      id: string;
      name: string;
      team: string;
      batting: { hasBatted: boolean; runs: number; balls: number; fours: number; sixes: number; dismissed: boolean; dismissalText: string; };
      bowling: { hasBowled: boolean; wickets: number; maidens: number; runsConceded: number; wides: number; noBalls: number; oversRaw: number; lbwOrBowledWickets: number; };
      fielding: { catches: number; stumpings: number; runOutIndirect: number; };
    }

    const playerMap = new Map<string, PlayerAcc>();

    const getOrCreate = (id: string, name: string, team: string): PlayerAcc => {
      const existing = playerMap.get(id);
      if (existing) {
        if (!existing.team && team) existing.team = team;
        return existing;
      }
      const acc: PlayerAcc = {
        id, name, team,
        batting: { hasBatted: false, runs: 0, balls: 0, fours: 0, sixes: 0, dismissed: false, dismissalText: "" },
        bowling: { hasBowled: false, wickets: 0, maidens: 0, runsConceded: 0, wides: 0, noBalls: 0, oversRaw: 0, lbwOrBowledWickets: 0 },
        fielding: { catches: 0, stumpings: 0, runOutIndirect: 0 }
      };
      playerMap.set(id, acc);
      return acc;
    };

    const resolveTeam = (inningStr: string, isFieldingTeam: boolean): string => {
      const lower = inningStr.toLowerCase();
      const battingTeam = teams.find((t) => lower.includes(t.toLowerCase().split(" ")[0])) || "";
      if (!isFieldingTeam) return battingTeam;
      return teams.find((t) => t !== battingTeam) || "";
    };

    const inningNames: string[] = [];

    for (const innings of scorecardInnings) {
      const inningName = typeof innings.inning === "string" ? innings.inning : "";
      inningNames.push(inningName);
      const battingTeam = resolveTeam(inningName, false);
      const fieldingTeam = resolveTeam(inningName, true);

      // Build lbwOrBowled lookup for bowlers in this innings from catching array
      const lbwBowledByBowlerId = new Map<string, number>();
      const catchingRows = Array.isArray(innings.catching) ? innings.catching as Array<Record<string, unknown>> : [];
      for (const row of catchingRows) {
        const catcher = row.catcher && typeof row.catcher === "object" ? row.catcher as Record<string, unknown> : null;
        if (!catcher) continue;
        const bowlerId = String(catcher.id || "");
        const lbw = Number(row.lbw || 0);
        const bowled = Number(row.bowled || 0);
        if ((lbw > 0 || bowled > 0) && bowlerId) {
          lbwBowledByBowlerId.set(bowlerId, (lbwBowledByBowlerId.get(bowlerId) || 0) + lbw + bowled);
        }
      }

      // Process batting rows
      const battingRows = Array.isArray(innings.batting) ? innings.batting as Array<Record<string, unknown>> : [];
      for (const row of battingRows) {
        const batter = row.batsman && typeof row.batsman === "object" ? row.batsman as Record<string, unknown> : null;
        if (!batter) continue;
        const id = String(batter.id || "");
        const name = String(batter.name || "");
        if (!id) continue;
        const acc = getOrCreate(id, name, battingTeam);
        acc.batting.hasBatted = true;
        acc.batting.runs += Number(row.r || 0);
        acc.batting.balls += Number(row.b || 0);
        acc.batting.fours += Number(row["4s"] || 0);
        acc.batting.sixes += Number(row["6s"] || 0);
        if (!acc.batting.dismissed) {
          acc.batting.dismissed = typeof row.dismissal === "string";
          acc.batting.dismissalText = typeof row["dismissal-text"] === "string" ? row["dismissal-text"] : "";
        }
      }

      // Process bowling rows
      const bowlingRows = Array.isArray(innings.bowling) ? innings.bowling as Array<Record<string, unknown>> : [];
      for (const row of bowlingRows) {
        const bowler = row.bowler && typeof row.bowler === "object" ? row.bowler as Record<string, unknown> : null;
        if (!bowler) continue;
        const id = String(bowler.id || "");
        const name = String(bowler.name || "");
        if (!id) continue;
        const acc = getOrCreate(id, name, fieldingTeam);
        acc.bowling.hasBowled = true;
        acc.bowling.wickets += Number(row.w || 0);
        acc.bowling.maidens += Number(row.m || 0);
        acc.bowling.runsConceded += Number(row.r || 0);
        acc.bowling.wides += Number(row.wd || 0);
        acc.bowling.noBalls += Number(row.nb || 0);
        acc.bowling.oversRaw += Number(row.o || 0);
        acc.bowling.lbwOrBowledWickets += lbwBowledByBowlerId.get(id) || 0;
      }

      // Process catching/fielding rows
      for (const row of catchingRows) {
        const catcher = row.catcher && typeof row.catcher === "object" ? row.catcher as Record<string, unknown> : null;
        if (!catcher) continue;
        const id = String(catcher.id || "");
        const name = String(catcher.name || "");
        if (!id) continue;
        const acc = getOrCreate(id, name, fieldingTeam);
        acc.fielding.catches += Number(row.catch || 0);
        acc.fielding.stumpings += Number(row.stumped || 0);
        acc.fielding.runOutIndirect += Number(row.runout || 0);
      }
    }

    const players: ScorecardFantasyPlayer[] = [];
    for (const acc of playerMap.values()) {
      const realOvers = this.cricketOversToDecimal(acc.bowling.oversRaw);
      const economy = realOvers > 0 ? acc.bowling.runsConceded / realOvers : 0;
      const sr = acc.batting.balls > 0 ? Math.round((acc.batting.runs / acc.batting.balls) * 10000) / 100 : 0;

      const breakdown = scorePlayerMatch({
        batting: acc.batting.hasBatted ? {
          runs: acc.batting.runs,
          balls: acc.batting.balls,
          fours: acc.batting.fours,
          sixes: acc.batting.sixes,
          dismissed: acc.batting.dismissed
        } : undefined,
        bowling: acc.bowling.hasBowled ? {
          wickets: acc.bowling.wickets,
          maidens: acc.bowling.maidens,
          oversBowled: realOvers,
          runsConceded: acc.bowling.runsConceded,
          wides: acc.bowling.wides,
          noBalls: acc.bowling.noBalls,
          lbwOrBowledWickets: acc.bowling.lbwOrBowledWickets,
          dotBalls: 0
        } : undefined,
        fielding: {
          catches: acc.fielding.catches,
          stumpings: acc.fielding.stumpings,
          runOutDirect: 0,
          runOutIndirect: acc.fielding.runOutIndirect
        },
        bonuses: { leadershipRole: "NONE" }
      });

      players.push({
        playerId: acc.id,
        playerName: acc.name,
        team: acc.team,
        batting: acc.batting.hasBatted ? {
          runs: acc.batting.runs,
          balls: acc.batting.balls,
          fours: acc.batting.fours,
          sixes: acc.batting.sixes,
          strikeRate: sr,
          dismissed: acc.batting.dismissed,
          dismissalText: acc.batting.dismissalText
        } : null,
        bowling: acc.bowling.hasBowled ? {
          overs: realOvers,
          maidens: acc.bowling.maidens,
          runsConceded: acc.bowling.runsConceded,
          wickets: acc.bowling.wickets,
          wides: acc.bowling.wides,
          noBalls: acc.bowling.noBalls,
          economy: Math.round(economy * 100) / 100,
          lbwOrBowledWickets: acc.bowling.lbwOrBowledWickets
        } : null,
        fielding: {
          catches: acc.fielding.catches,
          stumpings: acc.fielding.stumpings,
          runOutIndirect: acc.fielding.runOutIndirect
        },
        breakdown,
        fantasyPoints: breakdown.total
      });
    }

    players.sort((a, b) => b.fantasyPoints - a.fantasyPoints);

    return {
      matchId,
      matchName,
      status,
      fetchedAt: new Date().toISOString(),
      teams,
      innings: inningNames,
      players,
      notes: [
        "Fantasy points calculated using DEFAULT_SCORING_RULES from the scoring engine.",
        "Dot balls are not available from scorecard summary data and are set to 0 (economy rate is still computed from overs/runs).",
        "Run-out type (direct vs indirect) is not distinguishable from scorecard data — all run-outs counted as indirect (+10 pts each).",
        `CricketData app budget: ${this.cricketDataHitsUsedToday}/${this.cricketDataDailyHitBudget} hits used today.`
      ]
    };
  }

  private cricketOversToDecimal(overs: number): number {
    const full = Math.floor(overs);
    const balls = Math.round((overs - full) * 10);
    return full + balls / 6;
  }

  private async fetchCricketDataJson(
    endpoint: "currentMatches" | "match_info" | "match_scorecard",
    params: Record<string, string>
  ): Promise<{ data?: unknown; info?: Record<string, unknown> }> {
    this.consumeCricketDataBudgetHit(endpoint);

    const search = new URLSearchParams({
      apikey: this.cricketDataApiKey,
      offset: "0",
      ...params
    });
    const url = `${this.cricketDataApiBase}/${endpoint}?${search.toString()}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; FantasyIPLBot/1.0)",
        "Accept": "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`CricketData ${endpoint} failed: HTTP ${response.status}`);
    }

    const payload = await response.json() as Record<string, unknown>;
    if (payload.status !== "success") {
      const info = payload.info && typeof payload.info === "object" ? payload.info as Record<string, unknown> : undefined;
      throw new Error(`CricketData ${endpoint} returned ${String(payload.status || "failure")}${info?.message ? `: ${String(info.message)}` : ""}`);
    }

    return {
      data: payload.data,
      info: payload.info && typeof payload.info === "object" ? payload.info as Record<string, unknown> : undefined
    };
  }

  private pickCurrentCricketDataMatch(matches: Array<Record<string, unknown>>, hints?: LiveMatchHints): Record<string, unknown> | undefined {
    if (hints?.teamA && hints?.teamB) {
      const wantedA = this.normalizeTeamName(hints.teamA);
      const wantedB = this.normalizeTeamName(hints.teamB);
      const wantedSeries = this.normalizeTeamName(hints.series || "");

      const filtered = matches.filter((match) => {
        const teams = Array.isArray(match.teams) ? (match.teams as unknown[]).map((value) => this.normalizeTeamName(String(value || ""))) : [];
        const hasTeams = teams.some((team) => team.includes(wantedA) || wantedA.includes(team))
          && teams.some((team) => team.includes(wantedB) || wantedB.includes(team));
        if (!hasTeams) return false;
        if (!wantedSeries) return true;
        const series = this.normalizeTeamName(String(match.series_id || ""));
        const name = this.normalizeTeamName(String(match.name || ""));
        return series.includes(wantedSeries) || name.includes(wantedSeries);
      });

      if (filtered.length > 0) {
        return filtered.find((match) => match.matchStarted === true && match.matchEnded !== true)
          || filtered.find((match) => match.matchEnded !== true)
          || filtered[0];
      }
    }

    return matches.find((match) => match.matchStarted === true && match.matchEnded !== true)
      || matches.find((match) => match.matchEnded !== true)
      || matches[0];
  }

  private parseCricketDataPreview(
    match: Record<string, unknown>,
    fetchedFromUrl: string,
    endpoint: "currentMatches" | "match_info",
    info?: Record<string, unknown>
  ): CricbuzzLivePreview {
    const matchId = String(match.id || "");
    const scoreRows = Array.isArray(match.score) ? match.score as Array<Record<string, unknown>> : [];
    const teamInfo = Array.isArray(match.teamInfo) ? match.teamInfo as Array<Record<string, unknown>> : [];
    const status = typeof match.status === "string" ? match.status : undefined;

    const shortNames = teamInfo
      .map((team) => typeof team.shortname === "string" ? team.shortname : undefined)
      .filter((value): value is string => !!value);

    const scoreSummary = scoreRows
      .map((row, index) => {
        const teamLabel = shortNames[index] || (typeof row.inning === "string" ? row.inning : `Inning ${index + 1}`);
        const runs = Number(row.r || 0);
        const wickets = Number(row.w || 0);
        const overs = Number(row.o || 0);
        return `${teamLabel} ${runs}/${wickets} (${overs} ov)`;
      })
      .join(" | ");

    const notes = [
      `CricketData ${endpoint} endpoint used with one upstream API hit.`,
      `Cached for ${Math.round(this.cricketDataCacheTtlMs / 60000)} minutes to stay within the 100-hit daily limit.`,
      `App budget usage: ${this.cricketDataHitsUsedToday}/${this.cricketDataDailyHitBudget} hits today.`
    ];
    if (info?.hitsToday !== undefined || info?.hitsLimit !== undefined) {
      notes.push(`CricketData usage: ${String(info?.hitsToday || 0)}/${String(info?.hitsLimit || 100)} hits today.`);
    }

    return {
      source: "cricketdata",
      fetchedAt: new Date().toISOString(),
      matchId,
      matchUrl: matchId ? `${this.cricketDataApiBase}/match_info?apikey=hidden&id=${encodeURIComponent(matchId)}` : `${this.cricketDataApiBase}/${endpoint}`,
      fetchedFromUrl,
      scoreText: scoreSummary ? (status ? `${scoreSummary} | ${status}` : scoreSummary) : status,
      batting: [],
      bowling: [],
      fantasyPlayers: [],
      notes
    };
  }

  private storeCricketDataCache(key: string, preview: CricbuzzLivePreview): void {
    this.cricketDataCache.set(key, {
      preview,
      expiresAt: Date.now() + this.cricketDataCacheTtlMs
    });
  }

  private clonePreviewWithNote(preview: CricbuzzLivePreview, note: string): CricbuzzLivePreview {
    return {
      ...preview,
      batting: [...preview.batting],
      bowling: [...preview.bowling],
      fantasyPlayers: [...preview.fantasyPlayers],
      notes: [...preview.notes, note, `App budget usage: ${this.cricketDataHitsUsedToday}/${this.cricketDataDailyHitBudget} hits today.`]
    };
  }

  private getBestStaleCricketDataPreview(matchId?: string): CricbuzzLivePreview | null {
    const exactKey = matchId ? `cricketdata:match:${matchId}` : "cricketdata:current";
    const exact = this.cricketDataCache.get(exactKey);
    if (exact) {
      return exact.preview;
    }

    let newest: { preview: CricbuzzLivePreview; fetchedAtTs: number } | null = null;
    for (const [key, value] of this.cricketDataCache.entries()) {
      if (!key.startsWith("cricketdata:")) {
        continue;
      }
      const ts = Date.parse(value.preview.fetchedAt || "") || 0;
      if (!newest || ts > newest.fetchedAtTs) {
        newest = { preview: value.preview, fetchedAtTs: ts };
      }
    }
    return newest?.preview || null;
  }

  private isCricketDataBudgetExhausted(): boolean {
    this.rollCricketDataBudgetDayIfNeeded();
    return this.cricketDataHitsUsedToday >= this.cricketDataDailyHitBudget;
  }

  private rollCricketDataBudgetDayIfNeeded(): void {
    const today = this.getUtcDayKey();
    if (today !== this.cricketDataHitsDayKey) {
      this.cricketDataHitsDayKey = today;
      this.cricketDataHitsUsedToday = 0;
    }
  }

  private consumeCricketDataBudgetHit(endpoint: string): void {
    this.rollCricketDataBudgetDayIfNeeded();
    if (this.cricketDataHitsUsedToday >= this.cricketDataDailyHitBudget) {
      throw new Error(`CricketData daily budget exhausted (${this.cricketDataHitsUsedToday}/${this.cricketDataDailyHitBudget}) before ${endpoint} request.`);
    }
    this.cricketDataHitsUsedToday += 1;
  }

  private getUtcDayKey(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private buildFallbackSample(matchId: string | undefined, errors: string[]): CricbuzzLivePreview {
    const fallback = this.getSamplePreview(matchId || "148962");
    fallback.notes.push("Live providers are currently unreachable in this runtime. Returning sample fallback.");
    if (errors.length > 0) {
      fallback.notes.push(`Provider errors: ${errors.join(" | ")}`);
    }
    return fallback;
  }

  private async getCricbuzzPreview(matchId?: string, allowProxy = true, hints?: LiveMatchHints): Promise<CricbuzzLivePreview> {
    const targetMatchId = matchId || await this.getFirstLiveMatchId(allowProxy, hints);
    const scorecardUrl = `${this.baseUrl}/live-cricket-scorecard/${targetMatchId}`;
    const fetched = await this.fetchPage(scorecardUrl, allowProxy);

    const parsed = this.parseScorecardText(fetched.html, targetMatchId, scorecardUrl, fetched.fetchedFromUrl, "cricbuzz");
    if (parsed.batting.length === 0 && parsed.bowling.length === 0) {
      parsed.notes.push("No structured player rows extracted from scorecard HTML. Site markup likely changed.");
    }
    if (fetched.fetchedFromUrl !== scorecardUrl) {
      parsed.notes.push("Used proxy fallback fetch path for Cricbuzz content.");
    }
    parsed.notes.push("Fantasy preview points are computed from currently extracted batting/bowling/fielding stats only.");

    return parsed;
  }

  private async getEspnPreview(matchId?: string, allowProxy = true, hints?: LiveMatchHints): Promise<CricbuzzLivePreview> {
    const scoreboardUrls = [
      "https://site.web.api.espn.com/apis/v2/sports/cricket/scoreboard",
      "https://site.api.espn.com/apis/site/v2/sports/cricket/scoreboard",
      "https://site.api.espn.com/apis/site/v2/sports/cricket/scoreboard?region=in&lang=en&contentorigin=espn"
    ];

    let board: Record<string, unknown> | null = null;
    let scoreboardUrl = scoreboardUrls[0];
    const attempts: string[] = [];
    for (const candidate of scoreboardUrls) {
      try {
        const payload = await this.fetchJson(candidate, allowProxy);
        const events = Array.isArray(payload?.events) ? payload.events : [];
        if (events.length > 0) {
          board = payload;
          scoreboardUrl = candidate;
          break;
        }
        attempts.push(`${candidate}: no events`);
      } catch (error) {
        attempts.push(`${candidate}: ${error instanceof Error ? error.message : "failed"}`);
      }
    }

    if (!board) {
      throw new Error(`ESPN scoreboard lookup failed. ${attempts.join(" | ")}`);
    }

    const events = Array.isArray(board?.events) ? board.events : [];
    if (events.length === 0) {
      throw new Error("ESPN scoreboard returned no live events");
    }

    const picked = this.pickEspnEvent(events as Array<Record<string, unknown>>, matchId, hints);
    if (!picked) {
      throw new Error("Requested ESPN match not found on live scoreboard");
    }

    const eventId = String((picked as Record<string, unknown>).id || "");
    const comp = Array.isArray((picked as Record<string, unknown>).competitions)
      ? ((picked as Record<string, unknown>).competitions as Array<Record<string, unknown>>)[0]
      : undefined;

    const scoreText = comp
      ? JSON.stringify((comp as Record<string, unknown>).status || {}).replace(/[{}\"]/g, "")
      : undefined;

    const preview: CricbuzzLivePreview = {
      source: "espn",
      fetchedAt: new Date().toISOString(),
      matchId: eventId || (matchId || ""),
      matchUrl: scoreboardUrl,
      fetchedFromUrl: scoreboardUrl,
      scoreText,
      batting: [],
      bowling: [],
      fantasyPlayers: [],
      notes: [
        `Using ESPN public scoreboard endpoint: ${scoreboardUrl}`,
        "Player-level scorecard stats were not available from this free endpoint in current parse path."
      ]
    };

    return preview;
  }

  private async getFirstLiveMatchId(allowProxy: boolean, hints?: LiveMatchHints): Promise<string> {
    const liveUrl = `${this.baseUrl}/cricket-match/live-scores`;
    const fetched = await this.fetchPage(liveUrl, allowProxy);
    const html = fetched.html;
    const matches = this.extractLiveMatchLinks(html);
    if (matches.length === 0) {
      throw new Error("No live matches found on Cricbuzz");
    }
    if (hints?.teamA && hints?.teamB) {
      const tokenA = this.normalizeTeamName(hints.teamA).split(" ")[0];
      const tokenB = this.normalizeTeamName(hints.teamB).split(" ")[0];
      const picked = matches.find((match) => {
        const slug = this.normalizeTeamName(match.url);
        return slug.includes(tokenA) && slug.includes(tokenB);
      });
      if (picked) {
        return picked.matchId;
      }
    }
    return matches[0].matchId;
  }

  private pickEspnEvent(events: Array<Record<string, unknown>>, matchId?: string, hints?: LiveMatchHints): Record<string, unknown> | undefined {
    if (matchId) {
      const byId = events.find((event) => String(event?.id || "") === String(matchId));
      if (byId) {
        return byId;
      }
    }

    if (hints?.teamA && hints?.teamB) {
      const wantedA = this.normalizeTeamName(hints.teamA);
      const wantedB = this.normalizeTeamName(hints.teamB);

      const byTeams = events.find((event) => {
        const teams = this.getEspnTeamNames(event).map((name) => this.normalizeTeamName(name));
        return teams.some((team) => team.includes(wantedA) || wantedA.includes(team))
          && teams.some((team) => team.includes(wantedB) || wantedB.includes(team));
      });
      if (byTeams) {
        return byTeams;
      }
    }

    return events[0];
  }

  private getEspnTeamNames(event: Record<string, unknown>): string[] {
    const comp = Array.isArray(event.competitions) ? (event.competitions[0] as Record<string, unknown> | undefined) : undefined;
    const competitors = comp && Array.isArray(comp.competitors) ? comp.competitors as Array<Record<string, unknown>> : [];
    const names: string[] = [];
    for (const competitor of competitors) {
      const team = competitor.team && typeof competitor.team === "object" ? competitor.team as Record<string, unknown> : undefined;
      const candidates = [team?.displayName, team?.shortDisplayName, team?.name, team?.abbreviation, competitor.displayName];
      for (const candidate of candidates) {
        if (typeof candidate === "string" && candidate.trim()) {
          names.push(candidate.trim());
        }
      }
    }
    return names;
  }

  private normalizeTeamName(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private extractLiveMatchLinks(html: string): LiveMatchSummary[] {
    const found = new Map<string, LiveMatchSummary>();
    const re = /\/live-cricket-scores\/(\d+)\/([a-z0-9-]+)/gi;
    for (const match of html.matchAll(re)) {
      const matchId = match[1];
      if (!found.has(matchId)) {
        found.set(matchId, {
          matchId,
          url: `${this.baseUrl}/live-cricket-scores/${matchId}/${match[2]}`
        });
      }
    }
    return Array.from(found.values());
  }

  private async fetchPage(url: string, allowProxy: boolean): Promise<{ html: string; fetchedFromUrl: string }> {
    const requestHeaders: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache"
    };

    let response: Response | null = null;
    let lastNetworkError: string | null = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        response = await fetch(url, { headers: requestHeaders });
        if (response.ok) {
          return { html: await response.text(), fetchedFromUrl: url };
        }

        // Retry transient blocks/errors before falling back to proxy.
        if ([403, 408, 425, 429, 500, 502, 503, 504].includes(response.status) && attempt < 3) {
          await this.sleep(attempt * 300);
          continue;
        }
        break;
      } catch (error) {
        lastNetworkError = error instanceof Error ? error.message : "unknown fetch error";
        if (attempt < 3) {
          await this.sleep(attempt * 300);
          continue;
        }
      }
    }

    if (!allowProxy) {
      const status = response
        ? `HTTP ${response.status}`
        : `fetch failed${lastNetworkError ? `: ${lastNetworkError}` : ""}`;
      throw new Error(`Cricbuzz fetch failed for ${url}: ${status}`);
    }

    const proxyUrl = `https://r.jina.ai/http/${url.replace(/^https?:\/\//, "")}`;
    let proxyResp: Response;
    try {
      proxyResp = await fetch(proxyUrl, {
        headers: {
          "User-Agent": requestHeaders["User-Agent"],
          "Accept": "text/plain,*/*;q=0.8"
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown fetch error";
      throw new Error(`Cricbuzz fetch failed for ${url}: ${message}`);
    }

    if (!proxyResp.ok) {
      throw new Error(`Cricbuzz fetch failed for ${url}: HTTP ${proxyResp.status}`);
    }

    return { html: await proxyResp.text(), fetchedFromUrl: proxyUrl };
  }

  private async fetchJson(url: string, allowProxy: boolean): Promise<Record<string, unknown>> {
    const fetched = await this.fetchPage(url, allowProxy);
    try {
      return JSON.parse(fetched.html) as Record<string, unknown>;
    } catch {
      // If proxy wrapper includes preface text, try to slice from first JSON object.
      const idx = fetched.html.indexOf("{");
      if (idx >= 0) {
        return JSON.parse(fetched.html.slice(idx)) as Record<string, unknown>;
      }
      throw new Error(`Failed to parse JSON payload from ${fetched.fetchedFromUrl}`);
    }
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private parseScorecardText(
    html: string,
    matchId: string,
    matchUrl: string,
    fetchedFromUrl: string,
    source: CricbuzzLivePreview["source"]
  ): CricbuzzLivePreview {
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const scoreText = this.extractScoreText(text);

    const batting = this.extractBatting(text);
    const bowling = this.extractBowling(text);
    const fantasyPlayers = this.buildFantasyPlayers(batting, bowling);

    return {
      source,
      fetchedAt: new Date().toISOString(),
      matchId,
      matchUrl,
      fetchedFromUrl,
      scoreText,
      batting,
      bowling,
      fantasyPlayers,
      notes: []
    };
  }

  private extractScoreText(text: string): string | undefined {
    const scoreRe = /([A-Z]{2,5})\s+(\d+)-(\d+)\s*\((\d+(?:\.\d+)?)\s*Ov\)/;
    const hit = text.match(scoreRe);
    if (!hit) return undefined;
    return `${hit[1]} ${hit[2]}-${hit[3]} (${hit[4]} Ov)`;
  }

  private extractBatting(text: string): LiveBattingStat[] {
    const rows: LiveBattingStat[] = [];

    // Pattern commonly found in commentary/scorecard text chunks:
    // PlayerName ... 53(39) [4s-10, 6s-0]
    const re = /([A-Z][A-Za-z .'-]{2,})\s+(?:c\s+[^\[]+?\s+b\s+[^\[]+?|not out\s+|run out\s*\([^)]*\)\s+)?(\d+)\((\d+)\)\s*\[4s-(\d+)(?:,\s*6s-(\d+))?\]/g;
    for (const match of text.matchAll(re)) {
      const rawName = match[1].trim();
      const playerName = rawName.replace(/\s+(?:c|b|lbw|run out|st|not out)\b.*$/i, "").trim();
      const runs = Number(match[2]);
      const balls = Number(match[3]);
      const fours = Number(match[4]);
      const sixes = Number(match[5] || 0);
      const strikeRate = balls > 0 ? Math.round((runs / balls) * 10000) / 100 : 0;
      rows.push({ playerName, runs, balls, fours, sixes, strikeRate });
    }

    return this.dedupeByName(rows);
  }

  private buildFantasyPlayers(batting: LiveBattingStat[], bowling: LiveBowlingStat[]): LiveFantasyPlayerStat[] {
    const byName = new Map<string, LiveFantasyPlayerStat>();

    for (const bat of batting) {
      byName.set(bat.playerName, {
        playerName: bat.playerName,
        batting: {
          runs: bat.runs,
          balls: bat.balls,
          fours: bat.fours,
          sixes: bat.sixes
        },
        bowling: {
          wickets: 0,
          maidens: 0,
          oversBowled: 0,
          runsConceded: 0
        },
        fielding: {
          catches: 0,
          stumpings: 0,
          runOutDirect: 0,
          runOutIndirect: 0
        },
        fantasyPreviewPoints: 0
      });
    }

    for (const bowl of bowling) {
      const current = byName.get(bowl.playerName) || {
        playerName: bowl.playerName,
        batting: {
          runs: 0,
          balls: 0,
          fours: 0,
          sixes: 0
        },
        bowling: {
          wickets: 0,
          maidens: 0,
          oversBowled: 0,
          runsConceded: 0
        },
        fielding: {
          catches: 0,
          stumpings: 0,
          runOutDirect: 0,
          runOutIndirect: 0
        },
        fantasyPreviewPoints: 0
      };

      current.bowling.wickets = bowl.wickets;
      current.bowling.maidens = bowl.maidens;
      current.bowling.oversBowled = bowl.overs;
      current.bowling.runsConceded = bowl.runsConceded;

      byName.set(bowl.playerName, current);
    }

    for (const player of byName.values()) {
      const breakdown = scorePlayerMatch({
        batting: {
          runs: player.batting.runs,
          balls: player.batting.balls,
          fours: player.batting.fours,
          sixes: player.batting.sixes,
          dismissed: false
        },
        bowling: {
          wickets: player.bowling.wickets,
          maidens: player.bowling.maidens,
          oversBowled: player.bowling.oversBowled,
          runsConceded: player.bowling.runsConceded,
          dotBalls: 0,
          wides: 0,
          noBalls: 0,
          lbwOrBowledWickets: 0
        },
        fielding: {
          catches: player.fielding.catches,
          stumpings: player.fielding.stumpings,
          runOutDirect: player.fielding.runOutDirect,
          runOutIndirect: player.fielding.runOutIndirect
        },
        bonuses: {
          leadershipRole: "NONE"
        }
      });
      player.fantasyPreviewPoints = breakdown.total;
    }

    return Array.from(byName.values());
  }

  private extractBowling(text: string): LiveBowlingStat[] {
    const rows: LiveBowlingStat[] = [];

    // Over summary style: Hassan Khan 3-0-15-2
    const re = /([A-Z][A-Za-z .'-]{2,})\s+(\d+)-(\d+)-(\d+)-(\d+)/g;
    for (const match of text.matchAll(re)) {
      const playerName = match[1].trim();
      const overs = Number(match[2]);
      const maidens = Number(match[3]);
      const runsConceded = Number(match[4]);
      const wickets = Number(match[5]);
      rows.push({ playerName, overs, maidens, runsConceded, wickets });
    }

    return this.dedupeByName(rows);
  }

  private dedupeByName<T extends { playerName: string }>(rows: T[]): T[] {
    const map = new Map<string, T>();
    for (const row of rows) {
      if (!map.has(row.playerName)) {
        map.set(row.playerName, row);
      }
    }
    return Array.from(map.values());
  }

  private getSamplePreview(matchId: string): CricbuzzLivePreview {
    // A static snapshot from the currently ongoing match page text,
    // useful for dry-run testing when network/DNS is unavailable.
    const sampleText = `
      Lahore Qalandars 103-3 (11.4 Ov)
      Fakhar Zaman c Saim Ayub b Hassan Khan 53(39) [4s-10, 6s-0]
      Abdullah Shafique run out (Hammad Azam/Usman Khan) 4(5) [4s-0, 6s-0]
      Parvez Hossain Emon not out 3(3) [4s-0, 6s-0]
      Hassan Khan 3-0-15-2
      Marnus Labuschagne 1-0-7-0
      Saim Ayub 2-0-18-0
    `;

    const parsed = this.parseScorecardText(
      sampleText,
      matchId,
      `${this.baseUrl}/live-cricket-scorecard/${matchId}`,
      "sample://captured-snapshot",
      "cricbuzz"
    );

    parsed.notes.push("Sample mode: parsed from captured live text snapshot, not a direct Cricbuzz fetch.");
    return parsed;
  }

  async getHealthStatus(): Promise<{ espn: boolean; cricbuzz: boolean; cricketdata: boolean; message: string }> {
    let espn = false;
    let cricbuzz = false;
    let cricketdata = false;

    try {
      await this.fetchJson("https://site.api.espn.com/apis/site/v2/sports/cricket/scoreboard", true);
      espn = true;
    } catch {
      /* espn endpoint unavailable */
    }

    try {
      await this.fetchPage(`${this.baseUrl}/cricket-match/live-scores`, true);
      cricbuzz = true;
    } catch {
      /* cricbuzz unavailable */
    }

    try {
      await this.fetchCricketDataJson("currentMatches", { offset: "0" });
      cricketdata = true;
    } catch {
      /* cricketdata unavailable */
    }

    const readyCount = [espn, cricbuzz, cricketdata].filter(Boolean).length;
    return {
      espn,
      cricbuzz,
      cricketdata,
      message: `${readyCount}/3 live providers are currently reachable`
    };
  }
}
