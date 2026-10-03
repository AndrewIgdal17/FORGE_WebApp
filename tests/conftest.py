"""Test session defaults.

Runs at collection time (before `app.main` is imported by any test module),
so by default the test suite runs with auth explicitly disabled rather than
depending on a live Supabase/Postgres stack. Individual tests that need a
real Supabase URL or database (e.g. the fail-closed startup check, or the
`forge_api` RLS smoke test) set/unset env vars themselves via `monkeypatch`.
"""

import os

os.environ.setdefault("FORGE_AUTH_DISABLED", "true")
os.environ.pop("SUPABASE_URL", None)
os.environ.pop("FORGE_DATABASE_URL", None)
