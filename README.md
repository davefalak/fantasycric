# Fantasy IPL 2026 - P2P Private League Platform

Full-stack TypeScript monorepo for a peer-to-peer fantasy cricket platform where users create customizable private leagues, join by invite code, build teams with budget constraints, and compete throughout IPL 2026.

## Vision

Users organize private leagues, build fantasy teams from IPL players with budget constraints, and compete directly against other league members based on real player performance. Each league is independent with its own settings, scoring rules, and season-long standings.

## What's Included

```text
.
├── apps/
│   ├── api/           # Source-based TypeScript API runtime
│   └── web/           # Next.js-ready frontend scaffold
├── packages/
│   └── shared/        # Shared league and team types
├── docs/
│   ├── PRD-Fantasy-Cricket-IPL-2026.md
│   └── ARCHITECTURE.md
├── infra/
│   └── docker-compose.yml
└── server.js          # Static local web shell
```

## Quick Start

### Prerequisites
- Node.js >= 20
- npm >= 9
- Docker optional, for PostgreSQL and Redis later

### Run Locally

1. Start the API:
```bash
npm run dev:api
```

2. Start the web shell in a second terminal:
```bash
npm run dev:web
```

3. Run the built-in API tests:
```bash
npm run test:api
```

4. Seed the IPL 2026 roster snapshot:
```bash
npm run seed:ipl-roster
```

5. Optional infrastructure for later PostgreSQL migration:
```bash
docker compose -f infra/docker-compose.yml up -d
```

6. Optional environment file:
```bash
cp .env.example .env
```

## Current Runtime

### apps/api
- Node HTTP API running directly from TypeScript source
- League creation, invite-code join, and team submission
- PostgreSQL-backed runtime store via the `pg` driver
- PostgreSQL schema at apps/api/src/leagues/league.schema.sql
- IPL 2026 roster seed script at apps/api/src/scripts/seed-ipl-roster.ts
- Node built-in tests covering league and team validation

### apps/web
- Next.js-oriented scaffold kept for future framework install
- Current working browser UI is the static shell in server.js because npm registry access is unavailable in this environment

### packages/shared
- Shared league and team contracts for future frontend/backend convergence

## API Examples

Health check:
```bash
curl http://localhost:4000/api/health
```

Create a league:
```bash
curl -X POST http://localhost:4000/api/leagues \
  -H "Content-Type: application/json" \
  -H "X-User-Id: owner-1" \
  -d '{"name":"Weekend Warriors","memberLimit":6,"totalBudget":100,"joinDeadline":"2030-03-23T18:00:00.000Z"}'
```

Join a league:
```bash
curl -X POST http://localhost:4000/api/leagues/join \
  -H "Content-Type: application/json" \
  -H "X-User-Id: friend-1" \
  -d '{"inviteCode":"REPLACE_ME"}'
```

Save a team:
```bash
curl -X POST http://localhost:4000/api/teams \
  -H "Content-Type: application/json" \
  -H "X-User-Id: friend-1" \
  -d @team-payload.json
```

## Environment Variables

See .env.example for settings:
- NODE_ENV
- WEB_PORT
- API_PORT
- API_DATA_FILE
- DATABASE_URL
- REDIS_URL
- JWT_SECRET
- CRICKET_DATA_PROVIDER
- NOTIFICATION_PROVIDER_KEY

## Testing

The API package includes a Node built-in test suite and does not require Jest or Vitest:
```bash
npm run test:api
```

## Migration Path

When npm registry access is available again:
1. Install React, Next.js, and NestJS dependencies.
2. Extend the PostgreSQL repository with scoring and ingestion workers.
3. Keep the current controller and service contracts as the migration boundary.
4. Move the static shell interactions into the Next.js app.

## Roster Seed Notes

- The roster snapshot is sourced from the official IPL 2026 squad pages on iplt20.com.
- Player `status` is seeded as `active` when the player appears on an official squad page.
- `fantasy_points` is seeded as `0` so live scoring can accumulate from match ingestion later.

## Documentation

- docs/PRD-Fantasy-Cricket-IPL-2026.md
- docs/ARCHITECTURE.md

## Deploy On Google Cloud (Free-Tier Friendly)

This project can run on Google Cloud with very low/no cost if usage stays within free-tier limits.

Recommended setup:
- API: Cloud Run (free-tier eligible)
- Database: external free Postgres (Neon/Supabase free tier)
- Web shell: Firebase Hosting free tier or Cloud Run

Important:
- Cloud SQL is not permanently free.
- To keep costs at/near zero, use external free Postgres and keep Cloud Run min instances at 0.

### 1. Prerequisites

- Install Google Cloud SDK (`gcloud`)
- Authenticate: `gcloud auth login`
- Create/select a project with billing enabled
- Create a free Postgres database and copy `DATABASE_URL`

### 2. Configure Environment Values

You will need:
- `PROJECT_ID` (your GCP project)
- `DATABASE_URL` (external free Postgres URL)
- `JWT_SECRET` (strong random string)
- `CRICKETDATA_API_KEY` (your cricketdata key)

### 3. Deploy API To Cloud Run

From repo root:

```bash
chmod +x scripts/deploy-gcp-free.sh

PROJECT_ID="your-project-id" \
REGION="us-central1" \
SERVICE_NAME="fantasy-api" \
DATABASE_URL="postgresql://..." \
JWT_SECRET="replace-with-long-random-secret" \
CRICKETDATA_API_KEY="your-key" \
./scripts/deploy-gcp-free.sh
```

The script will:
- Enable required GCP services
- Build container using `Dockerfile.api`
- Deploy to Cloud Run with free-tier-safe defaults (`min-instances=0`, poller off)

### 4. Verify API

After deploy, test:

```bash
curl https://YOUR_CLOUD_RUN_URL/api/health
```

### 5. Deploy Web (Optional)

If you use the static shell (`server.js`), easiest path is Firebase Hosting.

If your web app requires Next.js SSR, deploy `apps/web` separately to Cloud Run.

### 6. Cost-Safety Settings

Keep these to avoid unexpected charges:
- Cloud Run `min-instances=0`
- `LIVE_POLL_AUTO_START=false`
- Use `us-central1` region
- Set Billing budget alerts in GCP (for example, $5 and $10)


## License

MIT
