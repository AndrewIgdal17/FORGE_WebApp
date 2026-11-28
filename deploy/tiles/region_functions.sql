-- Region-filtered MVT functions for the four heavy FORGE map layers.
--
-- Applied by hand on turgon as supabase_admin at deploy time (no migration).
-- Martin reads these as function sources (ref.<name>_by_region) after
-- `docker restart martin`.
--
-- Assumptions:
--   * Each source table (ref.corridors, ref.substations_display,
--     ref.highways_nhs, ref.rail_narn) has its geometry column named `geom`
--     in EPSG:5070 and an integer primary key `gid`.
--   * Every non-geometry column is emitted as a feature property through
--     to_jsonb(row) - 'geom'. ST_AsMVT expands jsonb keys into properties.
--   * The MVT layer name is the table id, so the map's styling is unchanged.
--   * The index filter uses the tile's bbox in 5070, with the same 64/4096
--     margin given to ST_AsMVTGeom so lines reaching into the buffer are not
--     dropped at tile edges. The tile edges are segmentized before the
--     transform; without that, z=0 gives a skewed box that misses features.
--
-- Region codes come from query_params->>'regions' (comma-separated). A
-- missing, empty or invalid list (any code outside the six) gives an empty
-- tile, never an error.
--
-- The 25 km buffer is precomputed once per region as a stored generated
-- column (ref.nerc_regions.geom_buffered, simplified to ~500 m first; 25 km
-- of slack makes that harmless). No function unions or buffers per request.
-- The column stays fresh when the loader reloads ref.nerc_regions.

-- Replaced by ref.region_codes_param and the geom_buffered column.
DROP FUNCTION IF EXISTS ref.regions_union_buffered(text[]);

ALTER TABLE ref.nerc_regions
  ADD COLUMN IF NOT EXISTS geom_buffered geometry(MultiPolygon, 5070)
  GENERATED ALWAYS AS (
    ST_Multi(ST_Buffer(ST_SimplifyPreserveTopology(geom, 500), 25000))
  ) STORED;

CREATE INDEX IF NOT EXISTS nerc_regions_geom_buffered_gix
  ON ref.nerc_regions USING gist (geom_buffered);

-- Validated list of region codes from the tile query params. NULL when the
-- list is missing, empty, or has any code outside the six.
CREATE OR REPLACE FUNCTION ref.region_codes_param(query_params json)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN c IS NULL OR cardinality(c) = 0 THEN NULL
    WHEN NOT (c <@ ARRAY['WECC', 'TRE', 'MRO', 'NPCC', 'RF', 'SERC']::text[]) THEN NULL
    ELSE c
  END
  FROM (SELECT string_to_array(nullif(query_params->>'regions', ''), ',') AS c) s
$$;


CREATE OR REPLACE FUNCTION ref.corridors_by_region(
  z integer, x integer, y integer, query_params json
)
RETURNS bytea
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  WITH p AS (
    SELECT
      ref.region_codes_param(query_params) AS codes,
      ST_Envelope(ST_Transform(
        ST_Segmentize(ST_TileEnvelope(z, x, y, margin => 64.0 / 4096), 100000), 5070
      )) AS bbox
  ),
  tile AS (
    SELECT
      ST_AsMVTGeom(
        ST_Transform(c.geom, 3857),
        ST_TileEnvelope(z, x, y), 4096, 64, true
      ) AS geom,
      c.gid AS gid,
      to_jsonb(c) - 'geom' AS props
    FROM ref.corridors c, p
    WHERE p.codes IS NOT NULL
      AND c.geom && p.bbox
      AND EXISTS (
        SELECT 1 FROM ref.nerc_regions nr
        WHERE nr.code = ANY (p.codes)
          AND ST_Intersects(c.geom, nr.geom_buffered)
      )
  )
  SELECT coalesce(ST_AsMVT(tile, 'ref.corridors', 4096, 'geom', 'gid'), ''::bytea)
  FROM tile
$$;

CREATE OR REPLACE FUNCTION ref.substations_display_by_region(
  z integer, x integer, y integer, query_params json
)
RETURNS bytea
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  WITH p AS (
    SELECT
      ref.region_codes_param(query_params) AS codes,
      ST_Envelope(ST_Transform(
        ST_Segmentize(ST_TileEnvelope(z, x, y, margin => 64.0 / 4096), 100000), 5070
      )) AS bbox
  ),
  tile AS (
    SELECT
      ST_AsMVTGeom(
        ST_Transform(s.geom, 3857),
        ST_TileEnvelope(z, x, y), 4096, 64, true
      ) AS geom,
      s.gid AS gid,
      to_jsonb(s) - 'geom' AS props
    FROM ref.substations_display s, p
    WHERE p.codes IS NOT NULL
      AND s.geom && p.bbox
      AND EXISTS (
        SELECT 1 FROM ref.nerc_regions nr
        WHERE nr.code = ANY (p.codes)
          AND ST_Intersects(s.geom, nr.geom_buffered)
      )
  )
  SELECT coalesce(ST_AsMVT(tile, 'ref.substations_display', 4096, 'geom', 'gid'), ''::bytea)
  FROM tile
$$;

CREATE OR REPLACE FUNCTION ref.highways_nhs_by_region(
  z integer, x integer, y integer, query_params json
)
RETURNS bytea
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  WITH p AS (
    SELECT
      ref.region_codes_param(query_params) AS codes,
      ST_Envelope(ST_Transform(
        ST_Segmentize(ST_TileEnvelope(z, x, y, margin => 64.0 / 4096), 100000), 5070
      )) AS bbox
  ),
  tile AS (
    SELECT
      ST_AsMVTGeom(
        ST_Transform(h.geom, 3857),
        ST_TileEnvelope(z, x, y), 4096, 64, true
      ) AS geom,
      h.gid AS gid,
      to_jsonb(h) - 'geom' AS props
    FROM ref.highways_nhs h, p
    WHERE p.codes IS NOT NULL
      AND h.geom && p.bbox
      AND EXISTS (
        SELECT 1 FROM ref.nerc_regions nr
        WHERE nr.code = ANY (p.codes)
          AND ST_Intersects(h.geom, nr.geom_buffered)
      )
  )
  SELECT coalesce(ST_AsMVT(tile, 'ref.highways_nhs', 4096, 'geom', 'gid'), ''::bytea)
  FROM tile
$$;

CREATE OR REPLACE FUNCTION ref.rail_narn_by_region(
  z integer, x integer, y integer, query_params json
)
RETURNS bytea
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  WITH p AS (
    SELECT
      ref.region_codes_param(query_params) AS codes,
      ST_Envelope(ST_Transform(
        ST_Segmentize(ST_TileEnvelope(z, x, y, margin => 64.0 / 4096), 100000), 5070
      )) AS bbox
  ),
  tile AS (
    SELECT
      ST_AsMVTGeom(
        ST_Transform(r.geom, 3857),
        ST_TileEnvelope(z, x, y), 4096, 64, true
      ) AS geom,
      r.gid AS gid,
      to_jsonb(r) - 'geom' AS props
    FROM ref.rail_narn r, p
    WHERE p.codes IS NOT NULL
      AND r.geom && p.bbox
      AND EXISTS (
        SELECT 1 FROM ref.nerc_regions nr
        WHERE nr.code = ANY (p.codes)
          AND ST_Intersects(r.geom, nr.geom_buffered)
      )
  )
  SELECT coalesce(ST_AsMVT(tile, 'ref.rail_narn', 4096, 'geom', 'gid'), ''::bytea)
  FROM tile
$$;
