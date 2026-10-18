# Task 3 Report: Phase A Backend API

**Status:** DONE

## Commits

- `ca11da3` — feat: Phase A audit API — substation identity verification

## What changed

### `app/audit.py` — full rewrite (950 → 460 lines)

Replaced the corridor-endpoint name audit with Phase A substation identity verification.

**Routes (same URL paths):**
- `GET /api/audit/next` — one random Tier 2/3 merged substation (HIFLD point NOT inside OSM polygon) with 28 features, both GeoJSON geometries, and ensemble predictions
- `POST /api/audit/decide` — binary decision (`same_facility` / `different_facility`); stores in `ref.phase_a_decisions`; `different_facility` triggers un-merge; retrains ensemble; returns stats + next
- `GET /api/audit/stats` — decision counts by label, remaining queue size, accuracy history

**Queue SQL (`_NEXT_SQL`):**
- Selects from `ref.substations s JOIN ref.substations_hifld h` where `source='merged'`, polygon geometry, `NOT ST_Within(h.geom, s.geom)`, and not yet decided
- Computes spatial features inline: distance, boundary distance, area, compactness, orientation, corridor degree, nearby counts
- Returns HIFLD point + OSM polygon as GeoJSON in EPSG:4326

**Un-merge logic (`different_facility`):**
- `_INSERT_HIFLD_ROW_SQL` — inserts HIFLD point row from `ref.substations_hifld` (joins through merged gid)
- `_INSERT_OSM_ROW_SQL` — inserts OSM polygon row from merged row (strips HIFLD attributes)
- `_NULLIFY_NODE_A_SQL` / `_NULLIFY_NODE_B_SQL` — nullifies corridor references
- `_DELETE_MERGED_SQL` — deletes the merged row
- All five statements run in a single transaction

**Training SQL (`_TRAINING_SQL`):**
- Joins `ref.phase_a_decisions` → `ref.substations` → `ref.substations_hifld`
- Recomputes all 28 features from PostGIS + NLCD sampling
- Un-merged (different_facility) decisions lose their join target and are logged as skipped — same pattern as the old audit

**Kept unchanged:**
- Admin gate (`ADMIN_EMAIL`, `require_admin`, `_email_from_token`)
- Pool/JSON helpers (`_pool()`, `_json()`)
- NLCD sampling (`_nlcd_classes` with `_nlcd_lock`, `_open_nlcd`, `_pixel_code` from route.py)
- Ensemble lifecycle (`warm_ensemble()`, `_retrain()`, module-level `ensemble`)
- User tracking (`_remember_user`)

**Removed:**
- `POST /api/audit/save-polygon` route and all polygon validation (`polygon_geojson`, `_closed_ring`, etc.)
- Relabel logic (`custom_name_for_decision`, `_apply_relabel`, relabel SQL)
- Corridor-endpoint queue (CTEs, `_CANDIDATE_CTES`, `_MISMATCH_SELECT`, etc.)
- FIPS-to-state lookup (`_FIPS_TO_STATE`)
- `DecideRequest.corridor_gid`, `.endpoint`, `.custom_name` fields
- Refresh-target query parameter logic

### `frontend/src/hooks/use-audit-polygon-draw.ts` — deleted

Polygon drawing hook removed per task spec.

### Tests

- **Deleted:** `test_audit_relabel.py` (15 tests), `test_audit_polygon.py` (12 tests) — tested old corridor audit internals
- **Created:** `test_audit_phase_a.py` (27 tests) covering:
  - Phase A labels in `CANONICAL_LABELS`
  - SQL content: queue, remaining, decisions, un-merge, training, counts
  - `_voltage_match` helper (exact, same tier, different tier, None)
  - `_state_match` helper (same, different, None)
  - `DecideRequest` validation (valid + invalid decisions)
  - `_substation_payload` builder (field presence, predictions=None before training, voltage mismatch, state mismatch)

## Test results

```
$ uv run pytest tests/unit/ -v
112 passed, 2 warnings in 15.55s

$ uv run ruff check app/
All checks passed!
```

## Concerns

1. **Training data loss for `different_facility`:** When a substation is un-merged, the merged row is deleted. The training SQL joins through that row, so `different_facility` decisions become unjoinable and are skipped during retraining. Only `same_facility` decisions contribute to the training set. This matches the established pattern from the old audit (which also logged skipped rows). If biased training becomes a problem, a future enhancement could store feature snapshots in `ref.phase_a_decisions`.

2. **`audit_models.py` unchanged:** `CANONICAL_LABELS` was already expanded in Task 2 to include `("same_facility", "different_facility")`. The ensemble's `_validate_training` check accepts both label sets, so the old corridor-audit labels and Phase A labels coexist. No change needed.
