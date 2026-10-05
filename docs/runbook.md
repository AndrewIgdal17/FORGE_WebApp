# FORGE operator runbook

Two repositories:

| Repo | What it is |
|---|---|
| [AndrewIgdal17/FORGE](https://github.com/AndrewIgdal17/FORGE) | Calculator package `forge-calc`, tag `v2.0.0`. Published from Git. No web app. |
| [AndrewIgdal17/FORGE_WebApp](https://github.com/AndrewIgdal17/FORGE_WebApp) | FastAPI app. Installs `forge-calc` from the git tag in `pyproject.toml`. |

Staging is branch `main` (Render service `forge-staging`, Supabase project `forge-staging`). Production is branch `release` (Render service `forge-production`, the existing Supabase project). `release` moves only by fast-forward to a commit that has already run on staging.

## Prerequisites

- Read access to both GitHub repositories. Write access to `FORGE_WebApp` to release. The calculator repo is public so the image can fetch the git dependency.
- A Render account that can apply `render.yaml`.
- A Supabase account. Staging may be a free project (it can pause). Production, when launched, is Supabase Pro so the project does not pause, on a Render instance that stays up.
- [uv](https://docs.astral.sh/uv/), Python 3.12 (`.python-version`), Node 22 (`.nvmrc`), Docker, and the Supabase CLI. CI pins the CLI at 2.90.0.

## Local development

From `FORGE_WebApp`:

```bash
make setup    # uv sync, npm ci, supabase start
make dev      # write .env.local, then uvicorn with reload
make check    # lockfile, Ruff, unit tests, browser tests
make db-reset # rebuild the local database from supabase/migrations
```

`make dev` writes `.env.local` from `supabase status` and appends `FORGE_AUTH_DISABLED=true`. The app listens at `http://127.0.0.1:8000` (`HOST` and `PORT` override the bind). `run_server.command` is the same `make dev` entry for a double-click on macOS.

`make check` does not start Supabase, run pgTAP, run `tests/integration`, or build the image. Those are CI jobs `database` and `container`. Locally, after `make setup`:

```bash
make test-db
make test-integration
```

Calculator checks, from a clone of `AndrewIgdal17/FORGE`: `uv sync`, then `uv run pytest`.

## Environment variables

`.env.example` lists the local set. `make dev` fills `.env.local`. Render sets the hosted set. Never commit `.env.local`.

| Variable | Where it is set | What it does |
|---|---|---|
| `SUPABASE_URL` | `.env.local`; Render env (plain value in `render.yaml`) | Supabase API URL. Required at startup unless auth is disabled. The browser receives it from `GET /client-config.js`. |
| `SUPABASE_ANON_KEY` | `.env.local`; Render env (plain value) | Supabase anon key for the browser. Not a secret. |
| `FORGE_DATABASE_URL` | `.env.local`; Render secret (`sync: false`) | Postgres URI for the `forge_api` role. When set, the startup self-test runs `SELECT 1`. |
| `FORGE_AUTH_DISABLED` | `.env.local` only (`make dev` sets `true`) | Local dev. Allows startup without `SUPABASE_URL` and `FORGE_DATABASE_URL`, and serves requests without a token. |
| `PORT` | Shell or Render (Render sets this) | Listen port. Local default `8000`. The container uses `${PORT:-8000}`. |
| `HOST` | Shell, for `make dev` | Local bind address. Default `127.0.0.1`. The container binds `0.0.0.0`. |
| `RENDER` | Set by Render to `true` | Platform flag. `RENDER=true` together with `FORGE_AUTH_DISABLED=true` crashes the process at startup. |
| `RENDER_GIT_COMMIT` | Set by Render | Deployed commit. `GET /api/health` returns it as `app_commit`. Locally the field is `null`. |
| `FORGE_ENV` | `render.yaml`: `staging` or `production` | Labels the service. The application does not read it. |
| `FORGE_CALC_WORKERS` | Optional, default `4` | Size of the calculation thread pool. |

`FORGE_DATABASE_URL` uses the `forge_api` user. Take the host and port from the Supabase dashboard direct connection (port 5432) and substitute the user. Percent-encode reserved characters in the password. The migration creates `forge_api` with the local placeholder password `forge_api_local_dev_password`. On a hosted project, set a real password after the first migration:

```sql
ALTER ROLE forge_api WITH PASSWORD '<password>';
```

Keep that password out of git. Put it only in the Render secret.

## Secrets

| Secret | Where it lives | Used by | How to rotate |
|---|---|---|---|
| `FORGE_DATABASE_URL` | Render dashboard, per service. `sync: false`, so a later Blueprint sync does not overwrite it. | The web process | `ALTER ROLE` (above), edit the env var in the dashboard, redeploy. |
| `SUPABASE_ACCESS_TOKEN` | GitHub repository secret on `FORGE_WebApp` | `migrate-staging`, `migrate-production` (`supabase link`) | Create a new token in the Supabase account, update the repository secret, revoke the old token. |
| `SUPABASE_PROJECT_REF` | GitHub environments `staging` and `production` (one value each) | Migration jobs | Update the environment secret if the project is recreated. |
| `SUPABASE_DB_PASSWORD` | GitHub environments `staging` and `production` | `supabase link --password` in the migration jobs | Reset the database password in the Supabase dashboard, then update that environment's secret. |
| `SMOKE_USER_EMAIL`, `SMOKE_USER_PASSWORD` | GitHub environment `staging` | Smoke workflow (staging only) | Change the Auth user's password, then update the environment secrets. |
| `APP_URL` | GitHub environments `staging` and `production` | Smoke workflow base URL | Set it to the service's `https://…onrender.com` origin. A workflow run can pass `base_url` instead. |

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are plain Render env vars, not secrets. Replace the `<staging-…>` and `<production-…>` placeholders in `render.yaml` after the projects exist, or fill the same keys in the dashboard.

Render asks for each `sync: false` value only when the Blueprint is first created.

## GitHub environments

Create both under the `FORGE_WebApp` repo: Settings → Environments.

| Environment | Protection | Secrets |
|---|---|---|
| `staging` | None | `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `SMOKE_USER_EMAIL`, `SMOKE_USER_PASSWORD`, `APP_URL` |
| `production` | Required reviewer: Andy | `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `APP_URL` |

`migrate-production` and a production smoke run both use the `production` environment, so they wait until Andy approves. `staging` jobs start as soon as their `needs` jobs pass.

## Releasing

`render.yaml` currently sets `autoDeploy: false`, and the `blueprint` CI job fails if that value changes. Render does not deploy when checks pass. After the steps below, deploy the commit from the service's dashboard (Manual Deploy). Switch a service to deploy-on-checks only by setting `autoDeploy: checksPass` in `render.yaml` and updating that assertion in `.github/workflows/ci.yml` in the same change.

1. Merge the change to `main`.
2. CI passes on that commit. Jobs: `lint`, `unit`, `browser`, `database`, `container`, `blueprint`. Then `migrate-staging` applies pending migrations with `supabase db push`. Deploy `forge-staging` at that commit (automatic only after `autoDeploy` is `checksPass`).
3. Run the **Smoke** workflow (`workflow_dispatch`) with `environment=staging`, `expected_commit` set to that commit's SHA (`app_commit` / `RENDER_GIT_COMMIT`), and `base_url` or `APP_URL`. It waits up to 15 minutes for `GET /api/health` to return 200 with that commit, then signs in as the smoke user, creates a scenario, checks `inputs_id` against `POST /api/forge/calculate`, and deletes the scenario. The workflow sets no commit status and does not hold a deploy.
4. Fast-forward `release` to that commit:

   ```bash
   git fetch origin
   git checkout release
   git merge --ff-only origin/main
   git push origin release
   ```

   If `release` does not exist yet: `git push origin main:release`.
5. CI passes again on `release`. Approve the `migrate-production` job when GitHub asks. That job pushes migrations to the production project. Deploy `forge-production` after the health check passes (dashboard, until `autoDeploy` is `checksPass`). A pending approval holds the production migration.
6. Run **Smoke** with `environment=production` and `expected_commit` set to the same SHA. Production smoke checks health and `app_commit` only. It does not create a scenario.

A calculator release is an extra step before step 1. See below.

## Calculator release

Dependabot does not bump the `forge-calc` git tag. Release the calculator, then point the web app at the new tag.

1. In `AndrewIgdal17/FORGE`, set `version` in `pyproject.toml` to `X.Y.Z`.
2. Run `uv lock` and commit.
3. Tag `vX.Y.Z` and push the commit and the tag. The calculator CI `tag-check` job fails unless the tag is `v` plus the package version.
4. In `FORGE_WebApp`, set the dependency in `pyproject.toml` to `forge-calc @ git+https://github.com/AndrewIgdal17/FORGE.git@vX.Y.Z`.
5. Run `uv lock` and commit.
6. Release the web app with the six steps above.

The web app currently depends on `@v2.0.0`.

## Rollback

1. In the Render dashboard, open the service → Deploys → the previous successful deploy → redeploy it.
2. Leave the database where it is. Migrations are written to work with the release before them, so the previous code runs against the migrated database.

Rebuilding a database from the repo is destructive and is not how you undo a bad app deploy. See Production Supabase.

## Staging Supabase setup

1. Create a Supabase project named `forge-staging` in Oregon (the same region as `forge-staging` in `render.yaml`).
2. Copy the project URL, anon key, project ref, and database password.
3. Store the secrets in the table above. Put `SUPABASE_URL` and `SUPABASE_ANON_KEY` on the Render service. Create an Auth user for smoke and store `SMOKE_USER_EMAIL` and `SMOKE_USER_PASSWORD` on the `staging` environment.
4. Link and push the repo migrations once:

   ```bash
   supabase link --project-ref <staging-ref> --password <db-password> --yes
   supabase db push --yes
   ```

5. Set the `forge_api` password (SQL above) and save `FORGE_DATABASE_URL` on the Render service.

After this, new migrations reach staging only through `migrate-staging` on a push to `main`.

## Production Supabase

The production database is the existing Supabase project. The Blueprint defines `forge-production` (branch `release`, plan `starter`, region Oregon). Launching that paid service is a separate decision; this repo does not create it.

Reset that project onto the repo migrations once. This deletes data in the linked project:

```bash
supabase link --project-ref <production-ref> --password <db-password> --yes
supabase db reset --linked --yes
```

Then set the `forge_api` password and `FORGE_DATABASE_URL` the same way as staging. Further migrations run only in `migrate-production`, after Andy approves the `production` environment.

`supabase db reset` without `--linked` (`make db-reset`) resets the local stack only.

## Troubleshooting

### `GET /api/health` returns 503

The route needs no token. It returns:

```json
{"status": "ok", "app_commit": "<RENDER_GIT_COMMIT or null>", "calculator": {"package": "forge-calc", "version": "…", "commit": "…", "defaults_id": "sha256:…"}}
```

`status` is `starting` and the HTTP status is 503 until the startup self-test passes. Render will not send traffic to that instance; the previous deploy keeps serving.

The self-test runs in the FastAPI lifespan, not at import. It loads `AEP_LRGV_Laredo_NewBuild`, runs the calculator, and requires provenance plus at least one finite benefit-cost ratio. When `FORGE_DATABASE_URL` is set, it also runs `SELECT 1`. A wrong URL, password, or unreachable database leaves health at 503. The log line is `Self-test: FAILED`. With `FORGE_AUTH_DISABLED=true` and no database URL, the database check is skipped; a 503 then means the Laredo run failed.

A 503 for the first few seconds of startup is expected.

### Process crashes on Render at startup

`RENDER=true` and `FORGE_AUTH_DISABLED=true` raise `RuntimeError` before the server listens. Remove `FORGE_AUTH_DISABLED` from the Render service. Set `SUPABASE_URL` and `FORGE_DATABASE_URL` instead.

### Migration job fails

`migrate-staging` (push to `main`) and `migrate-production` (push to `release`) run only after `lint`, `unit`, `browser`, `database`, `container`, and `blueprint` succeed. A migration that fails on a fresh local database fails `database`, and the migrate jobs do not start.

On the migrate job itself, check `SUPABASE_ACCESS_TOKEN` (repository secret), and `SUPABASE_PROJECT_REF` plus `SUPABASE_DB_PASSWORD` (the job's environment). The commands are `supabase link` and `supabase db push`. Production stays queued until the required reviewer approves.

### Image build fails

The image runs `uv sync --frozen`. A `pyproject.toml` change without a new `uv.lock` fails `lint` (`uv lock --check`) and the Docker build. `forge-calc` is fetched from GitHub at the pinned tag; the image installs `git` for that fetch. A tag that does not exist fails the build.
