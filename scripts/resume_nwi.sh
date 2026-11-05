#!/usr/bin/env bash
# Load named NWI state files into ref.nwi_wetlands.
# Never truncates ref.nwi_wetlands. Never calls the full loader.
set -euo pipefail

STATES="${NWI_STATES:?set NWI_STATES to a comma-separated list such as TX}"
first="${STATES%%,*}"
if [[ "${NWI_USE_EXISTING_STAGING:-}" == "1" && "$first" != "TX" ]]; then
  echo "existing staging is only valid for TX" >&2
  exit 1
fi
if [[ "${NWI_SKIP_REPAIR:-}" == "1" && "$STATES" == *","* ]]; then
  echo "NWI_SKIP_REPAIR applies to one state" >&2
  exit 1
fi

: "${NWI_RELEASE:?set NWI_RELEASE to the release printed in the download}"
: "${NWI_DOWNLOADED_ON:?set NWI_DOWNLOADED_ON to YYYY-MM-DD}"
: "${DATABASE_URL:?set DATABASE_URL}"
SRC="${NWI_SOURCE_DIR:-/srv/forge/gis-data/nwi}"
DIR=$(dirname "$0")
[[ "$NWI_DOWNLOADED_ON" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || {
  echo "NWI_DOWNLOADED_ON must be YYYY-MM-DD" >&2
  exit 1
}
[[ "$NWI_RELEASE" != *"'"* ]] || { echo "NWI_RELEASE must not contain a single quote" >&2; exit 1; }
if ! command -v ogr2ogr >/dev/null; then
  echo "ogr2ogr is not on PATH. On turgon, run this script inside ghcr.io/osgeo/gdal:ubuntu-full-latest." >&2
  exit 1
fi
if ! command -v psql >/dev/null; then
  echo "psql must be on PATH." >&2
  exit 1
fi

declare -A FIPS=(
  [AL]=01 [AK]=02 [AZ]=04 [AR]=05 [CA]=06 [CO]=08 [CT]=09 [DE]=10 [DC]=11
  [FL]=12 [GA]=13 [HI]=15 [ID]=16 [IL]=17 [IN]=18 [IA]=19 [KS]=20 [KY]=21
  [LA]=22 [ME]=23 [MD]=24 [MA]=25 [MI]=26 [MN]=27 [MS]=28 [MO]=29 [MT]=30
  [NE]=31 [NV]=32 [NH]=33 [NJ]=34 [NM]=35 [NY]=36 [NC]=37 [ND]=38 [OH]=39
  [OK]=40 [OR]=41 [PA]=42 [RI]=44 [SC]=45 [SD]=46 [TN]=47 [TX]=48 [UT]=49
  [VT]=50 [VA]=51 [WA]=53 [WV]=54 [WI]=55 [WY]=56
)

require_gather() {
  local statement=$1
  local settings
  settings=$(cat "$DIR/nwi_parallel.sql")
  local plan
  plan=$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v state="$state" -v fips="$fips" <<SQL
$settings
EXPLAIN
$statement
SQL
)
  if ! printf '%s\n' "$plan" | grep -q 'Gather'; then
    printf '%s\n' "$plan" >&2
    if [[ "${2:-}" == "kept" ]]; then
      echo "ref.nwi_fixed was kept" >&2
    fi
    echo "clip plan has no Gather; refusing to run" >&2
    exit 1
  fi
  echo "Gather ok"
}

IFS=',' read -ra WANTED <<<"$STATES"
for state in "${WANTED[@]}"; do
  [[ "$state" =~ ^[A-Z]{2}$ ]] || { echo "bad state code: $state" >&2; exit 1; }
  fips=${FIPS[$state]:-}
  [[ -n "$fips" ]] || { echo "no FIPS for $state" >&2; exit 1; }
  existing=$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -At \
    -c "SELECT count(*) FROM ref.nwi_wetlands WHERE btrim(state) = '${state}'")
  if [[ "$existing" != "0" ]]; then
    echo "$state already has ${existing} polygons; skipping"
    continue
  fi

  if [[ "$state" == "TX" && "${NWI_USE_EXISTING_STAGING:-}" == "1" ]]; then
    rows=$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -At -c "SELECT count(*) FROM ref.nwi_staging")
    [[ "$rows" -gt 0 ]] || { echo "Texas staging is empty" >&2; exit 1; }
    echo "reusing Texas staging ($rows rows)"
  else
    zip="$SRC/${state}_geodatabase_wetlands.zip"
    [[ -f "$zip" ]] || { echo "missing $zip" >&2; exit 1; }
    work=$(mktemp -d)
    unzip -q "$zip" -d "$work"
    gdb=$(find "$work" -name '*.gdb' -type d | head -n 1)
    [[ -n "$gdb" ]] || { echo "no file geodatabase in $zip" >&2; exit 1; }
    layer=""
    while IFS= read -r line; do
      candidate=$(printf '%s' "$line" | awk '{print $2}')
      [[ -n "$candidate" ]] || continue
      summary=$(ogrinfo -so "$gdb" "$candidate")
      if grep -qE '(^|[[:space:]])ATTRIBUTE[[:space:]]*:' <<<"$summary"; then
        layer=$candidate
        break
      fi
    done < <(ogrinfo -so -q "$gdb")
    [[ -n "$layer" ]] || { echo "ATTRIBUTE field not found in $zip" >&2; exit 1; }
    ogr2ogr -f PostgreSQL "PG:$DATABASE_URL" "$gdb" "$layer" \
      -t_srs EPSG:5070 -nlt MULTIPOLYGON -nln ref.nwi_staging -overwrite \
      -lco GEOMETRY_NAME=geom
    rm -rf "$work"
  fi

  gate=$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -At <<'SQL'
SELECT CASE
  WHEN NOT EXISTS (SELECT 1 FROM ref.nwi_staging WHERE objectid = 864514) THEN 'absent'
  WHEN (
    SELECT ST_IsValid(repaired) AND NOT ST_IsEmpty(repaired)
    FROM (
      SELECT ST_CollectionExtract(ST_MakeValid(geom, 'method=structure'), 3) AS repaired
      FROM ref.nwi_staging
      WHERE objectid = 864514
    ) q
  ) THEN 'ok'
  ELSE 'bad'
END;
SQL
)
  if [[ "$state" == "TX" && "$gate" == "bad" ]]; then
    echo "objectid 864514 is still invalid after repair; refusing to run" >&2
    exit 1
  fi
  if [[ "$state" == "TX" && "$gate" == "absent" ]]; then
    echo "Texas staging has no objectid 864514; refusing to run" >&2
    exit 1
  fi

  if [[ "${NWI_SKIP_REPAIR:-}" == "1" ]]; then
    fixed_rows=$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -At -c "SELECT count(*) FROM ref.nwi_fixed")
    [[ "$fixed_rows" -gt 0 ]] || { echo "ref.nwi_fixed is empty; refusing to skip repair" >&2; exit 1; }
  else
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "DROP TABLE IF EXISTS ref.nwi_fixed"
    require_gather "$(cat "$DIR/nwi_repair.sql")"
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction \
      -f "$DIR/nwi_parallel.sql" \
      -f "$DIR/nwi_repair.sql"
  fi

  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "ANALYZE ref.nwi_fixed"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "DROP TABLE IF EXISTS ref.nwi_county"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction \
    -v fips="$fips" \
    -f "$DIR/nwi_parallel.sql" \
    -f "$DIR/nwi_county.sql"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "ANALYZE ref.nwi_county"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "DROP TABLE IF EXISTS ref.nwi_clipped"
  require_gather "$(cat "$DIR/nwi_clip.sql")" kept
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction \
    -v state="$state" -v fips="$fips" \
    -f "$DIR/nwi_parallel.sql" \
    -f "$DIR/nwi_clip.sql"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction \
    -v state="$state" -v fips="$fips" \
    -v release="$NWI_RELEASE" -v downloaded_on="$NWI_DOWNLOADED_ON" \
    -f "$DIR/nwi_parallel.sql" \
    -f "$DIR/nwi_insert.sql" \
    -f "$DIR/nwi_finish.sql"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "DROP TABLE IF EXISTS ref.nwi_fixed"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "DROP TABLE IF EXISTS ref.nwi_county"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "DROP TABLE IF EXISTS ref.nwi_clipped"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "DROP TABLE IF EXISTS ref.nwi_staging"
  echo "$state load committed"
done
