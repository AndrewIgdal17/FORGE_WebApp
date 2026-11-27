-- Store which corridor pieces a reconductoring or rebuild scenario selected.

alter table public.scenario
  add column line_selection jsonb null;

alter table public.scenario
  add constraint scenario_line_selection_is_object
  check (line_selection is null or jsonb_typeof(line_selection) = 'object');

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
  s.project_id,
  s.line_selection
from public.scenario s;

grant select on public.scenario_read to authenticated;