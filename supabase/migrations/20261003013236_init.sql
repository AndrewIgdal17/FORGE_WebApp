-- Clean schema for server-owned persistence.
-- Replaces every table from the previous project. Nothing is carried forward:
-- `scenario` here is new, and `ref_snapshot`, `bcr_definition`,
-- `bcr_excludable_group`, `bcr_excludable_group_items`,
-- `cost_benefit_taxonomy`, `input_metadata`, and `taxonomy_dimensions`
-- are not recreated. The calculator remains the source for taxonomy and
-- input metadata.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text,
  first_name text,
  last_name text,
  org text,
  org_type text,
  has_done_tutorial boolean not null default false,
  constraint profiles_username_length check (
    username is null or char_length(username) between 3 and 30
  ),
  constraint profiles_username_chars check (
    username is null or username ~ '^[A-Za-z0-9_.-]+$'
  ),
  constraint profiles_first_name_length check (
    first_name is null or char_length(first_name) <= 100
  ),
  constraint profiles_last_name_length check (
    last_name is null or char_length(last_name) <= 100
  ),
  constraint profiles_org_length check (
    org is null or char_length(org) <= 100
  ),
  constraint profiles_org_type_length check (
    org_type is null or char_length(org_type) <= 50
  )
);

comment on table public.profiles is
  'One row per auth.users account. Created by handle_new_user() at signup.';

-- Case-insensitive uniqueness; multiple NULL usernames (not yet onboarded)
-- are allowed since NULLs are never equal in a unique index.
create unique index profiles_username_lower_idx
  on public.profiles (lower(username));

alter table public.profiles enable row level security;

revoke all on public.profiles from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- scenario
-- ---------------------------------------------------------------------------

create table public.scenario (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  source text not null,
  defaults_id text not null,
  changes jsonb not null,
  results jsonb,
  calculator jsonb,
  inputs_id text,
  computed_at timestamptz,
  calc_error text,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scenario_name_length check (char_length(name) between 1 and 200),
  constraint scenario_source_check check (
    source in (
      'manual', 'new', 'wizard', 'tutorial',
      'upload-forge', 'upload-csv', 'paper'
    )
  ),
  constraint scenario_changes_is_object check (jsonb_typeof(changes) = 'object'),
  -- results, calculator, inputs_id, and computed_at are all null or all present.
  constraint scenario_results_all_or_nothing check (
    (results is null and calculator is null and inputs_id is null and computed_at is null)
    or
    (results is not null and calculator is not null and inputs_id is not null and computed_at is not null)
  ),
  -- results and calc_error never coexist.
  constraint scenario_results_calc_error_exclusive check (
    not (results is not null and calc_error is not null)
  )
);

comment on table public.scenario is
  'Written only by the forge_api role on behalf of the scenario owner.';

create index scenario_user_id_idx on public.scenario (user_id);

alter table public.scenario enable row level security;

revoke all on public.scenario from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger scenario_set_updated_at
  before update on public.scenario
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- profile creation trigger on auth.users
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- profile_directory view
--
-- Deviation from the task brief: the brief names `security_invoker = true`,
-- but `profiles` SELECT is restricted to the caller's own row (see the RLS
-- policy below), so a security_invoker view would return zero rows for every
-- other user and the directory would never show anyone but the caller. The
-- design doc is explicit that this view must "read past the owner-only
-- policy on profiles" by running with the view owner's privileges, which is
-- the default (security_invoker omitted / false) for views created by the
-- migration owner. This migration follows the design doc's stated mechanism
-- and omits security_invoker. Flagged in the task report for confirmation.
-- ---------------------------------------------------------------------------

create view public.profile_directory as
select id, username, org
from public.profiles;

comment on view public.profile_directory is
  'id/username/org for every profile, readable by any signed-in user. '
  'Owned by the migration role so it reads past the owner-only policy on profiles.';

revoke all on public.profile_directory from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- forge_api role
--
-- Placeholder password for local development only. A hosted project must
-- set a real password via `ALTER ROLE forge_api WITH PASSWORD '...'` outside
-- of version control.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'forge_api') then
    create role forge_api with login password 'forge_api_local_dev_password';
  end if;
end
$$;

grant usage on schema public to forge_api;

-- ---------------------------------------------------------------------------
-- Policies and grants: scenario
-- ---------------------------------------------------------------------------

-- Every signed-in user reads every scenario; no write grants.
create policy scenario_select_authenticated
  on public.scenario
  for select
  to authenticated
  using (true);

grant select on public.scenario to authenticated;

-- forge_api reads every scenario and writes only the row it is acting for.
create policy scenario_select_forge_api
  on public.scenario
  for select
  to forge_api
  using (true);

create policy scenario_insert_forge_api
  on public.scenario
  for insert
  to forge_api
  with check (user_id = auth.uid());

create policy scenario_update_forge_api
  on public.scenario
  for update
  to forge_api
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy scenario_delete_forge_api
  on public.scenario
  for delete
  to forge_api
  using (user_id = auth.uid());

grant select, insert, update, delete on public.scenario to forge_api;

-- ---------------------------------------------------------------------------
-- Policies and grants: profiles
-- ---------------------------------------------------------------------------

-- A signed-in user reads and updates only their own row.
create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

grant select on public.profiles to authenticated;

-- Update grant covers only the user-editable fields; id cannot be changed.
grant update (
  username, first_name, last_name, org, org_type, has_done_tutorial
) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Grants: profile_directory
-- ---------------------------------------------------------------------------

grant select on public.profile_directory to authenticated;
