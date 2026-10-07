.PHONY: setup dev check db-reset lint lint-frontend build-frontend test-unit test-integration test-db

setup:
	uv sync
	supabase start || true

dev:
	@supabase status -o env 2>/dev/null \
		| sed -E 's/^API_URL=/SUPABASE_URL=/;s/^ANON_KEY=/SUPABASE_ANON_KEY=/;s/^DB_URL=/FORGE_DATABASE_URL=/' \
		| grep -E '^(SUPABASE_URL|SUPABASE_ANON_KEY|FORGE_DATABASE_URL)=' > .env.local 2>/dev/null || true
	@echo "FORGE_AUTH_DISABLED=true" >> .env.local
	uv run uvicorn app.main:app --host $${HOST:-127.0.0.1} --port $${PORT:-8000} --reload --env-file .env.local

check: lint test-unit

lint:
	uv lock --check
	uv run ruff check app/ tests/

lint-frontend:
	cd frontend && npx tsc --noEmit

build-frontend:
	cd frontend && npm run build

test-unit:
	uv run pytest tests/unit/ -v

test-integration:
	uv run pytest tests/integration/ -v

test-db:
	supabase test db

db-reset:
	supabase db reset
