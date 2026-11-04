CREATE SCHEMA IF NOT EXISTS ref;

CREATE TABLE IF NOT EXISTS ref.nwi_wetlands (
  gid bigserial PRIMARY KEY,
  state char(2) NOT NULL,
  attribute text NOT NULL,
  geom geometry(MultiPolygon, 5070) NOT NULL
);

CREATE TABLE IF NOT EXISTS ref.nwi_provenance (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  source_dir text NOT NULL,
  code_column text NOT NULL,
  release_label text NOT NULL,
  downloaded_on date NOT NULL,
  loaded_at timestamptz NOT NULL DEFAULT now()
);

GRANT USAGE ON SCHEMA ref TO forge_api;
GRANT SELECT ON ref.nwi_wetlands, ref.nwi_provenance TO forge_api;
