-- NERC regions and interconnections (reference shapes). Applied as postgres.
-- Rows are loaded by scripts/load_nerc_regions.py. On turgon the ref schema is
-- managed outside migrations, so the deploy applies this file by hand.

CREATE SCHEMA IF NOT EXISTS ref;

CREATE TABLE IF NOT EXISTS ref.nerc_regions (
  code text PRIMARY KEY,
  name text NOT NULL,
  geom public.geometry(MultiPolygon, 5070) NOT NULL
);

CREATE TABLE IF NOT EXISTS ref.interconnections (
  code text PRIMARY KEY,
  name text NOT NULL,
  geom public.geometry(MultiPolygon, 5070) NOT NULL
);

CREATE INDEX IF NOT EXISTS nerc_regions_geom_idx ON ref.nerc_regions USING gist (geom);
CREATE INDEX IF NOT EXISTS interconnections_geom_idx ON ref.interconnections USING gist (geom);

GRANT USAGE ON SCHEMA ref TO forge_api, authenticated;
GRANT SELECT ON ref.nerc_regions, ref.interconnections TO forge_api, authenticated;
