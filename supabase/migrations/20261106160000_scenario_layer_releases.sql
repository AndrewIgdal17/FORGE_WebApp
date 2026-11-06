alter table public.scenario
  add column layer_releases jsonb;

comment on column public.scenario.layer_releases is
  'Edition labels for the GIS layers used when this row was last calculated.';
