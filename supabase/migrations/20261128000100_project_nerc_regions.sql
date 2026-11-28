-- NERC regions on a project: the regional entities the project sits in.
-- Nullable here. Task 3 backfills existing rows, then sets not null.

-- A CHECK cannot hold a subquery, so the uniqueness test lives in this helper.
create function public.nerc_regions_valid(codes text[])
returns boolean
language sql
immutable
as $$
  select codes is not null
    and cardinality(codes) >= 1
    and array_position(codes, null) is null
    and codes <@ array['WECC', 'TRE', 'MRO', 'NPCC', 'RF', 'SERC']::text[]
    and cardinality(array(select distinct unnest(codes))) = cardinality(codes)
$$;

alter table public.project
  add column nerc_regions text[] null,
  add constraint project_nerc_regions_valid
    check (nerc_regions is null or public.nerc_regions_valid(nerc_regions));

comment on column public.project.nerc_regions is
  'NERC regional entities the project sits in: a non-empty, duplicate-free subset of WECC, TRE, MRO, NPCC, RF, SERC.';

-- Recreate the view: a new column cannot be added in the middle with
-- create or replace, and p.* places nerc_regions before the geojson columns.
drop view public.project_read;

create view public.project_read with (security_invoker = true) as
select
  p.*,
  ST_AsGeoJSON(p.sending_point)::jsonb as sending_point_geojson,
  ST_AsGeoJSON(p.receiving_point)::jsonb as receiving_point_geojson
from public.project p;

grant select on public.project_read to authenticated;
