.PHONY: setup dev check db-reset lint lint-js test-unit test-browser test-integration test-db

setup:
	uv sync
	npm ci
	supabase start || true

dev:
	@supabase status -o env 2>/dev/null \
		| sed -E 's/^API_URL=/SUPABASE_URL=/;s/^ANON_KEY=/SUPABASE_ANON_KEY=/;s/^DB_URL=/FORGE_DATABASE_URL=/' \
		| grep -E '^(SUPABASE_URL|SUPABASE_ANON_KEY|FORGE_DATABASE_URL)=' > .env.local 2>/dev/null || true
	@echo "FORGE_AUTH_DISABLED=true" >> .env.local
	uv run uvicorn app.main:app --host $${HOST:-127.0.0.1} --port $${PORT:-8000} --reload --env-file .env.local

check: lint test-unit test-browser

lint:
	uv lock --check
	npm ls --all >/dev/null
	uv run ruff check app/ tests/

lint-js:
	npm run lint

test-unit:
	uv run pytest tests/unit/ -v

test-browser:
	npm test

test-integration:
	uv run pytest tests/integration/ -v

test-db:
	supabase test db

db-reset:
	supabase db reset
