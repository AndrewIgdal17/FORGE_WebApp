-- Price archive tables. Applied as postgres.
-- Polygon tables are not created here. The zone crosswalk is a checked-in CSV.

CREATE SCHEMA IF NOT EXISTS ref;

CREATE TABLE ref.price_zone (
  iso text NOT NULL,
  zone text NOT NULL,
  polygon_source text NOT NULL,
  polygon_rto_iso text NOT NULL,
  polygon_loc_type text NOT NULL,
  polygon_loc_abbrev text NOT NULL,
  price_location text,
  load_location text,
  CONSTRAINT price_zone_iso_zone_key UNIQUE (iso, zone),
  CONSTRAINT price_zone_polygon_key UNIQUE (polygon_rto_iso, polygon_loc_type, polygon_loc_abbrev)
);

CREATE TABLE ref.da_price_hourly (
  iso text NOT NULL,
  price_location text NOT NULL,
  hour_utc timestamptz NOT NULL,
  lmp numeric NOT NULL,
  energy numeric NOT NULL,
  congestion numeric NOT NULL,
  loss numeric NOT NULL,
  energy_derived boolean NOT NULL,
  CONSTRAINT da_price_hourly_key UNIQUE (iso, price_location, hour_utc)
);

CREATE TABLE ref.load_hourly (
  iso text NOT NULL,
  load_location text NOT NULL,
  hour_utc timestamptz NOT NULL,
  load_mw numeric NOT NULL,
  CONSTRAINT load_hourly_key UNIQUE (iso, load_location, hour_utc)
);

CREATE TABLE ref.market_pair (
  iso text NOT NULL,
  zone_snd text NOT NULL,
  zone_rcv text NOT NULL,
  spread_per_mwh numeric NOT NULL,
  hours_fwd integer NOT NULL,
  hours_rev integer NOT NULL,
  CONSTRAINT market_pair_key UNIQUE (iso, zone_snd, zone_rcv)
);

CREATE TABLE ref.zone_energy_value (
  iso text NOT NULL,
  zone text NOT NULL,
  energy_value_per_mwh numeric NOT NULL,
  CONSTRAINT zone_energy_value_key UNIQUE (iso, zone)
);

CREATE TABLE ref.price_archive_release (
  label text PRIMARY KEY,
  market_year integer NOT NULL,
  gridstatus_version text NOT NULL,
  polygon_source text NOT NULL,
  loaded_at timestamptz NOT NULL,
  source_sha256 jsonb NOT NULL
);

GRANT USAGE ON SCHEMA ref TO forge_api;
GRANT SELECT ON
  ref.price_zone,
  ref.da_price_hourly,
  ref.load_hourly,
  ref.market_pair,
  ref.zone_energy_value,
  ref.price_archive_release
TO forge_api;

DO $$
BEGIN
  IF to_regclass('ref.rto_subzones') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT ON ref.rto_subzones TO forge_api';
    EXECUTE 'CREATE INDEX IF NOT EXISTS rto_subzones_geom_idx ON ref.rto_subzones USING gist (geom)';
  END IF;
  IF to_regclass('ref.iso_rto_boundaries') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT ON ref.iso_rto_boundaries TO forge_api';
    EXECUTE 'CREATE INDEX IF NOT EXISTS iso_rto_boundaries_geom_idx ON ref.iso_rto_boundaries USING gist (geom)';
  END IF;
END $$;
