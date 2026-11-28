-- pgTAP tests for RLS policies and schema constraints on scenario, project,
-- profiles, and profile_directory. Run with `supabase test db`.
--
-- Fixtures: two auth.users (A, B) created directly so the on_auth_user_created
-- trigger fires and creates matching profiles rows. One scenario and one
-- project per user are seeded as the bootstrap (postgres) role, which
-- bypasses RLS.
begin;

create extension if not exists pgtap with schema extensions;

select plan(45);

-- ---------------------------------------------------------------------------
-- Fixtures (run as the bootstrap `postgres` role, which bypasses RLS)
-- ---------------------------------------------------------------------------

-- postgres is not a member of forge_api by default; grant it for this test
-- transaction only so `set local role forge_api` below succeeds. forge_api
-- also lacks USAGE on the `extensions` schema (where pgtap lives), which it
-- needs to call plan()/ok()/throws_ok()/etc. while impersonating that role.
grant forge_api to postgres;
grant usage on schema extensions to forge_api;

insert into auth.users (id, email)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'user-a@test.local'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'user-b@test.local');

insert into public.project (
  id, user_id, name, sending_name, receiving_name, sending_point, receiving_point, nerc_regions
)
values
  ('33333333-0000-0000-0000-000000000001',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'a project',
   'Laredo',
   'Rio Grande',
   ST_SetSRID(ST_MakePoint(-111.54, 32.87), 4326),
   ST_SetSRID(ST_MakePoint(-105.59, 34.35), 4326), array['TRE']::text[]),
  ('33333333-0000-0000-0000-000000000002',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'b project',
   'Laredo',
   'Rio Grande',
   ST_SetSRID(ST_MakePoint(-111.54, 32.87), 4326),
   ST_SetSRID(ST_MakePoint(-105.59, 34.35), 4326), array['TRE']::text[]);

insert into public.scenario (id, user_id, name, source, defaults_id, changes, project_id)
values
  ('11111111-0000-0000-0000-000000000001',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a scenario', 'manual', 'd1', '{}',
   '33333333-0000-0000-0000-000000000001'),
  ('11111111-0000-0000-0000-000000000002',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b scenario', 'manual', 'd1', '{}',
   '33333333-0000-0000-0000-000000000002');

-- ---------------------------------------------------------------------------
-- Requirement 6: creating a user in auth.users creates a profile row
-- ---------------------------------------------------------------------------

select is(
  (select count(*) from public.profiles
   where id in ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
                'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'))::int,
  2,
  'handle_new_user() created a profiles row for both new auth.users'
);

-- ---------------------------------------------------------------------------
-- Requirement 1: anonymous reads nothing from scenario, profiles, or
-- profile_directory (no grants exist for anon, so every read errors out
-- before RLS is even evaluated).
-- ---------------------------------------------------------------------------

set local role anon;

select throws_ok(
  $$ select * from public.scenario $$,
  '42501',
  null,
  'anon cannot select from scenario'
);

select throws_ok(
  $$ select * from public.profiles $$,
  '42501',
  null,
  'anon cannot select from profiles'
);

select throws_ok(
  $$ select * from public.profile_directory $$,
  '42501',
  null,
  'anon cannot select from profile_directory'
);

reset role;

-- ---------------------------------------------------------------------------
-- Requirement 2: an authenticated user reads every scenario and cannot
-- insert, update, or delete any.
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

select is(
  (select count(*) from public.scenario)::int,
  2,
  'authenticated user A sees both scenarios, including B''s'
);

select throws_ok(
  $$ insert into public.scenario (user_id, name, source, defaults_id, changes, project_id)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'x', 'manual', 'd1', '{}',
             '33333333-0000-0000-0000-000000000001') $$,
  '42501',
  null,
  'authenticated user cannot insert into scenario'
);

select throws_ok(
  $$ update public.scenario set name = 'hacked'
     where id = '11111111-0000-0000-0000-000000000001' $$,
  '42501',
  null,
  'authenticated user cannot update scenario'
);

select throws_ok(
  $$ delete from public.scenario
     where id = '11111111-0000-0000-0000-000000000001' $$,
  '42501',
  null,
  'authenticated user cannot delete from scenario'
);

reset role;

-- ---------------------------------------------------------------------------
-- Project: an authenticated user reads every project and cannot insert,
-- update, or delete any.
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

select is(
  (select count(*) from public.project)::int,
  2,
  'authenticated user A sees both projects, including B''s'
);

select throws_ok(
  $$ insert into public.project (
       user_id, name, sending_name, receiving_name, sending_point, receiving_point, nerc_regions
     ) values (
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
       'x',
       'Laredo',
       'Rio Grande',
       ST_SetSRID(ST_MakePoint(-111.54, 32.87), 4326),
       ST_SetSRID(ST_MakePoint(-105.59, 34.35), 4326), array['TRE']::text[]
     ) $$,
  '42501',
  null,
  'authenticated user cannot insert into project'
);

select throws_ok(
  $$ update public.project set name = 'hacked'
     where id = '33333333-0000-0000-0000-000000000001' $$,
  '42501',
  null,
  'authenticated user cannot update project'
);

select throws_ok(
  $$ delete from public.project
     where id = '33333333-0000-0000-0000-000000000001' $$,
  '42501',
  null,
  'authenticated user cannot delete from project'
);

reset role;

-- ---------------------------------------------------------------------------
-- Requirement 3: an authenticated user reads and updates only their own
-- profile, cannot change id, and sees only id/username/org for others
-- through profile_directory.
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

select is(
  (select count(*) from public.profiles)::int,
  1,
  'authenticated user A sees only their own row in profiles'
);

select lives_ok(
  $$ update public.profiles set org = 'Acme Inc'
     where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  'authenticated user can update their own profile'
);

select is(
  (select org from public.profiles where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'Acme Inc',
  'own-profile update was applied'
);

select throws_ok(
  $$ update public.profiles set id = gen_random_uuid()
     where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  '42501',
  null,
  'authenticated user cannot change their own id column'
);

select lives_ok(
  $$ update public.profiles set org = 'should-not-apply'
     where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' $$,
  'attempting to update another user''s profile does not error (RLS filters the row)'
);

reset role;

select is(
  (select org from public.profiles where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  null,
  'B''s profile was not changed by A''s cross-user update attempt'
);

set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

select is(
  (select count(*) from public.profile_directory)::int,
  2,
  'authenticated user sees every profile through profile_directory'
);

select is(
  (select org from public.profile_directory
   where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  (select org from public.profiles where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  'profile_directory exposes id/username/org for other users'
);

reset role;

-- ---------------------------------------------------------------------------
-- Requirement 4: forge_api, acting for user A, can insert a row for A and
-- cannot insert a row for B or update/delete B's rows.
-- ---------------------------------------------------------------------------

set local role forge_api;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

select lives_ok(
  $$ insert into public.scenario (user_id, name, source, defaults_id, changes, project_id)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'forge_api for A', 'manual', 'd1', '{}',
             '33333333-0000-0000-0000-000000000001') $$,
  'forge_api acting for A can insert a scenario owned by A'
);

select throws_ok(
  $$ insert into public.scenario (user_id, name, source, defaults_id, changes, project_id)
     values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'forge_api for B', 'manual', 'd1', '{}',
             '33333333-0000-0000-0000-000000000002') $$,
  '42501',
  null,
  'forge_api acting for A cannot insert a scenario owned by B'
);

select lives_ok(
  $$ update public.scenario set name = 'hacked by A'
     where id = '11111111-0000-0000-0000-000000000002' $$,
  'forge_api acting for A updating B''s scenario does not error (RLS filters the row)'
);

select lives_ok(
  $$ delete from public.scenario
     where id = '11111111-0000-0000-0000-000000000002' $$,
  'forge_api acting for A deleting B''s scenario does not error (RLS filters the row)'
);

reset role;

select is(
  (select name from public.scenario where id = '11111111-0000-0000-0000-000000000002'),
  'b scenario',
  'B''s scenario was neither updated nor deleted by A''s forge_api attempts'
);

-- ---------------------------------------------------------------------------
-- Project: forge_api, acting for user A, can insert a row for A and cannot
-- insert a row for B or update/delete B's rows.
-- ---------------------------------------------------------------------------

set local role forge_api;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

select lives_ok(
  $$ insert into public.project (
       user_id, name, sending_name, receiving_name, sending_point, receiving_point, nerc_regions
     ) values (
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
       'forge_api for A',
       'Laredo',
       'Rio Grande',
       ST_SetSRID(ST_MakePoint(-111.54, 32.87), 4326),
       ST_SetSRID(ST_MakePoint(-105.59, 34.35), 4326), array['TRE']::text[]
     ) $$,
  'forge_api acting for A can insert a project owned by A'
);

select throws_ok(
  $$ insert into public.project (
       user_id, name, sending_name, receiving_name, sending_point, receiving_point, nerc_regions
     ) values (
       'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
       'forge_api for B',
       'Laredo',
       'Rio Grande',
       ST_SetSRID(ST_MakePoint(-111.54, 32.87), 4326),
       ST_SetSRID(ST_MakePoint(-105.59, 34.35), 4326), array['TRE']::text[]
     ) $$,
  '42501',
  null,
  'forge_api acting for A cannot insert a project owned by B'
);

select lives_ok(
  $$ update public.project set name = 'hacked by A'
     where id = '33333333-0000-0000-0000-000000000002' $$,
  'forge_api acting for A updating B''s project does not error (RLS filters the row)'
);

select lives_ok(
  $$ delete from public.project
     where id = '33333333-0000-0000-0000-000000000002' $$,
  'forge_api acting for A deleting B''s project does not error (RLS filters the row)'
);

reset role;

select is(
  (select name from public.project where id = '33333333-0000-0000-0000-000000000002'),
  'b project',
  'B''s project was neither updated nor deleted by A''s forge_api attempts'
);

-- ---------------------------------------------------------------------------
-- Requirement 5: constraints reject bad data.
-- ---------------------------------------------------------------------------

-- Give A a username (bypassing RLS as the bootstrap role) so the
-- case-insensitive duplicate check below has something to collide with.
update public.profiles set username = 'Alice'
where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

select throws_ok(
  $$ insert into public.scenario (user_id, name, source, defaults_id, changes, results, project_id)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'partial', 'manual', 'd1', '{}', '{}',
             '33333333-0000-0000-0000-000000000001') $$,
  '23514',
  null,
  'scenario rejects results set without calculator/inputs_id/computed_at'
);

select throws_ok(
  $$ insert into public.scenario
       (user_id, name, source, defaults_id, changes,
        results, calculator, inputs_id, computed_at, calc_error, project_id)
     values
       ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'both', 'manual', 'd1', '{}',
        '{}', '{}', 'i1', now(), 'boom',
        '33333333-0000-0000-0000-000000000001') $$,
  '23514',
  null,
  'scenario rejects results coexisting with calc_error'
);

select throws_ok(
  $$ insert into public.scenario (user_id, name, source, defaults_id, changes, project_id)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bad source', 'not-a-real-source', 'd1', '{}',
             '33333333-0000-0000-0000-000000000001') $$,
  '23514',
  null,
  'scenario rejects an unknown source value'
);

select throws_ok(
  $$ update public.profiles set username = 'alice'
     where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' $$,
  '23505',
  null,
  'profiles rejects a case-insensitive duplicate username ("Alice" already set below)'
);

-- ---------------------------------------------------------------------------
-- Project: cascade, base-scenario nulling, distinct points, project_read.
-- ---------------------------------------------------------------------------

insert into public.project (
  id, user_id, name, sending_name, receiving_name, sending_point, receiving_point, nerc_regions
     ) values (
  '33333333-0000-0000-0000-000000000003',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'cascade project',
  'Laredo',
  'Rio Grande',
  ST_SetSRID(ST_MakePoint(-111.54, 32.87), 4326),
  ST_SetSRID(ST_MakePoint(-105.59, 34.35), 4326), array['TRE']::text[]
);

insert into public.scenario (
  id, user_id, name, source, defaults_id, changes, project_id
) values (
  '44444444-0000-0000-0000-000000000001',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'child scenario',
  'manual',
  'd1',
  '{}',
  '33333333-0000-0000-0000-000000000003'
);

update public.project
set base_scenario_id = '44444444-0000-0000-0000-000000000001'
where id = '33333333-0000-0000-0000-000000000003';

delete from public.project
where id = '33333333-0000-0000-0000-000000000003';

select is(
  (select count(*) from public.scenario
   where id = '44444444-0000-0000-0000-000000000001')::int,
  0,
  'deleting a project deletes its scenarios'
);

insert into public.project (
  id, user_id, name, sending_name, receiving_name, sending_point, receiving_point, nerc_regions
     ) values (
  '33333333-0000-0000-0000-000000000004',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'base project',
  'Laredo',
  'Rio Grande',
  ST_SetSRID(ST_MakePoint(-111.54, 32.87), 4326),
  ST_SetSRID(ST_MakePoint(-105.59, 34.35), 4326), array['TRE']::text[]
);

insert into public.scenario (
  id, user_id, name, source, defaults_id, changes, project_id
) values (
  '44444444-0000-0000-0000-000000000002',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'base scenario',
  'manual',
  'd1',
  '{}',
  '33333333-0000-0000-0000-000000000004'
);

update public.project
set base_scenario_id = '44444444-0000-0000-0000-000000000002'
where id = '33333333-0000-0000-0000-000000000004';

delete from public.scenario
where id = '44444444-0000-0000-0000-000000000002';

select is(
  (select base_scenario_id from public.project
   where id = '33333333-0000-0000-0000-000000000004'),
  null,
  'deleting the base scenario sets base_scenario_id to null'
);

select throws_ok(
  $$ insert into public.project (
       user_id, name, sending_name, receiving_name, sending_point, receiving_point, nerc_regions
     ) values (
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
       'same points',
       'Laredo',
       'Laredo',
       ST_SetSRID(ST_MakePoint(-111.54, 32.87), 4326),
       ST_SetSRID(ST_MakePoint(-111.54, 32.87), 4326), array['TRE']::text[]
     ) $$,
  '23514',
  'new row for relation "project" violates check constraint "project_points_differ"',
  'inserting a project with equal points fails project_points_differ'
);

-- Project: nerc_regions accepts only a non-empty, duplicate-free set of the six codes.

select lives_ok(
  $$ insert into public.project (
       user_id, name, sending_name, receiving_name, sending_point, receiving_point, nerc_regions
     ) values (
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
       'regions project',
       'Laredo',
       'Rio Grande',
       ST_SetSRID(ST_MakePoint(-111.54, 32.87), 4326),
       ST_SetSRID(ST_MakePoint(-105.59, 34.35), 4326),
       array['WECC', 'SERC']
     ) $$,
  'a project with two valid NERC regions inserts'
);

select throws_ok(
  $$ insert into public.project (
       user_id, name, sending_name, receiving_name, sending_point, receiving_point, nerc_regions
     ) values (
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
       'null regions project',
       'Laredo',
       'Rio Grande',
       ST_SetSRID(ST_MakePoint(-111.54, 32.87), 4326),
       ST_SetSRID(ST_MakePoint(-105.59, 34.35), 4326),
       null
     ) $$,
  '23502',
  null,
  'a project with null NERC regions is refused (not null)'
);

select throws_ok(
  $$ insert into public.project (
       user_id, name, sending_name, receiving_name, sending_point, receiving_point, nerc_regions
     ) values (
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
       'unknown region project',
       'Laredo',
       'Rio Grande',
       ST_SetSRID(ST_MakePoint(-111.54, 32.87), 4326),
       ST_SetSRID(ST_MakePoint(-105.59, 34.35), 4326),
       array['WECC', 'XYZ']
     ) $$,
  '23514',
  'new row for relation "project" violates check constraint "project_nerc_regions_valid"',
  'a project with an unknown NERC region code is rejected'
);

select throws_ok(
  $$ insert into public.project (
       user_id, name, sending_name, receiving_name, sending_point, receiving_point, nerc_regions
     ) values (
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
       'duplicate region project',
       'Laredo',
       'Rio Grande',
       ST_SetSRID(ST_MakePoint(-111.54, 32.87), 4326),
       ST_SetSRID(ST_MakePoint(-105.59, 34.35), 4326),
       array['WECC', 'WECC']
     ) $$,
  '23514',
  'new row for relation "project" violates check constraint "project_nerc_regions_valid"',
  'a project with a duplicate NERC region code is rejected'
);

select throws_ok(
  $$ insert into public.project (
       user_id, name, sending_name, receiving_name, sending_point, receiving_point, nerc_regions
     ) values (
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
       'empty regions project',
       'Laredo',
       'Rio Grande',
       ST_SetSRID(ST_MakePoint(-111.54, 32.87), 4326),
       ST_SetSRID(ST_MakePoint(-105.59, 34.35), 4326),
       '{}'::text[]
     ) $$,
  '23514',
  'new row for relation "project" violates check constraint "project_nerc_regions_valid"',
  'a project with an empty NERC region array is rejected'
);

select throws_ok(
  $$ insert into public.project (
       user_id, name, sending_name, receiving_name, sending_point, receiving_point, nerc_regions
     ) values (
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
       'null element regions project',
       'Laredo',
       'Rio Grande',
       ST_SetSRID(ST_MakePoint(-111.54, 32.87), 4326),
       ST_SetSRID(ST_MakePoint(-105.59, 34.35), 4326),
       array['WECC', null]::text[]
     ) $$,
  '23514',
  'new row for relation "project" violates check constraint "project_nerc_regions_valid"',
  'a project with a null element in NERC regions is rejected'
);

set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

select is(
  (select sending_point_geojson->>'type' from public.project_read
   where id = '33333333-0000-0000-0000-000000000001'),
  'Point',
  'project_read returns sending_point_geojson with type Point'
);

select is(
  (select array_to_string(nerc_regions, ',') from public.project_read
   where name = 'regions project'),
  'WECC,SERC',
  'project_read exposes nerc_regions'
);

reset role;

select * from finish();

rollback;
