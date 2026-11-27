-- scenario_read was created as `select s.*` plus route_geojson.
-- Postgres froze that list. project_id was added later and is absent.
-- CREATE OR REPLACE cannot reorder columns, and `select s.*` would put
-- project_id before route_geojson, which Postgres rejects. List the frozen
-- columns and append project_id after route_geojson.

create or replace view public.scenario_read
with (security_invoker = true) as
select
  s.id,
  s.user_id,
  s.name,
  s.source,
  s.defaults_id,
  s.changes,
  s.results,
  s.calculator,
  s.inputs_id,
  s.computed_at,
  s.calc_error,
  s.revision,
  s.created_at,
  s.updated_at,
  s.route,
  s.segments,
  s.layer_releases,
  ST_AsGeoJSON(s.route)::jsonb as route_geojson,
  s.project_id
from public.scenario s;

grant select on public.scenario_read to authenticated;
