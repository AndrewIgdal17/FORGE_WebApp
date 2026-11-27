-- Projects: two terminals and the scenarios that connect them.
-- scenario.project_id stays nullable. A later migration sets it not null.

create table public.project (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  sending_substation_gid integer,
  receiving_substation_gid integer,
  sending_name text not null,
  receiving_name text not null,
  sending_point public.geometry(Point, 4326) not null,
  receiving_point public.geometry(Point, 4326) not null,
  base_scenario_id uuid,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_name_length check (char_length(name) between 1 and 200),
  constraint project_points_differ check (not ST_Equals(sending_point, receiving_point)),
  constraint project_base_scenario_id_fkey
    foreign key (base_scenario_id)
    references public.scenario (id)
    on delete set null
    deferrable initially deferred
);

comment on table public.project is
  'Written only by the forge_api role on behalf of the project owner.';

comment on column public.project.sending_substation_gid is
  'Soft reference. Not a foreign key; the stored point and name are the terminal.';

comment on column public.project.receiving_substation_gid is
  'Soft reference. Not a foreign key; the stored point and name are the terminal.';

alter table public.project enable row level security;

revoke all on public.project from public, anon, authenticated;

create trigger project_set_updated_at
  before update on public.project
  for each row
  execute function public.set_updated_at();

-- Every signed-in user reads every project; no write grants.
create policy project_select_authenticated
  on public.project
  for select
  to authenticated
  using (true);

grant select on public.project to authenticated;

-- forge_api reads every project and writes only the row it is acting for.
create policy project_select_forge_api
  on public.project
  for select
  to forge_api
  using (true);

create policy project_insert_forge_api
  on public.project
  for insert
  to forge_api
  with check (user_id = auth.uid());

create policy project_update_forge_api
  on public.project
  for update
  to forge_api
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy project_delete_forge_api
  on public.project
  for delete
  to forge_api
  using (user_id = auth.uid());

grant select, insert, update, delete on public.project to forge_api;

alter table public.scenario
  add column project_id uuid null references public.project (id) on delete cascade;

create index scenario_project_id_idx on public.scenario (project_id);

create view public.project_read with (security_invoker = true) as
select
  p.*,
  ST_AsGeoJSON(p.sending_point)::jsonb as sending_point_geojson,
  ST_AsGeoJSON(p.receiving_point)::jsonb as receiving_point_geojson
from public.project p;

grant select on public.project_read to authenticated;
