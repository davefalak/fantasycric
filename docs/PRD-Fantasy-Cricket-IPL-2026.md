# Product Requirements Document (PRD)
## Fantasy Cricket Platform for IPL 2026

## 1. Document Control
- Version: 0.1 (Draft)
- Date: 2026-03-20
- Status: For stakeholder review

## 2. Product Vision
Build a P2P fantasy cricket platform for IPL 2026 where users create and customize private leagues, build teams with limited player budgets, and compete against each other throughout the season. Each league operates independently with its own ruleset, scoring, and leaderboards.

## 3. Core Concept
- **Private Leagues**: Users create leagues with custom names, settings, and invite other players.
- **Team Building**: Each user builds one team per league from IPL players with assigned point costs (budget cap).
- **P2P Scoring**: Points accrue daily based on player performance; users compete directly against league members.
- **Season-Long**: Competition runs through the entire IPL 2026 season with ongoing accumulation of wins/losses/ties.
- **Customizable**: League creators set league name, number of players, budget caps, scoring rules, and other settings.

## 4. MVP Scope
- User registration and league member management
- Private league creation with custom settings (name, member limit, budget, etc.)
- Team builder with player point costs and budget constraints
- Live match data ingestion and daily point calculations
- League-specific leaderboard with win/loss/tie tracking
- P2P matchup results (who beat whom each day/match)
- Season standings and final rankings
- Basic admin controls for league settings and user management

## 5. Core Entities & User Journeys

### 5.1 New User Journey
1. Register via mobile OTP or email.
2. Browse or create a private league.
3. Wait for league to fill or join an existing league via invite code.
4. Build a team within the league budget.
5. Compete throughout IPL 2026 against other league members.
6. Track wins/losses on league leaderboard.

### 5.2 League Creator Journey
1. Create a league with custom name and settings (budget, member limit, scoring rules).
2. Invite users via code or direct links.
3. Lock the league once full or after deadline.
4. Monitor league leaderboard in real time.
5. Manage league settings and handle disputes if needed.

### 5.3 Repeat Competitor Journey
1. Log in and view all their leagues.
2. Check current standings and upcoming matches.
3. Modify their team (if allowed mid-season).
4. View detailed match results and point breakdowns.
5. Compare against other league members' performances.

## 6. Core Modules
- **Auth & Profiles**: User registration, KYC-lite, league memberships
- **League Management**: Create, customize, invite, lock, view settings
- **Team Builder**: Player selection with point costs and budget cap
- **Match & Player Data**: Live ingestion of IPL fixtures, squads, scores
- **Daily Scoring**: Calculate points per player weekly/per-match
- **Leaderboard & Stats**: League standings, win/loss/tie tracking, head-to-head
- **Notifications**: League invites, league fills, match updates, scoring alerts
- **Admin Dashboard**: League templates, user support, data integrity

## 7. Functional Requirements

### 7.1 Authentication & Account
- Support mobile OTP and email login.
- User profiles: name, mobile, email, state, DOB, KYC status.
- Account states: active, restricted, blocked.

### 7.2 League Creation & Management
- League creator sets:
  - League name and description.
  - Player limit (e.g., 4-20 users).
  - Total budget per team (e.g., 100 points).
  - Scoring preferences (which scoring rules apply).
  - Join deadline (cutoff for team creation).
  - Invite code for sharing.
- League states: draft (accepting members), active (mid-season), concluded (season over).
- Members can view all league settings and join code.

### 7.3 Team Builder
- Each user builds one team per league.
- Constraints:
  - Players have point costs (e.g., star players 10-15 points, fringe 1-3 points).
  - Total budget cap enforced (e.g., 100 points).
  - Role distribution: WK, BAT, AR, BOWL (min/max per role).
  - Max players from one IPL team (e.g., 5).
- Captain multiplier: 2x points.
- Vice-captain: 1.5x points.
- Save/lock team before join deadline.

### 7.4 Match & Player Data Ingestion
- Fetch IPL fixtures, squads, toss, playing XI, live scores from provider.
- Update intervals: pre-match every 10 min, live every 2-5 sec (or webhook).
- Store ball-by-ball events for replay and verification.

### 7.5 Daily Scoring & P2P Matchups
- Rule-based scoring per player per match:
  - Batting: runs, boundaries, 30/50/100 milestones.
  - Bowling: wickets, maiden overs, 3/4/5 wicket milestones.
  - Fielding: catches, run-outs, stumpings.
  - Apply captain/VC multipliers.
- Calculate league P2P outcomes:
  - User A's team score vs User B's team score = win/loss/tie for that day/match.
  - Accumulate win/loss/tie record over season.
- Audit trail for scoring disputes.

### 7.6 League Leaderboard
- Real-time standings showing:
  - Player rank, wins, losses, ties, total points.
  - Head-to-head records between any two players.
  - Last match results and upcoming matchups.
- Finalized snapshot at season end.

### 7.7 Notifications
- League invite and join alerts.
- "League is full" alert.
- Match start and join deadline reminders.
- Daily scoring updates and leaderboard changes.
- Season wrap-up and final rankings.
- Channels: push, SMS, email (configurable).

### 7.8 Admin & Operations
- Manage league templates and default settings.
- View league health: member activity, scoring status, disputes.
- Manual override for scoring or account actions (audited).
- User support actions: unlock teams, freeze accounts, etc.

## 8. Non-Functional Requirements
- p95 API latency <= 300ms for core endpoints
- Uptime target >= 99.9% during IPL season
- Role-based admin access with audit logs
- Idempotent scoring and settlement workflows

## 9. Suggested Stack
- Web: Next.js + TypeScript
- API: NestJS + TypeScript
- Data: PostgreSQL + Redis
- Async jobs: queue-based workers

## 10. Milestones
1. Foundation and architecture setup
2. Core gameplay MVP build
3. Live scoring and settlement
4. Hardening and launch readiness

## 11. Data Model (Key Entities)
- **User**: Auth, profile, league memberships
- **League**: Name, settings, members, state, invite code
- **LeagueTeam**: User's team in a league, player selections, budget used
- **IPLPlayer**: Player name, role, current point cost (dynamic)
- **Match**: IPL fixture, squads, schedule, status
- **PlayerScore**: Per-player scoring for each match (runs, wickets, etc.)
- **UserMatchScore**: Aggregated user team score per match in league
- **LeaderboardEntry**: League standings, W/L/T record, total score
- **MatchResult**: P2P outcome (User A beat User B score-wise)

## 12. Open Questions
- Final scoring matrix approval
- Data provider selection
- Payment/KYC provider choices
- Region-wise compliance constraints
