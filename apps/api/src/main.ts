import { createServer } from "node:http";
import { AppModule } from "./app.module.ts";
import { readJsonBody, sendJson, sendText } from "./common/http.ts";

const port = Number(process.env.API_PORT || 4000);
const app = new AppModule();

async function bootstrap() {
  await app.initialize();

  const server = createServer(async (request, response) => {
    const method = request.method || "GET";
    const url = new URL(request.url || "/", `http://${request.headers.host || `localhost:${port}`}`);
    const pathname = url.pathname;

    if (method === "OPTIONS") {
      sendJson(response, 204, {});
      return;
    }

    try {
      if (method === "POST" && pathname === "/api/auth/register") {
        sendJson(response, 201, await app.authController.register(await readJsonBody(request)));
        return;
      }

      if (method === "POST" && pathname === "/api/auth/login") {
        sendJson(response, 200, await app.authController.login(await readJsonBody(request)));
        return;
      }

      if (method === "GET" && pathname === "/api/auth/me") {
        const result = await app.authController.me(request);
        sendJson(response, result.success ? 200 : 401, result);
        return;
      }

      if (method === "POST" && pathname === "/api/auth/logout") {
        sendJson(response, 200, await app.authController.logout(request));
        return;
      }

      if (method === "GET" && pathname === "/api/health") {
        sendJson(response, 200, app.appController.health());
        return;
      }

      let authUser;
      try {
        authUser = await app.authController.requireUser(request);
      } catch {
        sendJson(response, 401, { success: false, error: "Unauthorized" });
        return;
      }

      if (method === "GET" && pathname === "/api/leagues") {
        sendJson(response, 200, await app.leagueController.getUserLeagues(authUser.id));
        return;
      }

      if (method === "GET" && pathname === "/api/admin/leagues") {
        if (authUser.role !== "admin") {
          sendJson(response, 403, { success: false, error: "Forbidden: admin access required" });
          return;
        }
        sendJson(response, 200, await app.leagueController.getAllLeagues());
        return;
      }

      if (method === "GET" && pathname === "/api/players/teams") {
        sendJson(response, 200, await app.playerController.getTeamSummaries());
        return;
      }

      if (method === "GET" && pathname === "/api/players") {
        sendJson(response, 200, await app.playerController.getPlayers(url.searchParams));
        return;
      }

      if (method === "GET" && pathname === "/api/schedule/ipl-2026") {
        sendJson(response, 200, app.scheduleController.getIpl2026Schedule());
        return;
      }

      if (method === "GET" && pathname === "/api/live/cricbuzz/preview") {
        const matchId = url.searchParams.get("matchId") || undefined;
        const sampleParam = url.searchParams.get("sample");
        const sample = sampleParam === "true" || sampleParam === "1";
        const proxy = url.searchParams.get("proxy") !== "false";
        const providerParam = (url.searchParams.get("provider") || "auto") as "auto" | "cricbuzz" | "espn" | "cricapi" | "cricketdata";
        const safeParam = url.searchParams.get("safe");
        const safe = safeParam === "true" || safeParam === "1";
        sendJson(response, 200, await app.liveController.getPreview(matchId, sample, proxy, providerParam, safe));
        return;
      }

      if (method === "GET" && pathname === "/api/live/cricbuzz/health") {
        sendJson(response, 200, await app.liveController.getHealthStatus());
        return;
      }

      if (method === "GET" && pathname === "/api/live/scorecard/fantasy") {
        const matchId = url.searchParams.get("matchId") || undefined;
        sendJson(response, 200, await app.liveController.getScorecardFantasyPoints(matchId));
        return;
      }

      if (method === "POST" && pathname === "/api/live/cricbuzz/poller/start") {
        const body = await readJsonBody(request);
        const queryProvider = url.searchParams.get("provider");
        const queryMatchId = url.searchParams.get("matchId");
        const queryInterval = url.searchParams.get("intervalMs") || url.searchParams.get("intervalSeconds");
        const queryProxy = url.searchParams.get("proxy");
        const querySample = url.searchParams.get("sample");

        const provider = (typeof body.provider === "string" ? body.provider : queryProvider || "auto") as "auto" | "cricbuzz" | "espn" | "cricapi" | "cricketdata";
        const intervalFromBody = typeof body.intervalMs === "number" ? body.intervalMs : undefined;
        const intervalFromQuery = queryInterval ? Number(queryInterval) : undefined;
        const intervalMs = intervalFromBody ?? (Number.isFinite(intervalFromQuery) ? (url.searchParams.get("intervalSeconds") ? (intervalFromQuery as number) * 1000 : intervalFromQuery) : 60_000);
        const sample = body.sample === true || querySample === "true" || querySample === "1";
        const proxy = body.proxy !== false && queryProxy !== "false";

        sendJson(response, 200, app.liveController.startPoller({
          provider,
          matchId: typeof body.matchId === "string" ? body.matchId : (queryMatchId || undefined),
          intervalMs,
          proxy,
          sample
        }));
        return;
      }

      if (method === "POST" && pathname === "/api/live/cricbuzz/poller/stop") {
        sendJson(response, 200, app.liveController.stopPoller());
        return;
      }

      if (method === "GET" && pathname === "/api/live/cricbuzz/poller/status") {
        sendJson(response, 200, app.liveController.getPollerStatus());
        return;
      }

      if (method === "GET" && pathname === "/api/live/cricbuzz/poller/latest") {
        sendJson(response, 200, app.liveController.getLatestFromPoller());
        return;
      }

      if (method === "POST" && pathname === "/api/leagues") {
        sendJson(response, 201, await app.leagueController.createLeague(authUser.id, await readJsonBody(request)));
        return;
      }

      if (method === "POST" && pathname === "/api/leagues/join") {
        sendJson(response, 200, await app.leagueController.joinLeague(authUser.id, await readJsonBody(request)));
        return;
      }

      if (method === "GET" && pathname.startsWith("/api/leagues/invite/")) {
        const inviteCode = pathname.split("/").pop() || "";
        sendJson(response, 200, await app.leagueController.getLeagueByInviteCode(inviteCode));
        return;
      }

      if (method === "GET" && pathname.endsWith("/can-join") && pathname.startsWith("/api/leagues/")) {
        const leagueId = pathname.split("/")[3] || "";
        sendJson(response, 200, await app.leagueController.canJoinLeague(leagueId));
        return;
      }

      if (method === "GET" && pathname.startsWith("/api/leagues/") && pathname.split("/").length === 4) {
        const leagueId = pathname.split("/")[3] || "";
        sendJson(response, 200, await app.leagueController.getLeague(authUser.id, leagueId));
        return;
      }

      if (method === "GET" && pathname.startsWith("/api/teams/") && pathname.split("/").length === 4) {
        const leagueId = pathname.split("/")[3] || "";
        const gameDay = url.searchParams.get("gameDay") || undefined;
        sendJson(response, 200, await app.teamController.getLeagueTeams(authUser.id, leagueId, gameDay));
        return;
      }

      if (method === "GET" && pathname.startsWith("/api/leagues/") && pathname.endsWith("/team-name")) {
        const leagueId = pathname.split("/")[3] || "";
        sendJson(response, 200, await app.teamController.getLeagueTeamName(authUser.id, leagueId));
        return;
      }

      if (method === "PUT" && pathname.startsWith("/api/leagues/") && pathname.endsWith("/team-name")) {
        const leagueId = pathname.split("/")[3] || "";
        sendJson(response, 200, await app.teamController.updateLeagueTeamName(authUser.id, leagueId, await readJsonBody(request)));
        return;
      }

      if (method === "GET" && pathname.startsWith("/api/leagues/") && pathname.endsWith("/h2h-fixtures")) {
        const leagueId = pathname.split("/")[3] || "";
        const gameDay = url.searchParams.get("gameDay") || undefined;
        sendJson(response, 200, await app.scheduleController.getLeagueHeadToHeadFixtures(authUser.id, leagueId, gameDay));
        return;
      }

      if (method === "GET" && pathname.startsWith("/api/leagues/") && pathname.endsWith("/table")) {
        const leagueId = pathname.split("/")[3] || "";
        const throughGameDay = url.searchParams.get("throughGameDay") || undefined;
        sendJson(response, 200, await app.scheduleController.getLeagueTable(authUser.id, leagueId, throughGameDay));
        return;
      }

      if (method === "GET" && pathname.startsWith("/api/leagues/") && pathname.endsWith("/live")) {
        const leagueId = pathname.split("/")[3] || "";
        const gameDay = url.searchParams.get("gameDay") || undefined;
        sendJson(response, 200, await app.scheduleController.getLeagueLiveMatchups(authUser.id, leagueId, gameDay));
        return;
      }

      if (method === "GET" && pathname === "/api/team") {
        const leagueId = url.searchParams.get("leagueId") || "";
        const gameDay = url.searchParams.get("gameDay") || undefined;
        sendJson(response, 200, await app.teamController.getUserTeam(leagueId, authUser.id, gameDay));
        return;
      }

      if (method === "POST" && pathname === "/api/teams") {
        sendJson(response, 201, await app.teamController.createTeam(authUser.id, await readJsonBody(request)));
        return;
      }

      sendText(response, 404, "Not found\n");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      sendJson(response, 500, { success: false, error: message });
    }
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`Fantasy IPL 2026 API listening on port ${port}`);
  });
}

void bootstrap();
