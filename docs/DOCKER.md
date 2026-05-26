# Simplebeacon Docker — local dashboard & metrics collector

Run the full Simplebeacon dashboard stack locally with Docker Compose. This mirrors the CI perimeter workflow webhook target (`POST /api/simplebeacon/scan`).

## Prerequisites

- Docker Desktop or Docker Engine 24+
- Docker Compose v2

## Quick start

```bash
cd ai-platform
cp docker/env.simplebeacon.example .env   # optional
npm run simplebeacon:docker
```

Open:

- Simplebeacon UI: http://localhost:54355/simplebeacon-dashboard/
- Dashboard API: http://localhost:54355/api/simplebeacon/dashboard
- AI validation alias: http://localhost:54355/api/ai-validation/dashboard

## Profiles

| Command | Services |
|---------|----------|
| `npm run simplebeacon:docker` | Dashboard only |
| `npm run simplebeacon:docker:dev` | Dashboard + live mounts (`.simplebeacon`, `web/data`) |
| `npm run simplebeacon:docker:full` | Dashboard + metrics collector + Postgres + Redis |
| `npm run simplebeacon:docker:down` | Stop full stack |

### Metrics collector

The collector profile triggers `POST /api/simplebeacon/scan` on an interval (default 600s), keeping `.simplebeacon/report.json` and `history.json` fresh for the UI.

```bash
docker compose -f docker-compose.simplebeacon.yml --profile collector up -d
```

Environment:

| Variable | Default | Purpose |
|----------|---------|---------|
| `SIMPLEBEACON_COLLECT_INTERVAL_SEC` | `600` | Seconds between scans |
| `SIMPLEBEACON_DASHBOARD_TOKEN` | — | Optional Bearer token |

## GitHub Actions webhook

Set repository secrets for the [perimeter workflow](../../.github/workflows/simplebeacon-perimeter.yml):

| Secret | Example |
|--------|---------|
| `SIMPLEBEACON_DASHBOARD_URL` | `http://host.docker.internal:54355` (local tunnel) or your deployed URL |
| `SIMPLEBEACON_DASHBOARD_TOKEN` | Optional auth token |

The workflow POSTs to `/api/simplebeacon/scan` after each CI run.

## Phase 2 database

The `full` profile starts Postgres and Redis (same credentials as `docker-compose.phase2.yml`) and sets:

```
ENABLE_DATABASE=true
ENABLE_REDIS=true
```

Validate compose files in CI:

```bash
npm run simplebeacon:docker:config
```

## Files

| Path | Purpose |
|------|---------|
| `docker-compose.simplebeacon.yml` | Base stack |
| `docker-compose.simplebeacon.dev.yml` | Dev bind mounts |
| `docker-compose.simplebeacon.full.yml` | DB/Redis wiring |
| `docker/Dockerfile.dashboard` | Node 20 dashboard image |
| `docker/simplebeacon-collector.sh` | Periodic scan trigger |

## Troubleshooting

**Port 54355 in use** — set `SIMPLEBEACON_PORT=54356` in `.env`.

**Empty dashboard** — run a scan once:

```bash
curl -X POST http://localhost:54355/api/simplebeacon/scan -H "Content-Type: application/json" -d "{}"
```

**Build slow** — `.dockerignore` excludes `node_modules`, tests, and archive docs.

See also: [CI.md](./CI.md), [GITHUB-ACTION-QUICKSTART.md](./GITHUB-ACTION-QUICKSTART.md)
