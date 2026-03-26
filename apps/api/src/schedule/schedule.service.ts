import { randomUUID } from "node:crypto";
import type {
  LeagueHeadToHeadFixtureRecord,
  LeagueHeadToHeadResultRecord,
  LeagueTeamRecord,
  LeagueTableRowRecord,
  RuntimeStore,
  TeamPlayerRecord
} from "../common/runtime-store.ts";
import { getIpl2026GameDays, getIpl2026GameDay, type IplGameDay } from "./ipl-2026-schedule.ts";

export interface HeadToHeadFixture {
  id: string;
  leagueId: string;
  gameDay: string;
  round: number;
  homeUserId: string;
  homeDisplayName?: string;
  homeTeamName?: string;
  awayUserId: string;
  awayDisplayName?: string;
  awayTeamName?: string;
  lockAt: string;
  createdAt: string;
}

export interface LeagueTableRow {
  rank: number;
  userId: string;
  userDisplayName?: string;
  teamName?: string;
  played: number;
  wins: number;
  losses: number;
  ties: number;
  points: number;
  scoreFor: number;
  scoreAgainst: number;
  totalScore: number;
}

export interface LivePlayerScore {
  playerId: string;
  playerName: string;
  teamCode: string;
  role: "WK" | "BAT" | "AR" | "BOWL";
  basePoints: number;
  multiplier: number;
  points: number;
}

export interface LiveTeamScore {
  userId: string;
  userDisplayName: string;
  teamName: string;
  hasSubmittedTeam: boolean;
  activeScore: number;
  totalScore: number;
  activePlayers: LivePlayerScore[];
}

export interface LiveFixtureScore {
  fixtureId: string;
  gameDay: string;
  round: number;
  lockAt: string;
  status: "upcoming" | "live";
  home: LiveTeamScore;
  away: LiveTeamScore;
}

export class ScheduleService {
  private readonly store: RuntimeStore;

  constructor(store: RuntimeStore) {
    this.store = store;
  }

  getIpl2026Schedule(): IplGameDay[] {
    return getIpl2026GameDays();
  }

  getIpl2026GameDay(date: string): IplGameDay | null {
    return getIpl2026GameDay(date);
  }

  async getLeagueHeadToHeadFixtures(userId: string, leagueId: string, gameDay?: string): Promise<HeadToHeadFixture[]> {
    await this.assertLeagueMember(leagueId, userId);
    let fixtures = await this.store.getLeagueHeadToHeadFixtures(leagueId, gameDay);
    if (fixtures.length > 0) {
      return this.withFixtureDisplayNames(fixtures);
    }

    const members = await this.store.getLeagueMembers(leagueId);
    const memberIds = members.map((member) => member.userId);
    if (memberIds.length < 2) {
      return fixtures;
    }

    await this.generateHeadToHeadFixtures(leagueId, memberIds);
    fixtures = await this.store.getLeagueHeadToHeadFixtures(leagueId, gameDay);
    return this.withFixtureDisplayNames(fixtures);
  }

  async getLeagueTable(userId: string, leagueId: string, throughGameDay?: string): Promise<LeagueTableRow[]> {
    await this.assertLeagueMember(leagueId, userId);

    const cutoff = throughGameDay || new Date().toISOString().slice(0, 10);
    await this.settleUnresolvedFixtures(leagueId, cutoff);

    let rows = await this.store.getLeagueTable(leagueId);

    // If leaderboard rows are missing, initialize them from members with zero values.
    if (rows.length === 0) {
      await this.rebuildLeagueTable(leagueId);
      rows = await this.store.getLeagueTable(leagueId);
    }

    // Ensure all league members are included with default zeroes.
    const members = await this.store.getLeagueMembers(leagueId);
    const rowsByUserId = new Map(rows.map((row) => [row.userId, row]));
    
    const nameCache = new Map<string, string>();
    const teamNameCache = new Map<string, string | undefined>();
    const allRows: LeagueTableRow[] = [];
    let rank = 1;
    
    for (const row of rows) {
      const name = await this.lookupDisplayName(row.userId, nameCache);
      const teamName = await this.lookupTeamName(leagueId, row.userId, cutoff, teamNameCache, true);
      allRows.push({
        ...row,
        rank,
        userDisplayName: name,
        teamName,
        scoreFor: this.round2(row.scoreFor),
        scoreAgainst: this.round2(row.scoreAgainst),
        totalScore: this.round2(row.totalScore)
      });
      rank++;
    }

    // Add any members that are still missing with default zeroes.
    for (const member of members) {
      if (!rowsByUserId.has(member.userId)) {
        const name = await this.lookupDisplayName(member.userId, nameCache);
        const teamName = await this.lookupTeamName(leagueId, member.userId, cutoff, teamNameCache, true);
        allRows.push({
          rank,
          userId: member.userId,
          userDisplayName: name,
          teamName,
          played: 0,
          wins: 0,
          losses: 0,
          ties: 0,
          points: 0,
          scoreFor: 0,
          scoreAgainst: 0,
          totalScore: 0
        });
        rank++;
      }
    }
    
    return allRows;
  }

  async getLeagueLiveMatchups(userId: string, leagueId: string, gameDay?: string): Promise<LiveFixtureScore[]> {
    await this.assertLeagueMember(leagueId, userId);

    const targetGameDay = gameDay || new Date().toISOString().slice(0, 10);
    const daySchedule = getIpl2026GameDay(targetGameDay);
    if (!daySchedule) {
      throw new Error("Selected game day is not part of IPL 2026 schedule");
    }

    const activeTeamCodes = new Set<string>();
    for (const match of daySchedule.matches || []) {
      activeTeamCodes.add(match.homeTeamCode);
      activeTeamCodes.add(match.awayTeamCode);
    }

    const fixtures = await this.getLeagueHeadToHeadFixtures(userId, leagueId, targetGameDay);
    const now = Date.now();
    const firstMatchStartAt = new Date(daySchedule.firstMatchStartAt).getTime();

    const view: LiveFixtureScore[] = [];
    for (const fixture of fixtures) {
      const homeTeam = await this.store.getUserTeam(leagueId, fixture.homeUserId, targetGameDay);
      const awayTeam = await this.store.getUserTeam(leagueId, fixture.awayUserId, targetGameDay);

      const home = await this.buildLiveTeamScore(fixture.homeUserId, homeTeam, activeTeamCodes);
      const away = await this.buildLiveTeamScore(fixture.awayUserId, awayTeam, activeTeamCodes);

      view.push({
        fixtureId: fixture.id,
        gameDay: fixture.gameDay,
        round: fixture.round,
        lockAt: fixture.lockAt,
        status: now < firstMatchStartAt ? "upcoming" : "live",
        home,
        away
      });
    }

    return view;
  }

  async generateHeadToHeadFixtures(leagueId: string, userIds: string[]): Promise<HeadToHeadFixture[]> {
    if (userIds.length < 2) {
      throw new Error("Head-to-head schedule requires at least 2 league members");
    }

    const gameDays = getIpl2026GameDays();
    const rounds = this.buildRoundRobinRounds(userIds);
    const fixtures: HeadToHeadFixture[] = [];

    gameDays.forEach((day, gameDayIndex) => {
      const roundPairings = rounds[gameDayIndex % rounds.length];
      roundPairings.forEach((pair, index) => {
        fixtures.push({
          id: randomUUID(),
          leagueId,
          gameDay: day.gameDay,
          round: gameDayIndex + 1,
          homeUserId: pair[0],
          awayUserId: pair[1],
          lockAt: day.lockAt,
          createdAt: new Date().toISOString()
        });
      });
    });

    await this.store.replaceHeadToHeadFixtures(leagueId, fixtures);
    return fixtures;
  }

  private async settleUnresolvedFixtures(leagueId: string, throughGameDay: string): Promise<void> {
    const fixtures = await this.store.getUnsettledHeadToHeadFixtures(leagueId, throughGameDay);
    if (fixtures.length === 0) {
      return;
    }

    const results: LeagueHeadToHeadResultRecord[] = [];
    for (const fixture of fixtures) {
      const homeTeam = await this.store.getUserTeam(leagueId, fixture.homeUserId, fixture.gameDay);
      const awayTeam = await this.store.getUserTeam(leagueId, fixture.awayUserId, fixture.gameDay);

      const homeScore = await this.scoreTeam(homeTeam?.players || [], homeTeam?.captainPlayerId, homeTeam?.viceCaptainPlayerId);
      const awayScore = await this.scoreTeam(awayTeam?.players || [], awayTeam?.captainPlayerId, awayTeam?.viceCaptainPlayerId);

      const isTie = Math.abs(homeScore - awayScore) < 0.0001;
      const winnerUserId = isTie ? undefined : homeScore > awayScore ? fixture.homeUserId : fixture.awayUserId;

      results.push({
        id: randomUUID(),
        fixtureId: fixture.id,
        leagueId,
        gameDay: fixture.gameDay,
        homeUserId: fixture.homeUserId,
        awayUserId: fixture.awayUserId,
        homeScore,
        awayScore,
        winnerUserId,
        isTie,
        settledAt: new Date().toISOString()
      });
    }

    await this.store.insertHeadToHeadResults(results);
    await this.rebuildLeagueTable(leagueId);
  }

  private async rebuildLeagueTable(leagueId: string): Promise<void> {
    const members = await this.store.getLeagueMembers(leagueId);
    const results = await this.store.getLeagueHeadToHeadResults(leagueId);
    const table = new Map<string, Omit<LeagueTableRowRecord, "rank">>();

    for (const member of members) {
      table.set(member.userId, {
        userId: member.userId,
        played: 0,
        wins: 0,
        losses: 0,
        ties: 0,
        points: 0,
        scoreFor: 0,
        scoreAgainst: 0,
        totalScore: 0
      });
    }

    for (const result of results) {
      const home = table.get(result.homeUserId);
      const away = table.get(result.awayUserId);
      if (!home || !away) {
        continue;
      }

      home.played += 1;
      away.played += 1;

      home.scoreFor += result.homeScore;
      home.scoreAgainst += result.awayScore;
      away.scoreFor += result.awayScore;
      away.scoreAgainst += result.homeScore;
      home.totalScore += result.homeScore;
      away.totalScore += result.awayScore;

      if (result.isTie) {
        home.ties += 1;
        away.ties += 1;
        home.points += 1;
        away.points += 1;
      } else if (result.winnerUserId === home.userId) {
        home.wins += 1;
        away.losses += 1;
        home.points += 2;
      } else {
        away.wins += 1;
        home.losses += 1;
        away.points += 2;
      }
    }

    const ranked = Array.from(table.values())
      .map((row) => ({
        ...row,
        scoreFor: this.round2(row.scoreFor),
        scoreAgainst: this.round2(row.scoreAgainst),
        totalScore: this.round2(row.totalScore)
      }))
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        const diffA = a.scoreFor - a.scoreAgainst;
        const diffB = b.scoreFor - b.scoreAgainst;
        if (diffB !== diffA) return diffB - diffA;
        if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
        return a.userId.localeCompare(b.userId);
      })
      .map((row, index) => ({ ...row, rank: index + 1 }));

    await this.store.replaceLeagueTable(leagueId, ranked);
  }

  private async scoreTeam(players: TeamPlayerRecord[], captainPlayerId?: string, viceCaptainPlayerId?: string): Promise<number> {
    if (players.length === 0) {
      return 0;
    }

    const playerIds = players.map((player) => player.playerId);
    const poolPlayers = await this.store.getPlayersByIds(playerIds);
    const pointsMap = new Map(poolPlayers.map((player) => [player.id, player.fantasyPoints]));

    let base = 0;
    for (const player of players) {
      base += pointsMap.get(player.playerId) || 0;
    }

    const captainPoints = captainPlayerId ? (pointsMap.get(captainPlayerId) || 0) : 0;
    const vicePoints = viceCaptainPlayerId ? (pointsMap.get(viceCaptainPlayerId) || 0) : 0;
    const total = base + captainPoints + (vicePoints * 0.5);
    return this.round2(total);
  }

  private async buildLiveTeamScore(
    userId: string,
    team: LeagueTeamRecord | null,
    activeTeamCodes: Set<string>
  ): Promise<LiveTeamScore> {
    const userDisplayName = await this.lookupDisplayName(userId, new Map<string, string>());

    if (!team) {
      return {
        userId,
        userDisplayName,
        teamName: "No team submitted",
        hasSubmittedTeam: false,
        activeScore: 0,
        totalScore: 0,
        activePlayers: []
      };
    }

    const playerIds = team.players.map((player) => player.playerId);
    const poolPlayers = await this.store.getPlayersByIds(playerIds);
    const pointsMap = new Map(poolPlayers.map((player) => [player.id, player.fantasyPoints]));

    const activePlayers: LivePlayerScore[] = [];
    let activeScore = 0;
    let totalScore = 0;

    for (const player of team.players) {
      const basePoints = this.round2(pointsMap.get(player.playerId) || 0);
      let multiplier = 1;
      if (player.playerId === team.captainPlayerId) {
        multiplier = 2;
      } else if (player.playerId === team.viceCaptainPlayerId) {
        multiplier = 1.5;
      }

      const points = this.round2(basePoints * multiplier);
      totalScore += points;

      if (!activeTeamCodes.has(player.teamCode)) {
        continue;
      }

      activeScore += points;
      activePlayers.push({
        playerId: player.playerId,
        playerName: player.playerName,
        teamCode: player.teamCode,
        role: player.role,
        basePoints,
        multiplier,
        points
      });
    }

    return {
      userId,
      userDisplayName,
      teamName: team.teamName,
      hasSubmittedTeam: true,
      activeScore: this.round2(activeScore),
      totalScore: this.round2(totalScore),
      activePlayers
    };
  }

  private async withFixtureDisplayNames(fixtures: HeadToHeadFixture[]): Promise<HeadToHeadFixture[]> {
    const nameCache = new Map<string, string>();
    const teamNameCache = new Map<string, string | undefined>();
    const mapped: HeadToHeadFixture[] = [];

    for (const fixture of fixtures) {
      const homeDisplayName = await this.lookupDisplayName(fixture.homeUserId, nameCache);
      const awayDisplayName = await this.lookupDisplayName(fixture.awayUserId, nameCache);
      const homeTeamName = await this.lookupTeamName(fixture.leagueId, fixture.homeUserId, fixture.gameDay, teamNameCache);
      const awayTeamName = await this.lookupTeamName(fixture.leagueId, fixture.awayUserId, fixture.gameDay, teamNameCache);
      mapped.push({
        ...fixture,
        homeDisplayName,
        awayDisplayName,
        homeTeamName,
        awayTeamName
      });
    }

    return mapped;
  }

  private async lookupDisplayName(userId: string, cache: Map<string, string>): Promise<string> {
    const cached = cache.get(userId);
    if (cached) {
      return cached;
    }

    // Some seeded/demo members use non-UUID ids (e.g. owner-1, dummy-01).
    if (!/^[0-9a-fA-F-]{36}$/.test(userId)) {
      cache.set(userId, userId);
      return userId;
    }

    let value = userId;
    try {
      const user = await this.store.getAuthUserById(userId);
      value = user?.displayName || userId;
    } catch {
      value = userId;
    }
    cache.set(userId, value);
    return value;
  }

  private async lookupTeamName(
    leagueId: string,
    userId: string,
    gameDay: string,
    cache: Map<string, string | undefined>,
    useCutoff = false
  ): Promise<string | undefined> {
    const key = `${leagueId}:${userId}:${gameDay}`;
    if (cache.has(key)) {
      return cache.get(key);
    }

    const member = await this.store.getLeagueMember(leagueId, userId);
    const memberTeamName = member?.teamName?.trim();
    if (memberTeamName) {
      cache.set(key, memberTeamName);
      return memberTeamName;
    }

    // For table lookups (cutoff-based), find the most recent team on or before
    // the cutoff day rather than requiring an exact game day match.
    const team = useCutoff
      ? await this.store.getLatestUserTeamOnOrBefore(leagueId, userId, gameDay)
      : await this.store.getUserTeam(leagueId, userId, gameDay);

    // If there is no team for the selected day/cutoff, keep a stable league-level
    // team identity by falling back to the user's most recently named team in this league.
    const latestTeam = team || await this.store.getLatestUserTeam(leagueId, userId);

    let value = latestTeam?.teamName;
    if (!value) {
      const [league, displayName] = await Promise.all([
        this.store.getLeagueById(leagueId),
        this.lookupDisplayName(userId, new Map<string, string>())
      ]);
      const leagueName = league?.name || "League";
      value = `${displayName} - ${leagueName}`;
    }

    cache.set(key, value);
    return value;
  }

  private async assertLeagueMember(leagueId: string, userId: string): Promise<void> {
    const isMember = await this.store.isLeagueMember(leagueId, userId);
    if (!isMember) {
      throw new Error("Forbidden: join this league to view H2H schedule and table");
    }
  }

  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private buildRoundRobinRounds(userIds: string[]): Array<Array<[string, string]>> {
    const players = [...userIds];
    const hasBye = players.length % 2 !== 0;
    if (hasBye) {
      players.push("__BYE__");
    }

    const rounds: Array<Array<[string, string]>> = [];

    for (let round = 0; round < players.length - 1; round += 1) {
      const pairings: Array<[string, string]> = [];
      for (let index = 0; index < players.length / 2; index += 1) {
        const home = players[index];
        const away = players[players.length - 1 - index];
        if (home === "__BYE__" || away === "__BYE__") {
          continue;
        }
        pairings.push(round % 2 === 0 ? [home, away] : [away, home]);
      }
      rounds.push(pairings);

      const fixed = players[0];
      const rotating = players.slice(1);
      rotating.unshift(rotating.pop() as string);
      players.splice(0, players.length, fixed, ...rotating);
    }

    return rounds;
  }
}
