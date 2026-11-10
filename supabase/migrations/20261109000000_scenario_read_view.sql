create view public.scenario_read with (security_invoker = true) as
select s.*, ST_AsGeoJSON(s.route)::jsonb as route_geojson
from public.scenario s;
grant select on public.scenario_read to authenticated;
