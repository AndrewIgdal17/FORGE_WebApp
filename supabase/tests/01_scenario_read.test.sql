-- pgTAP tests for public.scenario_read (spec C7).
-- Run with `supabase test db`.
--
-- The view is security_invoker, so scenario RLS applies to the caller.
-- scenario_select_authenticated is USING (true), which hides nothing.
-- This test then installs an owner-only SELECT policy for the rest of the
-- transaction and checks that a second user cannot see a row that policy hides.
begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

-- ---------------------------------------------------------------------------
-- Fixtures (bootstrap role bypasses RLS)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email)
values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'route-a@test.local'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'route-b@test.local');

insert into public.project (
  id, user_id, name, sending_name, receiving_name, sending_point, receiving_point
)
values
  ('33333333-0000-0000-0000-000000000011',
   'cccccccc-cccc-cccc-cccc-cccccccccccc',
   'c project',
   'Laredo',
   'Rio Grande',
   ST_SetSRID(ST_MakePoint(-111.54, 32.87), 4326),
   ST_SetSRID(ST_MakePoint(-105.59, 34.35), 4326)),
  ('33333333-0000-0000-0000-000000000012',
   'dddddddd-dddd-dddd-dddd-dddddddddddd',
   'd project',
   'Laredo',
   'Rio Grande',
   ST_SetSRID(ST_MakePoint(-111.54, 32.87), 4326),
   ST_SetSRID(ST_MakePoint(-105.59, 34.35), 4326));

insert into public.scenario (id, user_id, name, source, defaults_id, changes, route, project_id)
values (
  '22222222-0000-0000-0000-000000000001',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'routed',
  'manual',
  'd1',
  '{}',
  ST_GeomFromGeoJSON('{"type":"MultiLineString","coordinates":[[[-111.54,32.87],[-105.59,34.35]]]}'),
  '33333333-0000-0000-0000-000000000011'
);

insert into public.scenario (id, user_id, name, source, defaults_id, changes, project_id)
values (
  '22222222-0000-0000-0000-000000000002',
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'other',
  'manual',
  'd1',
  '{}',
  '33333333-0000-0000-0000-000000000012'
);

-- ---------------------------------------------------------------------------
-- project_id is appended after route_geojson. select s.* would reorder it.
-- ---------------------------------------------------------------------------

select ok(
  (
    select attnum
    from pg_attribute
    where attrelid = 'public.scenario_read'::regclass
      and attname = 'project_id'
      and not attisdropped
  ) = (
    select attnum
    from pg_attribute
    where attrelid = 'public.scenario_read'::regclass
      and attname = 'route_geojson'
      and not attisdropped
  ) + 1,
  'scenario_read appends project_id after route_geojson'
);

-- ---------------------------------------------------------------------------
-- A stored route comes back as a MultiLineString object.
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

select is(
  (select jsonb_typeof(route_geojson) from public.scenario_read
   where id = '22222222-0000-0000-0000-000000000001'),
  'object',
  'a row inserted with a route has jsonb_typeof(route_geojson) = object'
);

select is(
  (select route_geojson->>'type' from public.scenario_read
   where id = '22222222-0000-0000-0000-000000000001'),
  'MultiLineString',
  'route_geojson type is MultiLineString'
);

select is(
  (select project_id::text from public.scenario_read
   where id = '22222222-0000-0000-0000-000000000001'),
  '33333333-0000-0000-0000-000000000011',
  'scenario_read returns project_id'
);

reset role;

-- ---------------------------------------------------------------------------
-- security_invoker: a policy that hides a row hides it through the view.
-- ---------------------------------------------------------------------------

drop policy scenario_select_authenticated on public.scenario;

create policy scenario_select_own
  on public.scenario
  for select
  to authenticated
  using (user_id = auth.uid());

set local role authenticated;
set local request.jwt.claim.sub = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

select is(
  (select count(*) from public.scenario_read
   where id = '22222222-0000-0000-0000-000000000001')::int,
  0,
  'user B cannot see a row their RLS policy hides'
);

select is(
  (select count(*) from public.scenario_read
   where id = '22222222-0000-0000-0000-000000000002')::int,
  1,
  'user B still sees their own row through scenario_read'
);

reset role;

select * from finish();

rollback;
