-- pgTAP tests for public.scenario_read (spec C7).
-- Run with `supabase test db`.
--
-- The view is security_invoker, so scenario RLS applies to the caller.
-- scenario_select_authenticated is USING (true), which hides nothing.
-- This test then installs an owner-only SELECT policy for the rest of the
-- transaction and checks that a second user cannot see a row that policy hides.
begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

-- ---------------------------------------------------------------------------
-- Fixtures (bootstrap role bypasses RLS)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email)
values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'route-a@test.local'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'route-b@test.local');

insert into public.scenario (id, user_id, name, source, defaults_id, changes, route)
values (
  '22222222-0000-0000-0000-000000000001',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'routed',
  'manual',
  'd1',
  '{}',
  ST_GeomFromGeoJSON('{"type":"MultiLineString","coordinates":[[[-111.54,32.87],[-105.59,34.35]]]}')
);

insert into public.scenario (id, user_id, name, source, defaults_id, changes)
values (
  '22222222-0000-0000-0000-000000000002',
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'other',
  'manual',
  'd1',
  '{}'
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
