#!/usr/bin/env bash
# Load state NWI file geodatabases into ref.nwi_wetlands.
# Clip each file to that state's counties. Do not filter Cowardin codes here.
set -euo pipefail

: "${NWI_RELEASE:?set NWI_RELEASE to the release printed in the download}"
: "${NWI_DOWNLOADED_ON:?set NWI_DOWNLOADED_ON to YYYY-MM-DD}"
: "${DATABASE_URL:?set DATABASE_URL}"
SRC="${NWI_SOURCE_DIR:-/srv/forge/gis-data/nwi}"
[[ "$NWI_DOWNLOADED_ON" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || {
  echo "NWI_DOWNLOADED_ON must be YYYY-MM-DD" >&2
  exit 1
}
[[ "$NWI_RELEASE" != *"'"* ]] || { echo "NWI_RELEASE must not contain a single quote" >&2; exit 1; }
if ! command -v ogr2ogr >/dev/null; then
  echo "ogr2ogr is not on PATH. On turgon, run this script inside ghcr.io/osgeo/gdal:ubuntu-full-latest with ${SRC} mounted and the Supabase network attached." >&2
  exit 1
fi

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$(dirname "$0")/nwi_schema.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "DROP TABLE IF EXISTS ref.nwi_staging"

declare -A FIPS=(
  [AL]=01 [AK]=02 [AZ]=04 [AR]=05 [CA]=06 [CO]=08 [CT]=09 [DE]=10 [DC]=11
  [FL]=12 [GA]=13 [HI]=15 [ID]=16 [IL]=17 [IN]=18 [IA]=19 [KS]=20 [KY]=21
  [LA]=22 [ME]=23 [MD]=24 [MA]=25 [MI]=26 [MN]=27 [MS]=28 [MO]=29 [MT]=30
  [NE]=31 [NV]=32 [NH]=33 [NJ]=34 [NM]=35 [NY]=36 [NC]=37 [ND]=38 [OH]=39
  [OK]=40 [OR]=41 [PA]=42 [RI]=44 [SC]=45 [SD]=46 [TN]=47 [TX]=48 [UT]=49
  [VT]=50 [VA]=51 [WA]=53 [WV]=54 [WI]=55 [WY]=56
)

shopt -s nullglob
for zip in "$SRC"/*.zip; do
  base=$(basename "$zip")
  state=$(printf '%s' "$base" | cut -c1-2 | tr '[:lower:]' '[:upper:]')
  [[ "$state" =~ ^[A-Z]{2}$ ]] || { echo "cannot read a state code from $base" >&2; exit 1; }
  fips=${FIPS[$state]:-}
  [[ -n "$fips" ]] || { echo "no FIPS for $state ($base)" >&2; exit 1; }
  work=$(mktemp -d)
  unzip -q "$zip" -d "$work"
  gdb=$(find "$work" -name '*.gdb' -type d | head -n 1)
  [[ -n "$gdb" ]] || { echo "no file geodatabase in $base" >&2; exit 1; }
  ogrinfo -so "$gdb" | grep -q 'ATTRIBUTE' || { echo "ATTRIBUTE field not found in $base" >&2; exit 1; }
  layer=$(ogrinfo -so -q "$gdb" | head -n 1 | awk '{print $2}')
  ogr2ogr -f PostgreSQL "PG:$DATABASE_URL" "$gdb" "$layer" \
    -t_srs EPSG:5070 -nlt MULTIPOLYGON -nln ref.nwi_staging -overwrite
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<SQL
INSERT INTO ref.nwi_wetlands (state, attribute, geom)
SELECT '${state}', s.attribute,
       ST_Multi(ST_CollectionExtract(ST_Intersection(s.geom, c.geom), 3))
FROM ref.nwi_staging s
JOIN (
  SELECT ST_Union(geom) AS geom
  FROM ref.counties_tiger
  WHERE statefp = '${fips}'
) c ON ST_Intersects(s.geom, c.geom)
WHERE NOT ST_IsEmpty(ST_Intersection(s.geom, c.geom));
DROP TABLE ref.nwi_staging;
SQL
  rm -rf "$work"
done

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<SQL
CREATE INDEX IF NOT EXISTS nwi_wetlands_geom_idx ON ref.nwi_wetlands USING GIST (geom);
CREATE INDEX IF NOT EXISTS nwi_wetlands_attribute_idx ON ref.nwi_wetlands (attribute);
INSERT INTO ref.nwi_provenance (id, source_dir, code_column, release_label, downloaded_on)
VALUES (1, '${SRC}', 'ATTRIBUTE', '${NWI_RELEASE}', '${NWI_DOWNLOADED_ON}')
ON CONFLICT (id) DO UPDATE
SET source_dir = EXCLUDED.source_dir,
    code_column = EXCLUDED.code_column,
    release_label = EXCLUDED.release_label,
    downloaded_on = EXCLUDED.downloaded_on,
    loaded_at = now();
SQL
