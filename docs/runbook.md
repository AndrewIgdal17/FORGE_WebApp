# FORGE operator runbook

Two repositories:

| Repo | What it is |
|---|---|
| [AndrewIgdal17/FORGE](https://github.com/AndrewIgdal17/FORGE) | Calculator package `forge-calc`, tag `v2.0.0`. Published from Git. No web app. |
| [AndrewIgdal17/FORGE_WebApp](https://github.com/AndrewIgdal17/FORGE_WebApp) | FastAPI app. Installs `forge-calc` from the git tag in `pyproject.toml`. |

## Hosting topology

FORGE is self-hosted on **turgon** (Lenovo Yoga 7, Ubuntu Server 24.04.5 LTS, Intel i7-12700H, 32GB RAM) reachable via Tailscale SSH (`andy17@turgon`). Public access is through Cloudflare Tunnel — no port forwarding, home IP hidden.

| Component | Where it runs | How to reach it |
|---|---|---|
| FORGE web app | Docker container `forge-app` on turgon, port 3000→8000 | `https://forge-calc.com` (public) |
| Supabase stack (Postgres, GoTrue, PostgREST, Kong, Studio) | Docker Compose at `/opt/supabase/docker/` on turgon | `https://api.forge-calc.com` (public API gateway) |
| Cloudflare Tunnel | systemd service `cloudflared` on turgon | Config at `/etc/cloudflared/config.yml` |

Render and hosted Supabase are **retired** (2026-10-10). `render.yaml` is historical.

## Deploy flow

Code flows in one direction: **Mac (edit in Cursor) → GitHub (push) → turgon (pull + rebuild)**.

```bash
# 1. On Mac: commit and push
cd repos/FORGE_WebApp
git add -A && git commit -m "description" && git push origin main

# 2. Deploy to turgon
ssh andy17@turgon '/srv/forge/deploy.sh'
```

The deploy script (`/srv/forge/deploy.sh`) pulls the latest from GitHub, rebuilds the Docker image, swaps the container, and runs a health check. If health fails, it exits 1.

## Prerequisites

- SSH access to turgon via Tailscale (`ssh andy17@turgon`)
- Read/write access to both GitHub repositories
- [uv](https://docs.astral.sh/uv/), Python 3.12 (`.python-version`), Node 22 (`.nvmrc`), Docker on the Mac for local dev

## Local development

From `FORGE_WebApp` on the Mac:

```bash
make setup    # uv sync, supabase start (local Supabase stack)
make dev      # write .env.local, then uvicorn with reload
make check    # lockfile, Ruff, unit tests
make db-reset # rebuild the local database from supabase/migrations
```

`make dev` writes `.env.local` from `supabase status` and appends `FORGE_AUTH_DISABLED=true`. The app listens at `http://127.0.0.1:8000`.

## Environment variables (turgon)

Secrets live on turgon only — never in the vault or git.

| Variable | Location | What it does |
|---|---|---|
| `SUPABASE_URL` | `forge-app` container env | `https://api.forge-calc.com` — public Supabase gateway URL. Used for issuer validation. |
| `FORGE_JWKS_URL` | `forge-app` container env | `http://supabase-envoy:8000/auth/v1/.well-known/jwks.json` — internal JWKS fetch (Cloudflare blocks container loopback to public URL). |
| `FORGE_DATABASE_URL` | `/srv/forge/.env` → container env | `postgresql://forge_api:<password>@supabase-db:5432/postgres` — direct Postgres via Docker network (not through pooler). |
| `PORT` | `forge-app` container env | `8000` (container-internal; host maps 3000→8000). |
| `FORGE_CALC_WORKERS` | `forge-app` container env | `4` — calculator thread pool size. |
| `FORGE_NLCD_PATH` | `forge-app` container env | NLCD land-cover COG. Default `/gis-data/nlcd/nlcd_2021_land_cover_cog.tif`. `deploy.sh` bind-mounts host `/srv/forge/gis-data` at `/gis-data` read-only. |
| `VITE_SUPABASE_URL` | Build arg (baked into React) | `https://api.forge-calc.com` — browser-side Supabase client URL. |
| `VITE_SUPABASE_ANON_KEY` | Build arg (baked into React) | Publishable anon key from `/opt/supabase/docker/.env`. |
| Supabase stack secrets | `/opt/supabase/docker/.env` | `POSTGRES_PASSWORD`, `JWT_SECRET`, `JWT_KEYS`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `DASHBOARD_PASSWORD`. |

## Secrets

| Secret | Where it lives | How to rotate |
|---|---|---|
| `FORGE_DATABASE_URL` | `/srv/forge/.env` on turgon | `ALTER ROLE forge_api WITH PASSWORD '...'` in Postgres, update `/srv/forge/.env`, redeploy with `deploy.sh`. |
| Supabase stack secrets | `/opt/supabase/docker/.env` on turgon | Edit the `.env`, then `cd /opt/supabase/docker && sudo docker compose up -d --force-recreate`. |
| GitHub SSH key | `~/.ssh/id_ed25519_github` on turgon | Generate a new key, add to GitHub settings, remove old key. |

## Calculator release

1. In `AndrewIgdal17/FORGE`, set `version` in `pyproject.toml` to `X.Y.Z`.
2. Run `uv lock` and commit.
3. Tag `vX.Y.Z` and push the commit and the tag.
4. In `FORGE_WebApp`, set the dependency in `pyproject.toml` to `forge-calc @ git+https://github.com/AndrewIgdal17/FORGE.git@vX.Y.Z`.
5. Run `uv lock` and commit.
6. Push and deploy: `ssh andy17@turgon '/srv/forge/deploy.sh'`.

## Rollback

```bash
# On turgon: rebuild from a specific commit
cd /srv/forge/FORGE_WebApp
git checkout <previous-commit>
/srv/forge/deploy.sh
```

Or restart the previous Docker image if it's still cached locally.

## Backups

- **Postgres:** daily `pg_dump` at 3am UTC → `/srv/forge/backups/postgres/`, 7-day retention.
- **Health check:** daily at 3:15am UTC → `/srv/forge/backups/health.log`.
- **Off-box:** vault backup rsync from Mac → `/srv/vault-backup/` on turgon (27GB, excludes `Tools/`).

## Troubleshooting

### `https://forge-calc.com` returns 404

The Cloudflare Tunnel routes `forge-calc.com` → `localhost:3000`. Check:

```bash
ssh andy17@turgon 'docker ps | grep forge-app'          # Is the container running?
ssh andy17@turgon 'curl -s http://localhost:3000/api/health'  # Does it respond locally?
ssh andy17@turgon 'sudo systemctl status cloudflared'    # Is the tunnel running?
```

### Health returns 503 "starting"

The startup self-test hasn't passed yet. Check container logs:

```bash
ssh andy17@turgon 'docker logs forge-app --tail 20'
```

Common cause: Postgres isn't ready yet (the Supabase stack takes ~30s after reboot).

### Auth returns 401/403

- Check the JWKS endpoint: `curl -s https://api.forge-calc.com/auth/v1/.well-known/jwks.json`
- If empty keys: GoTrue ES256 isn't configured. Rerun `add-new-auth-keys.sh`.
- If issuer mismatch: `API_EXTERNAL_URL` in `/opt/supabase/docker/.env` must be `https://api.forge-calc.com/auth/v1`. After editing, `docker compose up -d --force-recreate auth` (not just `restart`).

### Container won't start / port conflict

```bash
ssh andy17@turgon 'docker ps -a | grep forge'    # Check for stopped containers
ssh andy17@turgon 'docker logs forge-app'         # Check error output
ssh andy17@turgon 'ss -tlnp | grep 3000'          # Who's using port 3000?
```
