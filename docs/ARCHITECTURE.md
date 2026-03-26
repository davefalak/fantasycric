# Technical Architecture
## Fantasy Cricket P2P Private League Platform

## 1. System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Web/Mobile)                     │
│  (Next.js: League Creation, Team Builder, Leaderboard Views)    │
└────────────────┬────────────────────────────────────────────────┘
                 │
    ┌────────────┴──────────────┐
    │                           │
    ▼                           ▼
┌─────────────┐         ┌────────────────────┐
│  Auth API   │         │  League API        │
│  (Sessions) │         │  (Team, Scoring)   │
└─────────────┘         └────────────────────┘
    │                           │
    └────────────┬──────────────┘
                 │
    ┌────────────▼──────────────┐
    │   PostgreSQL Database      │
    │ (Users, Leagues, Scoring)  │
    └────────────────────────────┘
    
┌─────────────────────────────────────────────────────────────────┐
│              Background Services & Workers                      │
│  - Data Ingestion (IPL scores & matches)                        │
│  - Daily Scoring Calculator                                     │
│  - Leaderboard Aggregator                                       │
│  - Notification Service                                         │
│  (Async jobs via Bull/RabbitMQ + Redis)                         │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│              External Integrations                               │
│  - Cricket Data Provider (scores, squads)                        │
│  - Notification Providers (SMS, Email, Push)                    │
└──────────────────────────────────────────────────────────────────┘
```

## 2. Core Services & Responsibilities

### 2.1 Auth Service (HTTP/REST)
- **Endpoints**: POST /auth/register, /auth/login, /auth/refresh, /auth/logout
- **Responsibilities**:
  - User registration and OTP verification
  - Session and JWT token management
  - KYC status tracking
- **Database**: Users table

### 2.2 League Service (HTTP/REST)
- **Endpoints**: 
  - POST /leagues (create league)
  - GET /leagues/:id (view league details)
  - POST /leagues/:id/teams (add user team to league)
  - GET /leagues/:id/leaderboard (standings)
  - GET /leagues/:id/matchups (head-to-head records)
- **Responsibilities**:
  - League CRUD and member management
  - Team validation and budget enforcement
  - Leaderboard calculation and caching
- **Database**: Leagues, LeagueMember, LeagueTeam tables

### 2.3 Scoring Service (Async Worker + HTTP)
- **Responsibilities**:
  - Listen to daily match completion events
  - Calculate per-player scores (runs, wickets, etc.)
  - Aggregate user team scores per match
  - Determine P2P outcomes (who beat whom)
  - Update leaderboard standings
- **Processing**: Fetch player data → Calculate points → Update DB → Trigger notifications
- **Database**: PlayerScores, UserMatchScores, Leaderboard tables

### 2.4 Data Ingestion Service (Scheduled/Webhook)
- **Responsibilities**:
  - Poll or receive webhooks for IPL matches, squads, scores
  - Store match and player data
  - Trigger alerts when playing XI announced
- **Frequency**:
  - Pre-match: Every 10 minutes
  - Live: Every 2-5 seconds (or push/webhook)
- **Database**: Matches, IPLPlayers, SquadList tables

### 2.5 Notification Service (Async Queue)
- **Responsibilities**:
  - Send league invites, joins, fills alerts
  - Daily match reminders and join deadlines
  - Leaderboard updates and final results
- **Channels**: Push notifications, SMS, Email
- **Integration**: Push provider, SMS API, Email service

## 3. Data Model

### Core Tables

```sql
-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR UNIQUE NOT NULL,
  mobile VARCHAR UNIQUE NOT NULL,
  name VARCHAR,
  state VARCHAR,
  dob DATE,
  kyc_status ENUM('pending', 'verified', 'blocked'),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Leagues
CREATE TABLE leagues (
  id UUID PRIMARY KEY,
  creator_id UUID REFERENCES users(id),
  name VARCHAR NOT NULL,
  description TEXT,
  member_limit INT,
  total_budget INT (e.g., 100),
  state ENUM('draft', 'active', 'concluded'),
  join_deadline TIMESTAMP,
  invite_code VARCHAR UNIQUE,
  created_at TIMESTAMP DEFAULT NOW(),
  starts_at TIMESTAMP,
  ends_at TIMESTAMP
);

-- League Membership
CREATE TABLE league_members (
  id UUID PRIMARY KEY,
  league_id UUID REFERENCES leagues(id) NOT NULL,
  user_id UUID REFERENCES users(id) NOT NULL,
  joined_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(league_id, user_id)
);

-- User's Team in a League
CREATE TABLE league_teams (
  id UUID PRIMARY KEY,
  league_id UUID REFERENCES leagues(id) NOT NULL,
  user_id UUID REFERENCES users(id) NOT NULL,
  team_name VARCHAR,
  players JSONB, -- {player_id, cost, role, is_captain, is_vc}
  total_budget_used INT,
  locked_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(league_id, user_id)
);

-- IPL Players & Point Costs
CREATE TABLE ipl_players (
  id UUID PRIMARY KEY,
  name VARCHAR NOT NULL,
  role ENUM('WK', 'BAT', 'AR', 'BOWL'),
  ipl_team VARCHAR,
  cost INT, -- base cost in points
  created_at TIMESTAMP DEFAULT NOW()
);

-- IPL Matches
CREATE TABLE matches (
  id UUID PRIMARY KEY,
  home_team VARCHAR,
  away_team VARCHAR,
  scheduled_at TIMESTAMP,
  status ENUM('upcoming', 'live', 'completed'),
  winner VARCHAR, -- if completed
  created_at TIMESTAMP DEFAULT NOW()
);

-- Per-Match Player Performance
CREATE TABLE player_scores (
  id UUID PRIMARY KEY,
  match_id UUID REFERENCES matches(id),
  player_id UUID REFERENCES ipl_players(id),
  runs INT DEFAULT 0,
  wickets INT DEFAULT 0,
  catches INT DEFAULT 0,
  run_outs INT DEFAULT 0,
  total_points DECIMAL(10, 2),
  created_at TIMESTAMP DEFAULT NOW()
);

-- User's Team Score for a Match
CREATE TABLE user_match_scores (
  id UUID PRIMARY KEY,
  league_id UUID REFERENCES leagues(id),
  league_team_id UUID REFERENCES league_teams(id),
  match_id UUID REFERENCES matches(id),
  total_score DECIMAL(10, 2),
  created_at TIMESTAMP DEFAULT NOW()
);

-- P2P Match Results (who beat whom)
CREATE TABLE match_results (
  id UUID PRIMARY KEY,
  league_id UUID REFERENCES leagues(id),
  match_id UUID REFERENCES matches(id),
  user_a_id UUID REFERENCES users(id),
  user_b_id UUID REFERENCES users(id),
  user_a_score DECIMAL(10, 2),
  user_b_score DECIMAL(10, 2),
  result ENUM('win_a', 'win_b', 'tie'),
  created_at TIMESTAMP DEFAULT NOW()
);

-- League Standings
CREATE TABLE leaderboard (
  id UUID PRIMARY KEY,
  league_id UUID REFERENCES leagues(id),
  user_id UUID REFERENCES users(id),
  wins INT DEFAULT 0,
  losses INT DEFAULT 0,
  ties INT DEFAULT 0,
  total_points DECIMAL(10, 2) DEFAULT 0,
  rank INT,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(league_id, user_id)
);
```

## 4. Key Workflows

### 4.1 League Creation Workflow
1. User submits league creation form (name, budget, member limit, scoring rules).
2. League service validates and creates league record.
3. Generate unique invite code.
4. Creator becomes first member.
5. Emit event: "LeagueCreated" → Trigger UI update.

### 4.2 Team Building Workflow
1. User selects 11 players for their team in a league.
2. Team builder validates:
   - Total points used ≤ league budget (e.g., 100).
   - Role distribution (e.g., 1 WK, 4 BAT, 3 AR, 3 BOWL).
   - Max 5 players from one IPL team.
   - Set captain (2x multiplier) and VC (1.5x).
3. Persist team selection.
4. Lock team 30 minutes before first match or league deadline.
5. Emit: "TeamLocked" → Leaderboard can now be calculated.

### 4.3 Daily Scoring Workflow
1. **Trigger**: Match is marked "completed" by data ingestion service.
2. **Fetch**: All player performance data (runs, wickets, etc.) from provider.
3. **Calculate**:
   - For each player: base score + multipliers (captain = 2x, VC = 1.5x).
   - Sum all 11 players' adjusted scores = User's match score.
4. **Determine P2P**:
   - For each pair of users in league: compare match scores → win/loss/tie.
5. **Update Leaderboard**:
   - Update wins/losses/ties and total points for each user.
   - Re-rank all users (order by total points DESC, ties ASC).
6. **Emit**: "MatchScored" → Send notifications to league members.

### 4.4 Leaderboard View Workflow
1. User requests league leaderboard (GET /leagues/:id/leaderboard).
2. Service retrieves rankings from leaderboard table (cached).
3. Include head-to-head stats vs other users if requested.
4. Return sorted standings + user's position + upcoming matches.

## 5. API Endpoints (MVP)

### Auth
- `POST /auth/register` — Register user with OTP
- `POST /auth/login` — Login and get JWT
- `POST /auth/refresh` — Refresh JWT token
- `GET /auth/me` — Current user profile

### Leagues
- `POST /leagues` — Create new league
- `GET /leagues/:id` — League details, members, settings
- `GET /leagues/user/all` — All leagues for logged-in user
- `POST /leagues/:id/join` — Join via invite code
- `GET /leagues/:id/leaderboard` — Current standings
- `GET /leagues/:id/vs/:userId` — Head-to-head with another user

### Teams
- `POST /leagues/:id/teams` — Create/edit team for league
- `GET /leagues/:id/teams/:userId` — View user's team
- `GET /leagues/:id/available-players` — IPL players with costs

### Scoring & Results
- `GET /leagues/:id/matches` — Matches in league schedule
- `GET /leagues/:id/match/:matchId/scores` — Per-match scores
- `GET /leagues/:id/match/:matchId/results` — P2P results for that match

### Admin
- `GET /admin/leagues` — All leagues (admin view)
- `POST /admin/leagues/:id/override-score` — Manual score override (audited)
- `GET /admin/health` — System health

## 6. Deployment & Scaling

### Development
- Local Dockerized PostgreSQL + Redis
- Node.js dev servers for API and web

### Staging
- Docker containers on cloud (AWS/GCP/Azure)
- Managed PostgreSQL (RDS/Cloud SQL)
- Managed Redis (ElastiCache/Memorystore)
- Bull/RabbitMQ for async jobs

### Production
- Containerized API service (auto-scaling)
- Separate scoring and notification workers (auto-scaling)
- Read replicas for leaderboard queries
- CDN for static assets (web frontend)
- Rate limiting and DDoS protection

## 7. Performance & Caching Strategy

- **Leaderboard caching**: Update at end of each match, cache for rest of day
- **Player costs**: Cache in memory, refresh daily
- **League settings**: Cache per-user (20 min TTL)
- **Database indexes**: 
  - leagues(state, created_at)
  - league_members(league_id, user_id)
  - match_results(league_id, match_id)
  - leaderboard(league_id, rank)

## 8. Error Handling & Retry Logic

- **Scoring failures**: Retry async job 3x with exponential backoff
- **Data provider failures**: Fallback to cached data + alert admin
- **Notification failures**: Queue retry, max 5 attempts
- **Budget violations**: Reject team update immediately with clear error

## 9. Security

- **Authentication**: JWT issued on login, short-lived (~1 hour) + refresh tokens
- **Authorization**: User can only modify their own teams; admins verified by role
- **Rate limiting**: 100 req/min per user, 1000 req/min per IP
- **Data validation**: Input sanitization on all endpoints
- **Audit logging**: All scoring overrides and admin actions logged

---

**Next Steps:**
1. Implement database schema
2. Build API services (auth, leagues, team builder)
3. Integrate cricket data provider
4. Implement async scoring job
5. Build web UI for league creation and team builder
6. Load test before IPL 2026 launch
