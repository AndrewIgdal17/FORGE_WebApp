-- Route geometry: MultiLineString in WGS 84. Nullable for legacy scenarios.
-- PostGIS is installed in public on turgon (`CREATE EXTENSION postgis`),
-- so the type is public.geometry. extensions.geometry does not exist here.
alter table public.scenario
  add column route public.geometry(MultiLineString, 4326);

-- Intersection results per segment, as jsonb array.
alter table public.scenario
  add column segments jsonb;

-- Spatial index on route for future proximity queries.
create index scenario_route_gist on public.scenario using gist (route);

comment on column public.scenario.route is
  'GeoJSON MultiLineString in EPSG:4326. v1 stores exactly one linestring.';
comment on column public.scenario.segments is
  'Array of {id, geometry, intersections} objects from the route analyze endpoint.';
