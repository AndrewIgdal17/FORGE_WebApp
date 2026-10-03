-- Narrow, read-only bridge from `forge_api` into `auth.users` for the paper
-- scenario seed script (Task 7).
--
-- `forge_api` has no grant on the `auth` schema and the standard migration
-- role (`postgres`) is not the owner of `auth.users` and lacks GRANT OPTION
-- on it, so `grant select on auth.users to forge_api` is a silent no-op
-- here (confirmed locally: Postgres 16+ warns "no privileges were granted"
-- and skips it rather than erroring). `postgres` does, however, already
-- hold a direct SELECT grant on `auth.users` from Supabase's own bootstrap,
-- so a `security definer` function owned by `postgres` can read it and
-- expose only an email -> id lookup, without widening `auth.users` access
-- any further. This mirrors `handle_new_user()` below it, which already
-- uses the same `security definer` pattern to write into `public.profiles`
-- in response to `auth.users` inserts.

create or replace function public.lookup_user_id_by_email(target_email text)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from auth.users where email = target_email;
$$;

comment on function public.lookup_user_id_by_email(text) is
  'Email -> id lookup for seed/admin scripts. Returns null if no match. '
  'Security definer so forge_api (no auth schema grant) can resolve a '
  'known seed user without being granted broader auth.users access.';

revoke all on function public.lookup_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.lookup_user_id_by_email(text) to forge_api;
