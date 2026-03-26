-- PostgreSQL schema for the league and team modules.
-- Apply with: psql "$DATABASE_URL" -f apps/api/src/leagues/league.schema.sql

CREATE TABLE IF NOT EXISTS leagues (
  id UUID PRIMARY KEY,
  creator_id VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  member_limit INTEGER NOT NULL DEFAULT 4,
  total_budget INTEGER NOT NULL DEFAULT 100,
  join_deadline TIMESTAMPTZ NOT NULL,
  scoring_preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  state VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'active', 'concluded')),
  invite_code VARCHAR(20) NOT NULL UNIQUE,
  member_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS league_members (
  id UUID PRIMARY KEY,
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (league_id, user_id)
);

CREATE TABLE IF NOT EXISTS league_teams (
  id UUID PRIMARY KEY,
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL,
  game_day DATE NOT NULL DEFAULT CURRENT_DATE,
  team_name VARCHAR(100) NOT NULL,
  players JSONB NOT NULL DEFAULT '[]'::jsonb,
  captain_player_id VARCHAR(255) NOT NULL,
  vice_captain_player_id VARCHAR(255) NOT NULL,
  total_budget_used INTEGER NOT NULL DEFAULT 0,
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (league_id, user_id, game_day)
);

ALTER TABLE league_teams ADD COLUMN IF NOT EXISTS game_day DATE NOT NULL DEFAULT CURRENT_DATE;
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
ALTER TABLE league_teams
  ADD CONSTRAINT league_teams_league_id_user_id_game_day_key
  UNIQUE (league_id, user_id, game_day);

CREATE TABLE IF NOT EXISTS leaderboards (
  id UUID PRIMARY KEY,
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  ties INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  score_for NUMERIC(10, 2) NOT NULL DEFAULT 0,
  score_against NUMERIC(10, 2) NOT NULL DEFAULT 0,
  total_score NUMERIC(10, 2) NOT NULL DEFAULT 0,
  total_points NUMERIC(10, 2) NOT NULL DEFAULT 0,
  rank INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (league_id, user_id)
);

ALTER TABLE leaderboards ADD COLUMN IF NOT EXISTS points INTEGER NOT NULL DEFAULT 0;
ALTER TABLE leaderboards ADD COLUMN IF NOT EXISTS score_for NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE leaderboards ADD COLUMN IF NOT EXISTS score_against NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE leaderboards ADD COLUMN IF NOT EXISTS total_score NUMERIC(10,2) NOT NULL DEFAULT 0;

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

CREATE TABLE IF NOT EXISTS ipl_players (
  id UUID PRIMARY KEY,
  external_player_id INTEGER,
  name VARCHAR(120) NOT NULL,
  role VARCHAR(10) NOT NULL CHECK (role IN ('WK', 'BAT', 'AR', 'BOWL')),
  team_code VARCHAR(10) NOT NULL,
  team_name VARCHAR(80) NOT NULL,
  player_form INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'injured', 'unavailable')),
  fantasy_points NUMERIC(10, 2) NOT NULL DEFAULT 0,
  is_overseas BOOLEAN NOT NULL DEFAULT FALSE,
  salary NUMERIC(6, 2) NOT NULL DEFAULT 8.0,
  source VARCHAR(50) NOT NULL DEFAULT 'iplt20.com',
  source_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (external_player_id),
  UNIQUE (team_code, name)
);
ALTER TABLE ipl_players ADD COLUMN IF NOT EXISTS player_form INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ipl_players ADD COLUMN IF NOT EXISTS is_overseas BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE ipl_players ADD COLUMN IF NOT EXISTS salary NUMERIC(6,2) NOT NULL DEFAULT 8.0;

CREATE TABLE IF NOT EXISTS auth_users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin'));

CREATE TABLE IF NOT EXISTS auth_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leagues_creator_id ON leagues (creator_id);
CREATE INDEX IF NOT EXISTS idx_leagues_invite_code ON leagues (invite_code);
CREATE INDEX IF NOT EXISTS idx_leagues_state_created ON leagues (state, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_league_members_user_id ON league_members (user_id);
CREATE INDEX IF NOT EXISTS idx_league_members_joined ON league_members (joined_at DESC);
CREATE INDEX IF NOT EXISTS idx_league_teams_league_id ON league_teams (league_id);
CREATE INDEX IF NOT EXISTS idx_league_teams_league_day ON league_teams (league_id, game_day);
CREATE INDEX IF NOT EXISTS idx_leaderboards_league_rank ON leaderboards (league_id, rank);
CREATE INDEX IF NOT EXISTS idx_h2h_league_day ON league_h2h_fixtures (league_id, game_day);
CREATE INDEX IF NOT EXISTS idx_h2h_results_league_day ON league_h2h_results (league_id, game_day);
CREATE INDEX IF NOT EXISTS idx_ipl_players_team_code ON ipl_players (team_code);
CREATE INDEX IF NOT EXISTS idx_ipl_players_role ON ipl_players (role);
CREATE INDEX IF NOT EXISTS idx_ipl_players_status ON ipl_players (status);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions (expires_at);
