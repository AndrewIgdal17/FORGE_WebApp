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
--   * The index filter uses the tile's bbox in 5070. The tile edges are
--     segmentized before the transform; without that, z=0 gives a skewed
--     box that misses features.
--
-- Region codes come from query_params->>'regions' (comma-separated). A
-- missing, empty or invalid list (any code outside the six, or no matching
-- rows) gives an empty tile, never an error.

-- Union of the named regions, buffered 25 km (EPSG:5070). NULL when the codes
-- are empty, contain a code outside the six, or match no rows.
CREATE OR REPLACE FUNCTION ref.regions_union_buffered(codes text[])
RETURNS geometry
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN codes IS NULL OR cardinality(codes) = 0 THEN NULL
    WHEN NOT (codes <@ ARRAY['WECC', 'TRE', 'MRO', 'NPCC', 'RF', 'SERC']::text[]) THEN NULL
    ELSE (
      SELECT ST_Buffer(ST_Union(r.geom), 25000)
      FROM ref.nerc_regions r
      WHERE r.code = ANY (codes)
    )
  END
$$;

CREATE OR REPLACE FUNCTION ref.corridors_by_region(
  z integer, x integer, y integer, query_params json
)
RETURNS bytea
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  WITH region AS (
    SELECT ref.regions_union_buffered(
      string_to_array(nullif(query_params->>'regions', ''), ',')
    ) AS g
  ),
  tile AS (
    SELECT
      ST_AsMVTGeom(ST_Transform(c.geom, 3857), ST_TileEnvelope(z, x, y), 4096, 64, true) AS geom,
      c.gid AS gid,
      to_jsonb(c) - 'geom' AS props
    FROM ref.corridors c, region
    WHERE region.g IS NOT NULL
      AND c.geom && ST_Envelope(ST_Transform(ST_Segmentize(ST_TileEnvelope(z, x, y), 100000), 5070))
      AND ST_Intersects(c.geom, region.g)
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
  WITH region AS (
    SELECT ref.regions_union_buffered(
      string_to_array(nullif(query_params->>'regions', ''), ',')
    ) AS g
  ),
  tile AS (
    SELECT
      ST_AsMVTGeom(ST_Transform(s.geom, 3857), ST_TileEnvelope(z, x, y), 4096, 64, true) AS geom,
      s.gid AS gid,
      to_jsonb(s) - 'geom' AS props
    FROM ref.substations_display s, region
    WHERE region.g IS NOT NULL
      AND s.geom && ST_Envelope(ST_Transform(ST_Segmentize(ST_TileEnvelope(z, x, y), 100000), 5070))
      AND ST_Intersects(s.geom, region.g)
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
  WITH region AS (
    SELECT ref.regions_union_buffered(
      string_to_array(nullif(query_params->>'regions', ''), ',')
    ) AS g
  ),
  tile AS (
    SELECT
      ST_AsMVTGeom(ST_Transform(h.geom, 3857), ST_TileEnvelope(z, x, y), 4096, 64, true) AS geom,
      h.gid AS gid,
      to_jsonb(h) - 'geom' AS props
    FROM ref.highways_nhs h, region
    WHERE region.g IS NOT NULL
      AND h.geom && ST_Envelope(ST_Transform(ST_Segmentize(ST_TileEnvelope(z, x, y), 100000), 5070))
      AND ST_Intersects(h.geom, region.g)
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
  WITH region AS (
    SELECT ref.regions_union_buffered(
      string_to_array(nullif(query_params->>'regions', ''), ',')
    ) AS g
  ),
  tile AS (
    SELECT
      ST_AsMVTGeom(ST_Transform(r.geom, 3857), ST_TileEnvelope(z, x, y), 4096, 64, true) AS geom,
      r.gid AS gid,
      to_jsonb(r) - 'geom' AS props
    FROM ref.rail_narn r, region
    WHERE region.g IS NOT NULL
      AND r.geom && ST_Envelope(ST_Transform(ST_Segmentize(ST_TileEnvelope(z, x, y), 100000), 5070))
      AND ST_Intersects(r.geom, region.g)
  )
  SELECT coalesce(ST_AsMVT(tile, 'ref.rail_narn', 4096, 'geom', 'gid'), ''::bytea)
  FROM tile
$$;
