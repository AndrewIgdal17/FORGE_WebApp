CREATE SCHEMA IF NOT EXISTS ref;

CREATE TABLE IF NOT EXISTS ref.nwi_wetlands (
  gid bigserial PRIMARY KEY,
  state char(2) NOT NULL,
  attribute text NOT NULL,
  geom geometry(MultiPolygon, 5070) NOT NULL
);

-- One row per state the loader wrote. A single id = 1 row cannot say which
-- state files were in the directory, so a later route through a missing state
-- looks like zero wetland miles.
DROP TABLE IF EXISTS ref.nwi_provenance;
CREATE TABLE ref.nwi_provenance (
  state char(2) PRIMARY KEY,
  release_label text NOT NULL,
  downloaded_on date NOT NULL,
  loaded_at timestamptz NOT NULL DEFAULT now()
);

GRANT USAGE ON SCHEMA ref TO forge_api;
GRANT SELECT ON ref.nwi_wetlands, ref.nwi_provenance TO forge_api;
