import { Pool } from "pg";

export interface LeagueRecord {
  id: string;
  creatorId: string;
  name: string;
  description?: string;
  memberLimit: number;
  totalBudget: number;
  joinDeadline: string;
  scoringPreferences: Record<string, unknown>;
  state: "draft" | "active" | "concluded";
  inviteCode: string;
  memberCount: number;
  createdAt: string;
  startsAt?: string;
  endsAt?: string;
}

export interface LeagueMemberRecord {
  id: string;
  leagueId: string;
  userId: string;
  teamName?: string;
  joinedAt: string;
}

export interface TeamPlayerRecord {
  playerId: string;
  playerName: string;
  teamCode: string;
  role: "WK" | "BAT" | "AR" | "BOWL";
  cost: number;
}

export interface LeagueTeamRecord {
  id: string;
  leagueId: string;
  userId: string;
  gameDay: string;
  teamName: string;
  players: TeamPlayerRecord[];
  captainPlayerId: string;
  viceCaptainPlayerId: string;
  totalBudgetUsed: number;
  createdAt: string;
  updatedAt: string;
  lockedAt?: string;
}

export interface IplPlayerRecord {
  id: string;
  externalPlayerId?: number;
  name: string;
  role: "WK" | "BAT" | "AR" | "BOWL";
  teamCode: string;
  teamName: string;
  form: number;
  status: "active" | "injured" | "unavailable";
  fantasyPoints: number;
  isOverseas: boolean;
  salary: number;
  source: string;
  sourceUrl?: string;
}

export interface PlayerTeamSummary {
  teamCode: string;
  teamName: string;
  playerCount: number;
}

export interface AuthUserRecord {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  role: "member" | "admin";
  createdAt: string;
}

export interface AuthSessionRecord {
  id: string;
  userId: string;
  token: string;
  expiresAt: string;
  createdAt: string;
}

export interface LeagueHeadToHeadFixtureRecord {
  id: string;
  leagueId: string;
  gameDay: string;
  round: number;
  homeUserId: string;
  awayUserId: string;
  lockAt: string;
  createdAt: string;
}

export interface LeagueHeadToHeadResultRecord {
  id: string;
  fixtureId: string;
  leagueId: string;
  gameDay: string;
  homeUserId: string;
  awayUserId: string;
  homeScore: number;
  awayScore: number;
  winnerUserId?: string;
  isTie: boolean;
  settledAt: string;
}

export interface LeagueTableRowRecord {
  userId: string;
  played: number;
  wins: number;
  losses: number;
  ties: number;
  points: number;
  scoreFor: number;
  scoreAgainst: number;
  totalScore: number;
  rank: number;
}

const DEFAULT_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/fantasy_ipl_2026";

export class RuntimeStore {
  private readonly pool: Pool;

  constructor(connectionString = process.env.DATABASE_URL || DEFAULT_DATABASE_URL) {
    this.pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30_000
    });
  }

  async ensureLeagueSchemaCompat(): Promise<void> {
    await this.pool.query("ALTER TABLE league_members ADD COLUMN IF NOT EXISTS team_name VARCHAR(100)");
    await this.pool.query("ALTER TABLE league_teams ADD COLUMN IF NOT EXISTS game_day DATE NOT NULL DEFAULT CURRENT_DATE");
    await this.pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'league_teams_league_id_user_id_key'
        ) THEN
          ALTER TABLE league_teams DROP CONSTRAINT league_teams_league_id_user_id_key;
        END IF;
      END $$;
    `);
    await this.pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'league_teams_league_id_user_id_game_day_key'
        ) THEN
          ALTER TABLE league_teams
            ADD CONSTRAINT league_teams_league_id_user_id_game_day_key
            UNIQUE (league_id, user_id, game_day);
        END IF;
      END $$;
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS league_h2h_fixtures (
        id UUID PRIMARY KEY,
        league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
        game_day DATE NOT NULL,
        round INTEGER NOT NULL,
        home_user_id VARCHAR(255) NOT NULL,
        away_user_id VARCHAR(255) NOT NULL,
        lock_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (league_id, game_day, home_user_id, away_user_id)
      );
    `);
    await this.pool.query("ALTER TABLE leaderboards ADD COLUMN IF NOT EXISTS points INTEGER NOT NULL DEFAULT 0");
    await this.pool.query("ALTER TABLE leaderboards ADD COLUMN IF NOT EXISTS score_for NUMERIC(10,2) NOT NULL DEFAULT 0");
    await this.pool.query("ALTER TABLE leaderboards ADD COLUMN IF NOT EXISTS score_against NUMERIC(10,2) NOT NULL DEFAULT 0");
    await this.pool.query("ALTER TABLE leaderboards ADD COLUMN IF NOT EXISTS total_score NUMERIC(10,2) NOT NULL DEFAULT 0");
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS league_h2h_results (
        id UUID PRIMARY KEY,
        fixture_id UUID NOT NULL REFERENCES league_h2h_fixtures(id) ON DELETE CASCADE,
        league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
        game_day DATE NOT NULL,
        home_user_id VARCHAR(255) NOT NULL,
        away_user_id VARCHAR(255) NOT NULL,
        home_score NUMERIC(10, 2) NOT NULL DEFAULT 0,
        away_score NUMERIC(10, 2) NOT NULL DEFAULT 0,
        winner_user_id VARCHAR(255),
        is_tie BOOLEAN NOT NULL DEFAULT FALSE,
        settled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (fixture_id)
      );
    `);
    await this.pool.query("CREATE INDEX IF NOT EXISTS idx_league_teams_league_day ON league_teams (league_id, game_day)");
    await this.pool.query("CREATE INDEX IF NOT EXISTS idx_h2h_league_day ON league_h2h_fixtures (league_id, game_day)");
    await this.pool.query("CREATE INDEX IF NOT EXISTS idx_h2h_results_league_day ON league_h2h_results (league_id, game_day)");
  }

  async createLeagueWithCreator(league: LeagueRecord, creatorMembership: LeagueMemberRecord): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(
        `
          INSERT INTO leagues (
            id,
            creator_id,
            name,
            description,
            member_limit,
            total_budget,
            join_deadline,
            scoring_preferences,
            state,
            invite_code,
            member_count,
            created_at,
            starts_at,
            ends_at
          ) VALUES (
            $1::uuid,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7::timestamptz,
            $8::jsonb,
            $9,
            $10,
            $11,
            $12::timestamptz,
            $13::timestamptz,
            $14::timestamptz
          )
        `,
        [
          league.id,
          league.creatorId,
          league.name,
          league.description || null,
          league.memberLimit,
          league.totalBudget,
          league.joinDeadline,
          JSON.stringify(league.scoringPreferences),
          league.state,
          league.inviteCode,
          league.memberCount,
          league.createdAt,
          league.startsAt || null,
          league.endsAt || null
        ]
      );
      await client.query(
        `
          INSERT INTO league_members (
            id,
            league_id,
            user_id,
            team_name,
            joined_at
          ) VALUES (
            $1::uuid,
            $2::uuid,
            $3,
            NULL,
            $4::timestamptz
          )
        `,
        [creatorMembership.id, creatorMembership.leagueId, creatorMembership.userId, creatorMembership.joinedAt]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getLeagueById(leagueId: string): Promise<LeagueRecord | null> {
    return this.queryOne<LeagueRecord>(
      `
        SELECT ${this.leagueProjection("l")}
        FROM leagues l
        WHERE l.id = $1::uuid
      `,
      [leagueId]
    );
  }

  async getLeagueByInviteCode(inviteCode: string): Promise<LeagueRecord | null> {
    return this.queryOne<LeagueRecord>(
      `
        SELECT ${this.leagueProjection("l")}
        FROM leagues l
        WHERE l.invite_code = $1
      `,
      [inviteCode.toUpperCase()]
    );
  }

  async getUserLeagues(userId: string): Promise<LeagueRecord[]> {
    return this.queryMany<LeagueRecord>(
      `
        SELECT ${this.leagueProjection("l")}
        FROM leagues l
        INNER JOIN league_members lm ON lm.league_id = l.id
        WHERE lm.user_id = $1
        ORDER BY l.created_at DESC
      `,
      [userId]
    );
  }

  async getAllLeagues(): Promise<LeagueRecord[]> {
    return this.queryMany<LeagueRecord>(`
      SELECT ${this.leagueProjection("l")}
      FROM leagues l
      ORDER BY l.created_at DESC
    `);
  }

  async isLeagueMember(leagueId: string, userId: string): Promise<boolean> {
    const result = await this.pool.query<{ isMember: boolean }>(
      `
        SELECT EXISTS(
          SELECT 1
          FROM league_members
          WHERE league_id = $1::uuid
            AND user_id = $2
        ) AS "isMember"
      `,
      [leagueId, userId]
    );

    return result.rows[0]?.isMember ?? false;
  }

  async addLeagueMember(leagueId: string, userId: string): Promise<LeagueRecord> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(
        `
          INSERT INTO league_members (
            id,
            league_id,
            user_id,
            team_name,
            joined_at
          ) VALUES (
            $1::uuid,
            $2::uuid,
            $3,
            NULL,
            NOW()
          )
        `,
        [this.generateId(), leagueId, userId]
      );
      await client.query(
        `
          UPDATE leagues
          SET member_count = member_count + 1
          WHERE id = $1::uuid
        `,
        [leagueId]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const league = await this.getLeagueById(leagueId);
    if (!league) {
      throw new Error("League not found after join");
    }
    return league;
  }

  async getLeagueMembers(leagueId: string): Promise<LeagueMemberRecord[]> {
    return this.queryMany<LeagueMemberRecord>(
      `
        SELECT
          lm.id::text AS "id",
          lm.league_id::text AS "leagueId",
          lm.user_id AS "userId",
          lm.team_name AS "teamName",
          lm.joined_at::text AS "joinedAt"
        FROM league_members lm
        WHERE lm.league_id = $1::uuid
        ORDER BY lm.joined_at ASC
      `,
      [leagueId]
    );
  }

  async getLeagueMember(leagueId: string, userId: string): Promise<LeagueMemberRecord | null> {
    return this.queryOne<LeagueMemberRecord>(
      `
        SELECT
          lm.id::text AS "id",
          lm.league_id::text AS "leagueId",
          lm.user_id AS "userId",
          lm.team_name AS "teamName",
          lm.joined_at::text AS "joinedAt"
        FROM league_members lm
        WHERE lm.league_id = $1::uuid
          AND lm.user_id = $2
      `,
      [leagueId, userId]
    );
  }

  async setLeagueMemberTeamName(leagueId: string, userId: string, teamName: string): Promise<void> {
    await this.pool.query(
      `
        UPDATE league_members
        SET team_name = $3
        WHERE league_id = $1::uuid
          AND user_id = $2
      `,
      [leagueId, userId, teamName]
    );
  }

  async updateLeagueTeamNames(leagueId: string, userId: string, teamName: string): Promise<void> {
    await this.pool.query(
      `
        UPDATE league_teams
        SET team_name = $3,
            updated_at = NOW()
        WHERE league_id = $1::uuid
          AND user_id = $2
      `,
      [leagueId, userId, teamName]
    );
  }

  async upsertLeagueTeam(team: LeagueTeamRecord): Promise<LeagueTeamRecord> {
    await this.pool.query(
      `
        INSERT INTO league_teams (
          id,
          league_id,
          user_id,
          game_day,
          team_name,
          players,
          captain_player_id,
          vice_captain_player_id,
          total_budget_used,
          locked_at,
          created_at,
          updated_at
        ) VALUES (
          $1::uuid,
          $2::uuid,
          $3,
          $4::date,
          $5,
          $6::jsonb,
          $7,
          $8,
          $9,
          $10::timestamptz,
          $11::timestamptz,
          $12::timestamptz
        )
        ON CONFLICT (league_id, user_id, game_day)
        DO UPDATE SET
          team_name = EXCLUDED.team_name,
          players = EXCLUDED.players,
          captain_player_id = EXCLUDED.captain_player_id,
          vice_captain_player_id = EXCLUDED.vice_captain_player_id,
          total_budget_used = EXCLUDED.total_budget_used,
          updated_at = EXCLUDED.updated_at,
          locked_at = EXCLUDED.locked_at
      `,
      [
        team.id,
        team.leagueId,
        team.userId,
        team.gameDay,
        team.teamName,
        JSON.stringify(team.players),
        team.captainPlayerId,
        team.viceCaptainPlayerId,
        team.totalBudgetUsed,
        team.lockedAt || null,
        team.createdAt,
        team.updatedAt
      ]
    );

    const savedTeam = await this.getUserTeam(team.leagueId, team.userId, team.gameDay);
    if (!savedTeam) {
      throw new Error("Team not found after upsert");
    }
    return savedTeam;
  }

  async getLeagueTeams(leagueId: string, gameDay?: string): Promise<LeagueTeamRecord[]> {
    if (!gameDay) {
      return this.queryMany<LeagueTeamRecord>(
        `
          SELECT ${this.teamProjection("lt")}
          FROM league_teams lt
          WHERE lt.league_id = $1::uuid
          ORDER BY lt.game_day DESC, lt.updated_at DESC
        `,
        [leagueId]
      );
    }

    return this.queryMany<LeagueTeamRecord>(
      `
        SELECT ${this.teamProjection("lt")}
        FROM league_teams lt
        WHERE lt.league_id = $1::uuid
          AND lt.game_day = $2::date
        ORDER BY lt.updated_at DESC
      `,
      [leagueId, gameDay]
    );
  }

  async getUserTeam(leagueId: string, userId: string, gameDay?: string): Promise<LeagueTeamRecord | null> {
    if (!gameDay) {
      return this.queryOne<LeagueTeamRecord>(
        `
          SELECT ${this.teamProjection("lt")}
          FROM league_teams lt
          WHERE lt.league_id = $1::uuid
            AND lt.user_id = $2
            AND lt.game_day = CURRENT_DATE
        `,
        [leagueId, userId]
      );
    }

    return this.queryOne<LeagueTeamRecord>(
      `
        SELECT ${this.teamProjection("lt")}
        FROM league_teams lt
        WHERE lt.league_id = $1::uuid
          AND lt.user_id = $2
          AND lt.game_day = $3::date
      `,
      [leagueId, userId, gameDay]
    );
  }

  async getLatestUserTeamOnOrBefore(leagueId: string, userId: string, cutoff: string): Promise<LeagueTeamRecord | null> {
    return this.queryOne<LeagueTeamRecord>(
      `
        SELECT ${this.teamProjection("lt")}
        FROM league_teams lt
        WHERE lt.league_id = $1::uuid
          AND lt.user_id = $2
          AND lt.game_day <= $3::date
        ORDER BY lt.game_day DESC, lt.updated_at DESC
        LIMIT 1
      `,
      [leagueId, userId, cutoff]
    );
  }

  async getLatestUserTeam(leagueId: string, userId: string): Promise<LeagueTeamRecord | null> {
    return this.queryOne<LeagueTeamRecord>(
      `
        SELECT ${this.teamProjection("lt")}
        FROM league_teams lt
        WHERE lt.league_id = $1::uuid
          AND lt.user_id = $2
        ORDER BY lt.game_day DESC, lt.updated_at DESC
        LIMIT 1
      `,
      [leagueId, userId]
    );
  }

  async replaceHeadToHeadFixtures(leagueId: string, fixtures: LeagueHeadToHeadFixtureRecord[]): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM league_h2h_fixtures WHERE league_id = $1::uuid", [leagueId]);

      for (const fixture of fixtures) {
        await client.query(
          `
            INSERT INTO league_h2h_fixtures (
              id,
              league_id,
              game_day,
              round,
              home_user_id,
              away_user_id,
              lock_at,
              created_at
            ) VALUES (
              $1::uuid,
              $2::uuid,
              $3::date,
              $4,
              $5,
              $6,
              $7::timestamptz,
              $8::timestamptz
            )
          `,
          [
            fixture.id,
            fixture.leagueId,
            fixture.gameDay,
            fixture.round,
            fixture.homeUserId,
            fixture.awayUserId,
            fixture.lockAt,
            fixture.createdAt
          ]
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getLeagueHeadToHeadFixtures(leagueId: string, gameDay?: string): Promise<LeagueHeadToHeadFixtureRecord[]> {
    if (!gameDay) {
      return this.queryMany<LeagueHeadToHeadFixtureRecord>(
        `
          SELECT
            f.id::text AS "id",
            f.league_id::text AS "leagueId",
            f.game_day::text AS "gameDay",
            f.round AS "round",
            f.home_user_id AS "homeUserId",
            f.away_user_id AS "awayUserId",
            f.lock_at::text AS "lockAt",
            f.created_at::text AS "createdAt"
          FROM league_h2h_fixtures f
          WHERE f.league_id = $1::uuid
          ORDER BY f.game_day ASC, f.round ASC, f.home_user_id ASC
        `,
        [leagueId]
      );
    }

    return this.queryMany<LeagueHeadToHeadFixtureRecord>(
      `
        SELECT
          f.id::text AS "id",
          f.league_id::text AS "leagueId",
          f.game_day::text AS "gameDay",
          f.round AS "round",
          f.home_user_id AS "homeUserId",
          f.away_user_id AS "awayUserId",
          f.lock_at::text AS "lockAt",
          f.created_at::text AS "createdAt"
        FROM league_h2h_fixtures f
        WHERE f.league_id = $1::uuid
          AND f.game_day = $2::date
        ORDER BY f.round ASC, f.home_user_id ASC
      `,
      [leagueId, gameDay]
    );
  }

  async getUnsettledHeadToHeadFixtures(leagueId: string, throughGameDay: string): Promise<LeagueHeadToHeadFixtureRecord[]> {
    return this.queryMany<LeagueHeadToHeadFixtureRecord>(
      `
        SELECT
          f.id::text AS "id",
          f.league_id::text AS "leagueId",
          f.game_day::text AS "gameDay",
          f.round AS "round",
          f.home_user_id AS "homeUserId",
          f.away_user_id AS "awayUserId",
          f.lock_at::text AS "lockAt",
          f.created_at::text AS "createdAt"
        FROM league_h2h_fixtures f
        LEFT JOIN league_h2h_results r ON r.fixture_id = f.id
        WHERE f.league_id = $1::uuid
          AND f.game_day <= $2::date
          AND r.id IS NULL
        ORDER BY f.game_day ASC, f.round ASC
      `,
      [leagueId, throughGameDay]
    );
  }

  async insertHeadToHeadResults(results: LeagueHeadToHeadResultRecord[]): Promise<void> {
    if (results.length === 0) {
      return;
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const result of results) {
        await client.query(
          `
            INSERT INTO league_h2h_results (
              id,
              fixture_id,
              league_id,
              game_day,
              home_user_id,
              away_user_id,
              home_score,
              away_score,
              winner_user_id,
              is_tie,
              settled_at
            ) VALUES (
              $1::uuid,
              $2::uuid,
              $3::uuid,
              $4::date,
              $5,
              $6,
              $7,
              $8,
              $9,
              $10,
              $11::timestamptz
            )
            ON CONFLICT (fixture_id) DO NOTHING
          `,
          [
            result.id,
            result.fixtureId,
            result.leagueId,
            result.gameDay,
            result.homeUserId,
            result.awayUserId,
            result.homeScore,
            result.awayScore,
            result.winnerUserId || null,
            result.isTie,
            result.settledAt
          ]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getLeagueHeadToHeadResults(leagueId: string): Promise<LeagueHeadToHeadResultRecord[]> {
    return this.queryMany<LeagueHeadToHeadResultRecord>(
      `
        SELECT
          r.id::text AS "id",
          r.fixture_id::text AS "fixtureId",
          r.league_id::text AS "leagueId",
          r.game_day::text AS "gameDay",
          r.home_user_id AS "homeUserId",
          r.away_user_id AS "awayUserId",
          r.home_score::float8 AS "homeScore",
          r.away_score::float8 AS "awayScore",
          r.winner_user_id AS "winnerUserId",
          r.is_tie AS "isTie",
          r.settled_at::text AS "settledAt"
        FROM league_h2h_results r
        WHERE r.league_id = $1::uuid
        ORDER BY r.game_day ASC, r.settled_at ASC
      `,
      [leagueId]
    );
  }

  async getPlayersByIds(playerIds: string[]): Promise<IplPlayerRecord[]> {
    if (playerIds.length === 0) {
      return [];
    }

    return this.queryMany<IplPlayerRecord>(
      `
        SELECT ${this.playerProjection("p")}
        FROM ipl_players p
        WHERE p.id::text = ANY($1::text[])
      `,
      [playerIds]
    );
  }

  async replaceLeagueTable(leagueId: string, rows: LeagueTableRowRecord[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM leaderboards WHERE league_id = $1::uuid", [leagueId]);
      for (const row of rows) {
        await client.query(
          `
            INSERT INTO leaderboards (
              id,
              league_id,
              user_id,
              wins,
              losses,
              ties,
              points,
              score_for,
              score_against,
              total_score,
              total_points,
              rank,
              updated_at
            ) VALUES (
              $1::uuid,
              $2::uuid,
              $3,
              $4,
              $5,
              $6,
              $7,
              $8,
              $9,
              $10,
              $11,
              $12,
              NOW()
            )
          `,
          [
            this.generateId(),
            leagueId,
            row.userId,
            row.wins,
            row.losses,
            row.ties,
            row.points,
            row.scoreFor,
            row.scoreAgainst,
            row.totalScore,
            row.totalScore,
            row.rank
          ]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getLeagueTable(leagueId: string): Promise<LeagueTableRowRecord[]> {
    return this.queryMany<LeagueTableRowRecord>(
      `
        SELECT
          l.user_id AS "userId",
          (l.wins + l.losses + l.ties) AS "played",
          l.wins AS "wins",
          l.losses AS "losses",
          l.ties AS "ties",
          l.points AS "points",
          l.score_for::float8 AS "scoreFor",
          l.score_against::float8 AS "scoreAgainst",
          l.total_score::float8 AS "totalScore",
          l.rank AS "rank"
        FROM leaderboards l
        WHERE l.league_id = $1::uuid
        ORDER BY l.rank ASC NULLS LAST, l.points DESC, l.total_score DESC
      `,
      [leagueId]
    );
  }

  async reset(): Promise<void> {
    await this.pool.query(`
      DO $$
      BEGIN
        IF to_regclass('public.league_h2h_fixtures') IS NOT NULL AND to_regclass('public.league_h2h_results') IS NOT NULL THEN
          TRUNCATE TABLE league_h2h_results, league_h2h_fixtures, league_teams, league_members, leaderboards, leagues RESTART IDENTITY CASCADE;
        ELSIF to_regclass('public.league_h2h_fixtures') IS NOT NULL THEN
          TRUNCATE TABLE league_h2h_fixtures, league_teams, league_members, leaderboards, leagues RESTART IDENTITY CASCADE;
        ELSE
          TRUNCATE TABLE league_teams, league_members, leaderboards, leagues RESTART IDENTITY CASCADE;
        END IF;
      END $$;
    `);
  }

  async getPlayers(filters?: { teamCode?: string; role?: string; status?: string; q?: string; overseas?: string }): Promise<IplPlayerRecord[]> {
    const where: string[] = [];
    const values: unknown[] = [];

    if (filters?.teamCode) {
      values.push(filters.teamCode.toUpperCase());
      where.push(`p.team_code = $${values.length}`);
    }

    if (filters?.role) {
      values.push(filters.role.toUpperCase());
      where.push(`p.role = $${values.length}`);
    }

    if (filters?.status) {
      values.push(filters.status.toLowerCase());
      where.push(`p.status = $${values.length}`);
    }

    if (filters?.q) {
      values.push(`%${filters.q.trim()}%`);
      where.push(`p.name ILIKE $${values.length}`);
    }

    if (filters?.overseas === "true") {
      where.push(`p.is_overseas = TRUE`);
    } else if (filters?.overseas === "false") {
      where.push(`p.is_overseas = FALSE`);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    return this.queryMany<IplPlayerRecord>(
      `
        SELECT ${this.playerProjection("p")}
        FROM ipl_players p
        ${whereClause}
        ORDER BY p.team_code ASC, p.name ASC
      `,
      values
    );
  }

  async getPlayerTeamSummaries(): Promise<PlayerTeamSummary[]> {
    return this.queryMany<PlayerTeamSummary>(`
      SELECT
        p.team_code AS "teamCode",
        p.team_name AS "teamName",
        COUNT(*)::int AS "playerCount"
      FROM ipl_players p
      GROUP BY p.team_code, p.team_name
      ORDER BY p.team_code ASC
    `);
  }

  async createAuthUser(user: AuthUserRecord): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO auth_users (
          id,
          email,
          password_hash,
          display_name,
          role,
          created_at
        ) VALUES (
          $1::uuid,
          $2,
          $3,
          $4,
          $5,
          $6::timestamptz
        )
      `,
      [user.id, user.email.toLowerCase(), user.passwordHash, user.displayName, user.role ?? "member", user.createdAt]
    );
  }

  async getAuthUserByEmail(email: string): Promise<AuthUserRecord | null> {
    return this.queryOne<AuthUserRecord>(
      `
        SELECT
          u.id::text AS "id",
          u.email AS "email",
          u.password_hash AS "passwordHash",
          u.display_name AS "displayName",
          u.role AS "role",
          u.created_at::text AS "createdAt"
        FROM auth_users u
        WHERE u.email = $1
      `,
      [email.toLowerCase()]
    );
  }

  async getAuthUserById(userId: string): Promise<AuthUserRecord | null> {
    return this.queryOne<AuthUserRecord>(
      `
        SELECT
          u.id::text AS "id",
          u.email AS "email",
          u.password_hash AS "passwordHash",
          u.display_name AS "displayName",
          u.role AS "role",
          u.created_at::text AS "createdAt"
        FROM auth_users u
        WHERE u.id = $1::uuid
      `,
      [userId]
    );
  }

  async createAuthSession(session: AuthSessionRecord): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO auth_sessions (
          id,
          user_id,
          token,
          expires_at,
          created_at
        ) VALUES (
          $1::uuid,
          $2::uuid,
          $3,
          $4::timestamptz,
          $5::timestamptz
        )
      `,
      [session.id, session.userId, session.token, session.expiresAt, session.createdAt]
    );
  }

  async getAuthUserByToken(token: string): Promise<AuthUserRecord | null> {
    return this.queryOne<AuthUserRecord>(
      `
        SELECT
          u.id::text AS "id",
          u.email AS "email",
          u.password_hash AS "passwordHash",
          u.display_name AS "displayName",
          u.role AS "role",
          u.created_at::text AS "createdAt"
        FROM auth_sessions s
        INNER JOIN auth_users u ON u.id = s.user_id
        WHERE s.token = $1
          AND s.expires_at > NOW()
      `,
      [token]
    );
  }

  async revokeAuthSession(token: string): Promise<void> {
    await this.pool.query("DELETE FROM auth_sessions WHERE token = $1", [token]);
  }

  private async queryOne<T>(sql: string, values: unknown[] = []): Promise<T | null> {
    const result = await this.pool.query<T>(sql, values);
    if (result.rows.length === 0) {
      return null;
    }
    return result.rows[0];
  }

  private async queryMany<T>(sql: string, values: unknown[] = []): Promise<T[]> {
    const result = await this.pool.query<T>(sql, values);
    return result.rows;
  }

  private leagueProjection(alias: string): string {
    return [
      `${alias}.id::text AS "id"`,
      `${alias}.creator_id AS "creatorId"`,
      `${alias}.name AS "name"`,
      `${alias}.description AS "description"`,
      `${alias}.member_limit AS "memberLimit"`,
      `${alias}.total_budget AS "totalBudget"`,
      `${alias}.join_deadline::text AS "joinDeadline"`,
      `${alias}.scoring_preferences AS "scoringPreferences"`,
      `${alias}.state AS "state"`,
      `${alias}.invite_code AS "inviteCode"`,
      `${alias}.member_count AS "memberCount"`,
      `${alias}.created_at::text AS "createdAt"`,
      `${alias}.starts_at::text AS "startsAt"`,
      `${alias}.ends_at::text AS "endsAt"`
    ].join(",\n        ");
  }

  private teamProjection(alias: string): string {
    return [
      `${alias}.id::text AS "id"`,
      `${alias}.league_id::text AS "leagueId"`,
      `${alias}.user_id AS "userId"`,
      `${alias}.game_day::text AS "gameDay"`,
      `${alias}.team_name AS "teamName"`,
      `${alias}.players AS "players"`,
      `${alias}.captain_player_id AS "captainPlayerId"`,
      `${alias}.vice_captain_player_id AS "viceCaptainPlayerId"`,
      `${alias}.total_budget_used AS "totalBudgetUsed"`,
      `${alias}.created_at::text AS "createdAt"`,
      `${alias}.updated_at::text AS "updatedAt"`,
      `${alias}.locked_at::text AS "lockedAt"`
    ].join(",\n        ");
  }

  private playerProjection(alias: string): string {
    return [
      `${alias}.id::text AS "id"`,
      `${alias}.external_player_id AS "externalPlayerId"`,
      `${alias}.name AS "name"`,
      `${alias}.role AS "role"`,
      `${alias}.team_code AS "teamCode"`,
      `${alias}.team_name AS "teamName"`,
      `${alias}.player_form AS "form"`,
      `${alias}.status AS "status"`,
      `${alias}.fantasy_points::float8 AS "fantasyPoints"`,
      `${alias}.is_overseas AS "isOverseas"`,
      `${alias}.salary::float8 AS "salary"`,
      `${alias}.source AS "source"`,
      `${alias}.source_url AS "sourceUrl"`
    ].join(",\n        ");
  }

  private generateId(): string {
    return crypto.randomUUID();
  }
}
