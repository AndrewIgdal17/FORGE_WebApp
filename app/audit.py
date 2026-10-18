"""Phase A substation-identity verification audit API.

Three routes, all gated to one operator email:

- ``GET /api/audit/next`` — one random Tier 2/3 merged substation
- ``POST /api/audit/decide`` — ``same_facility_hifld``,
  ``same_facility_osm``, or ``different_facility``
- ``GET /api/audit/stats`` — decision counts, remaining, accuracy history

Tier 2/3: merged substations where the HIFLD point is NOT inside the
matched OSM polygon.  Each row shows the operator an HIFLD point and an
OSM polygon and asks: same physical facility or different?

A ``different_facility`` decision un-merges: the merged row is deleted,
separate ``hifld`` and ``osm`` rows are inserted, and corridors that
referenced the deleted ``gid`` have their node pointers nullified.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Literal

import asyncpg
import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from . import db as db_module
from .audit_features import compute_phase_a_features, features_to_array
from .audit_models import AuditEnsemble
from .models import sanitize_for_json
from .route import _nlcd_lock, _open_nlcd, _pixel_code

logger = logging.getLogger(__name__)

router = APIRouter()

ADMIN_EMAIL = "andrewigdal17@gmail.com"
_DECISIONS = ("same_facility_hifld", "same_facility_osm", "different_facility")
_bearer = HTTPBearer(auto_error=False)

ensemble = AuditEnsemble()
_lock = asyncio.Lock()
_warmed = False

# ---------------------------------------------------------------------------
# NLCD land-cover sampling
# ---------------------------------------------------------------------------

_nlcd_unavailable = False


def _nlcd_classes(points: list[tuple[Any, Any]]) -> list[float]:
    """NLCD class codes at EPSG:5070 coordinates.  Missing samples are 0."""
    global _nlcd_unavailable
    classes = [0.0] * len(points)
    if _nlcd_unavailable or not points:
        return classes

    coords: list[tuple[float, float]] = []
    indexes: list[int] = []
    for index, (x, y) in enumerate(points):
        if x is None or y is None:
            continue
        try:
            coords.append((float(x), float(y)))
        except (TypeError, ValueError):
            continue
        indexes.append(index)
    if not coords:
        return classes

    try:
        with _nlcd_lock:
            dataset = _open_nlcd()
            samples = list(dataset.sample(coords))
    except FileNotFoundError as exc:
        _nlcd_unavailable = True
        logger.warning("NLCD raster not found (%s); nlcd_class stays 0", exc)
        return classes
    except RuntimeError as exc:
        _nlcd_unavailable = True
        logger.warning("NLCD sampling unavailable (%s); nlcd_class stays 0", exc)
        return classes
    except Exception:
        logger.exception("NLCD sampling failed; nlcd_class stays 0")
        return classes

    for index, sample in zip(indexes, samples, strict=True):
        code = _pixel_code(sample)
        if code is not None:
            classes[index] = float(code)
    return classes


# ---------------------------------------------------------------------------
# SQL — queue (Tier 2/3 merged substations)
# ---------------------------------------------------------------------------

_NEXT_SQL = """
WITH tier23 AS (
    SELECT s.gid, s.name AS osm_name, s.osm_original_name, s.hifld_id, s.osm_id,
           s.hifld_type, s.osm_type,
           s.voltage_kv AS osm_voltage_kv,
           h.name AS hifld_name,
           h.max_volt AS hifld_voltage_kv,
           s.state, s.county, s.operator,
           h.state AS hifld_state,
           ST_Distance(h.geom, ST_Centroid(s.geom)) AS distance_m,
           ST_Distance(h.geom, ST_Boundary(s.geom)) AS boundary_distance_m,
           ST_Area(s.geom) AS osm_area_sqm,
           4 * pi() * ST_Area(s.geom)
               / NULLIF(power(ST_Perimeter(s.geom), 2), 0) AS compactness,
           degrees(ST_Azimuth(
               ST_PointN(ST_ExteriorRing(ST_OrientedEnvelope(s.geom)), 1),
               ST_PointN(ST_ExteriorRing(ST_OrientedEnvelope(s.geom)), 2)
           )) AS orientation_deg,
           (SELECT count(*) FROM ref.corridors c
            WHERE c.node_a = s.gid OR c.node_b = s.gid) AS corridor_degree,
           (SELECT count(*) FROM ref.substations_hifld h2
            WHERE h2.hifld_id != s.hifld_id
              AND ST_DWithin(h2.geom, s.geom, 500)) AS nearby_hifld,
           (SELECT count(*) FROM ref.substations s2
            WHERE s2.gid != s.gid
              AND s2.source IN ('osm', 'merged')
              AND ST_GeometryType(s2.geom) != 'ST_Point'
              AND ST_DWithin(s2.geom, h.geom, 500)) AS nearby_osm,
           ST_AsGeoJSON(ST_Transform(h.geom, 4326)) AS hifld_geojson,
           ST_AsGeoJSON(ST_Transform(s.geom, 4326)) AS osm_geojson,
           ST_X(h.geom) AS hifld_x, ST_Y(h.geom) AS hifld_y,
           ST_X(ST_Centroid(s.geom)) AS osm_cx,
           ST_Y(ST_Centroid(s.geom)) AS osm_cy
    FROM ref.substations s
    JOIN ref.substations_hifld h ON h.hifld_id = s.hifld_id
    WHERE s.source = 'merged'
      AND ST_GeometryType(s.geom) != 'ST_Point'
      AND NOT ST_Within(h.geom, s.geom)
      AND s.gid NOT IN (SELECT sub_gid FROM ref.phase_a_decisions)
),
picked AS (
    SELECT * FROM tier23 ORDER BY distance_m DESC LIMIT 1
)
SELECT * FROM picked
"""

# ---------------------------------------------------------------------------
# SQL — remaining count
# ---------------------------------------------------------------------------

_REMAINING_SQL = """
SELECT count(*)::int
FROM ref.substations s
JOIN ref.substations_hifld h ON h.hifld_id = s.hifld_id
WHERE s.source = 'merged'
  AND ST_GeometryType(s.geom) != 'ST_Point'
  AND NOT ST_Within(h.geom, s.geom)
  AND s.gid NOT IN (SELECT sub_gid FROM ref.phase_a_decisions)
"""

# ---------------------------------------------------------------------------
# SQL — decisions
# ---------------------------------------------------------------------------

_INSERT_DECISION_SQL = """
INSERT INTO ref.phase_a_decisions
    (sub_gid, hifld_id, osm_id, decision, name_preference)
SELECT s.gid, s.hifld_id, s.osm_id, $2, $3
FROM ref.substations s
WHERE s.gid = $1
"""

_UPDATE_OSM_NAME_SQL = """
UPDATE ref.substations
SET name = osm_original_name
WHERE gid = $1
  AND osm_original_name IS NOT NULL
  AND trim(osm_original_name) != ''
"""

_SUBSTATION_EXISTS_SQL = "SELECT 1 FROM ref.substations WHERE gid = $1"

# ---------------------------------------------------------------------------
# SQL — un-merge (different_facility)
# ---------------------------------------------------------------------------

_INSERT_HIFLD_ROW_SQL = """
INSERT INTO ref.substations
    (name, hifld_type, osm_type, voltage_kv, operator,
     state, county, status, source, osm_id, hifld_id, geom)
SELECT h.name, h.type, NULL,
       CASE WHEN h.max_volt > 0 THEN h.max_volt ELSE NULL END, NULL,
       h.state, h.county, h.status, 'hifld', NULL, h.hifld_id, h.geom
FROM ref.substations_hifld h
JOIN ref.substations s ON s.hifld_id = h.hifld_id
WHERE s.gid = $1
"""

_INSERT_OSM_ROW_SQL = """
INSERT INTO ref.substations
    (name, hifld_type, osm_type, voltage_kv, operator,
     state, county, status, source, osm_id, hifld_id, geom)
SELECT s.name, NULL, s.osm_type, s.voltage_kv, s.operator,
       NULL, NULL, 'IN SERVICE', 'osm', s.osm_id, NULL, s.geom
FROM ref.substations s
WHERE s.gid = $1 AND s.source = 'merged'
"""

_NULLIFY_NODE_A_SQL = "UPDATE ref.corridors SET node_a = NULL WHERE node_a = $1"
_NULLIFY_NODE_B_SQL = "UPDATE ref.corridors SET node_b = NULL WHERE node_b = $1"
_DELETE_MERGED_SQL = "DELETE FROM ref.substations WHERE gid = $1"

# ---------------------------------------------------------------------------
# SQL — training
# ---------------------------------------------------------------------------

_COUNT_SQL = "SELECT count(*)::int FROM ref.phase_a_decisions"

_COUNT_BY_DECISION_SQL = """
SELECT decision, count(*)::int AS n
FROM ref.phase_a_decisions
GROUP BY decision
"""

_TRAINING_SQL = """
SELECT d.decision,
       h.name AS hifld_name,
       s.name AS osm_name,
       s.osm_original_name,
       s.hifld_type, s.osm_type,
       h.max_volt AS hifld_voltage_kv,
       s.voltage_kv AS osm_voltage_kv,
       s.state,
       h.state AS hifld_state,
       ST_Distance(h.geom, ST_Centroid(s.geom)) AS distance_m,
       ST_Within(h.geom, s.geom) AS hifld_inside,
       ST_Distance(h.geom, ST_Boundary(s.geom)) AS boundary_distance_m,
       ST_Area(s.geom) AS osm_area_sqm,
       4 * pi() * ST_Area(s.geom)
           / NULLIF(power(ST_Perimeter(s.geom), 2), 0) AS compactness,
       degrees(ST_Azimuth(
           ST_PointN(ST_ExteriorRing(ST_OrientedEnvelope(s.geom)), 1),
           ST_PointN(ST_ExteriorRing(ST_OrientedEnvelope(s.geom)), 2)
       )) AS orientation_deg,
       (SELECT count(*) FROM ref.corridors c
        WHERE c.node_a = s.gid OR c.node_b = s.gid) AS corridor_degree,
       (SELECT count(*) FROM ref.substations_hifld h2
        WHERE h2.hifld_id != s.hifld_id
          AND ST_DWithin(h2.geom, s.geom, 500)) AS nearby_hifld,
       (SELECT count(*) FROM ref.substations s2
        WHERE s2.gid != s.gid
          AND s2.source IN ('osm', 'merged')
          AND ST_GeometryType(s2.geom) != 'ST_Point'
          AND ST_DWithin(s2.geom, h.geom, 500)) AS nearby_osm,
       ST_X(h.geom) AS hifld_x,
       ST_Y(h.geom) AS hifld_y,
       ST_X(ST_Centroid(s.geom)) AS osm_cx,
       ST_Y(ST_Centroid(s.geom)) AS osm_cy
FROM ref.phase_a_decisions d
JOIN ref.substations s ON s.gid = d.sub_gid
JOIN ref.substations_hifld h ON h.hifld_id = s.hifld_id
ORDER BY d.id
"""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _voltage_tier(kv: float) -> str:
    if kv >= 345:
        return "ehv"
    if kv >= 100:
        return "hv"
    return "sub"


def _voltage_match(hifld_kv: Any, osm_kv: Any) -> float:
    """1 when kV values match, 0.5 on the same tier, else 0."""
    if hifld_kv is None or osm_kv is None:
        return 0.0
    try:
        h = float(hifld_kv)
        o = float(osm_kv)
    except (TypeError, ValueError):
        return 0.0
    if h == o:
        return 1.0
    if _voltage_tier(h) == _voltage_tier(o):
        return 0.5
    return 0.0


def _state_match(hifld_state: Any, osm_state: Any) -> bool:
    """True when the HIFLD and merged substation share the same state code."""
    if hifld_state is None or osm_state is None:
        return False
    return str(hifld_state).strip().upper() == str(osm_state).strip().upper()


def _geojson(value: Any) -> Any:
    if value is None or isinstance(value, (dict, list)):
        return value
    if isinstance(value, str):
        return json.loads(value)
    return value


def _optional_number(value: Any) -> float | None:
    if value is None:
        return None
    return float(value)


def _features_from_row(
    row: Any, nlcd_hifld: float, nlcd_osm: float,
) -> dict[str, float]:
    """Build the 28-feature dict from a queue or training row."""
    return compute_phase_a_features(
        distance_m=float(row["distance_m"] or 0),
        hifld_inside=bool(row.get("hifld_inside", False)),
        osm_area_sqm=float(row["osm_area_sqm"] or 0),
        boundary_distance_m=float(row["boundary_distance_m"] or 0),
        hifld_name=row["hifld_name"],
        osm_name=row["osm_name"],
        voltage_match=_voltage_match(
            row["hifld_voltage_kv"], row["osm_voltage_kv"],
        ),
        hifld_voltage_kv=row.get("hifld_voltage_kv"),
        osm_voltage_kv=row.get("osm_voltage_kv"),
        hifld_type=row["hifld_type"],
        osm_type=row["osm_type"],
        nearby_hifld=int(row["nearby_hifld"] or 0),
        nearby_osm=int(row["nearby_osm"] or 0),
        corridor_degree=int(row["corridor_degree"] or 0),
        state_match=_state_match(row.get("hifld_state"), row.get("state")),
        compactness=float(row["compactness"] or 0),
        orientation_deg=float(row["orientation_deg"] or 0),
        nlcd_at_hifld=nlcd_hifld,
        nlcd_at_osm=nlcd_osm,
    )


def _substation_payload(
    row: Any, nlcd_hifld: float, nlcd_osm: float,
) -> dict[str, Any]:
    """Build the JSON response for one queued substation."""
    features = _features_from_row(row, nlcd_hifld, nlcd_osm)
    return {
        "done": False,
        "sub_gid": int(row["gid"]),
        "hifld_id": row["hifld_id"],
        "osm_id": row["osm_id"],
        "hifld_name": row["hifld_name"],
        "osm_original_name": row["osm_original_name"],
        "merged_name": row["osm_name"],
        "hifld_voltage_kv": _optional_number(row["hifld_voltage_kv"]),
        "osm_voltage_kv": _optional_number(row["osm_voltage_kv"]),
        "hifld_type": row["hifld_type"],
        "osm_type": row["osm_type"],
        "distance_m": float(row["distance_m"] or 0),
        "boundary_distance_m": float(row["boundary_distance_m"] or 0),
        "osm_area_sqm": float(row["osm_area_sqm"] or 0),
        "compactness": float(row["compactness"] or 0),
        "orientation_deg": float(row["orientation_deg"] or 0),
        "corridor_degree": int(row["corridor_degree"] or 0),
        "nearby_hifld": int(row["nearby_hifld"] or 0),
        "nearby_osm": int(row["nearby_osm"] or 0),
        "state": row["state"],
        "county": row["county"],
        "voltage_match": features["voltage_match"],
        "state_match": bool(features["state_match"]),
        "hifld_geojson": _geojson(row["hifld_geojson"]),
        "osm_geojson": _geojson(row["osm_geojson"]),
        "predictions": ensemble.predict(features_to_array(features)),
    }


# ---------------------------------------------------------------------------
# Auth / admin gate
# ---------------------------------------------------------------------------


async def _email_from_token(user: dict) -> str:
    """Operator email from the JWT, then ``auth.users`` if the claim is absent."""
    for claim in (
        user.get("email"),
        (user.get("user_metadata") or {}).get("email"),
    ):
        if isinstance(claim, str) and claim.strip():
            return claim.strip().lower()

    user_id = user.get("sub")
    if not user_id:
        return ""
    try:
        pool = db_module.get_db_pool()
    except RuntimeError:
        return ""
    try:
        async with pool.acquire() as conn:
            found = await conn.fetchval(
                "SELECT email FROM auth.users WHERE id = $1::uuid",
                str(user_id),
            )
    except asyncpg.PostgresError as exc:
        logger.warning("Audit admin email lookup failed: %s", exc)
        return ""
    if not isinstance(found, str):
        return ""
    return found.strip().lower()


async def require_admin(
    cred: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict:
    """Verify the bearer token, then require the operator email."""
    from .main import require_auth

    user = await require_auth(cred)
    email = await _email_from_token(user)
    if email != ADMIN_EMAIL:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    return user


_API_DECISIONS: dict[str, tuple[str, str | None]] = {
    "same_facility_hifld": ("same_facility_hifld", "hifld"),
    "same_facility_osm": ("same_facility_osm", "osm"),
    "different_facility": ("different_facility", None),
}


class DecideRequest(BaseModel):
    sub_gid: int
    decision: Literal[
        "same_facility_hifld",
        "same_facility_osm",
        "different_facility",
    ]


def _map_api_decision(decision: str) -> tuple[str, str | None]:
    """Map an API decision to the stored label and name preference."""
    return _API_DECISIONS[decision]


def _pool() -> asyncpg.Pool:
    try:
        return db_module.get_db_pool()
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is not available.",
        ) from exc


def _json(body: dict[str, Any]) -> JSONResponse:
    return JSONResponse(sanitize_for_json(body))


# ---------------------------------------------------------------------------
# Core logic
# ---------------------------------------------------------------------------


async def _retrain(conn: asyncpg.Connection) -> None:
    """Fit the ensemble on every stored decision that still joins."""
    total = int(await conn.fetchval(_COUNT_SQL))
    rows = await conn.fetch(_TRAINING_SQL)
    skipped = total - len(rows)
    if skipped:
        logger.warning(
            "Phase A retrain skipped %d decisions "
            "(un-merged rows no longer joinable)",
            skipped,
        )
    if not rows:
        return
    nlcd_points: list[tuple[Any, Any]] = []
    for row in rows:
        nlcd_points.append((row["hifld_x"], row["hifld_y"]))
        nlcd_points.append((row["osm_cx"], row["osm_cy"]))
    nlcd_codes = await asyncio.to_thread(_nlcd_classes, nlcd_points)
    matrix = np.vstack(
        [
            features_to_array(
                _features_from_row(
                    row, nlcd_codes[i * 2], nlcd_codes[i * 2 + 1],
                )
            )
            for i, row in enumerate(rows)
        ]
    )
    labels = np.array([row["decision"] for row in rows])
    await asyncio.to_thread(ensemble.train, matrix, labels)


async def _stats(conn: asyncpg.Connection) -> dict[str, Any]:
    counts = {name: 0 for name in _DECISIONS}
    for row in await conn.fetch(_COUNT_BY_DECISION_SQL):
        if row["decision"] in counts:
            counts[row["decision"]] = int(row["n"])
    model = ensemble.stats()
    history = model["accuracy_history"]
    remaining = await conn.fetchval(_REMAINING_SQL)
    return {
        "n_decisions": sum(counts.values()),
        "decision_counts": counts,
        "remaining": int(remaining or 0),
        "ready": model["ready"],
        "accuracy": history[-1] if history else None,
        "accuracy_history": history,
        "best_params": model["best_params"],
    }


async def _next_row(conn: asyncpg.Connection) -> dict[str, Any]:
    """One random Tier 2/3 substation, or ``{"done": True}``."""
    row = await conn.fetchrow(_NEXT_SQL)
    if row is None:
        return {"done": True}
    nlcd_codes = await asyncio.to_thread(
        _nlcd_classes,
        [(row["hifld_x"], row["hifld_y"]), (row["osm_cx"], row["osm_cy"])],
    )
    return _substation_payload(row, nlcd_codes[0], nlcd_codes[1])


async def warm_ensemble() -> None:
    """Retrain from stored decisions once, when at least 30 rows exist."""
    global _warmed
    if _warmed:
        return
    async with _lock:
        if _warmed:
            return
        try:
            pool = db_module.get_db_pool()
        except RuntimeError:
            logger.info(
                "Audit ensemble warm skipped: database pool is not initialized",
            )
            return
        try:
            async with pool.acquire() as conn:
                count = int(await conn.fetchval(_COUNT_SQL))
                if count >= AuditEnsemble.MIN_DECISIONS:
                    await _retrain(conn)
        except Exception:
            logger.exception("Audit ensemble warm failed")
            return
        _warmed = True


def _remember_user(request: Request, user: dict) -> None:
    user_id = user.get("sub")
    if user_id:
        request.state.user_id = user_id


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/api/audit/next")
async def audit_next(
    request: Request,
    user: dict = Depends(require_admin),
) -> JSONResponse:
    """Return one unreviewed Tier 2/3 substation, or ``{"done": true}``."""
    _remember_user(request, user)
    await warm_ensemble()
    pool = _pool()
    try:
        async with _lock, pool.acquire() as conn:
            body = await _next_row(conn)
    except HTTPException:
        raise
    except asyncpg.PostgresError:
        logger.exception("GET /api/audit/next failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not load the next mismatch.",
        ) from None
    return _json(body)


@router.post("/api/audit/decide")
async def audit_decide(
    request: Request,
    payload: DecideRequest,
    user: dict = Depends(require_admin),
) -> JSONResponse:
    """Store one decision, optionally rename or un-merge, retrain, return next.

    Both same-facility buttons store ``same_facility``. ``same_facility_osm``
    also copies ``osm_original_name`` onto ``ref.substations.name``.
    ``different_facility`` un-merges: separate ``hifld`` and ``osm`` rows
    replace the merged row, and corridors that referenced the deleted
    ``gid`` have their node pointers nullified.
    """
    global _warmed
    _remember_user(request, user)

    if payload.sub_gid <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="sub_gid must be positive.",
        )

    stored_decision, name_preference = _map_api_decision(payload.decision)

    pool = _pool()
    try:
        async with _lock, pool.acquire() as conn:
            exists = await conn.fetchval(
                _SUBSTATION_EXISTS_SQL, payload.sub_gid,
            )
            if exists is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Substation not found.",
                )

            async with conn.transaction():
                try:
                    await conn.execute(
                        _INSERT_DECISION_SQL,
                        payload.sub_gid,
                        stored_decision,
                        name_preference,
                    )
                except asyncpg.UniqueViolationError as exc:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="This substation is already decided.",
                    ) from exc

                if payload.decision == "same_facility_osm":
                    await conn.execute(
                        _UPDATE_OSM_NAME_SQL, payload.sub_gid,
                    )
                elif stored_decision == "different_facility":
                    await conn.execute(
                        _INSERT_HIFLD_ROW_SQL, payload.sub_gid,
                    )
                    await conn.execute(
                        _INSERT_OSM_ROW_SQL, payload.sub_gid,
                    )
                    await conn.execute(
                        _NULLIFY_NODE_A_SQL, payload.sub_gid,
                    )
                    await conn.execute(
                        _NULLIFY_NODE_B_SQL, payload.sub_gid,
                    )
                    await conn.execute(
                        _DELETE_MERGED_SQL, payload.sub_gid,
                    )

            try:
                await _retrain(conn)
            except Exception:
                _warmed = False
                logger.exception(
                    "Phase A retrain failed after saving a decision",
                )
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Decision saved, but retraining the ensemble failed.",
                ) from None
            _warmed = True
            stats = await _stats(conn)
            nxt = await _next_row(conn)
    except HTTPException:
        raise
    except asyncpg.PostgresError:
        logger.exception("POST /api/audit/decide failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not store the decision.",
        ) from None

    predictions = None if nxt.get("done") else nxt.get("predictions")
    return _json({"stats": stats, "predictions": predictions, "next": nxt})


@router.get("/api/audit/stats")
async def audit_stats(
    request: Request,
    user: dict = Depends(require_admin),
) -> JSONResponse:
    """Decision counts, per-model accuracy, and the accuracy history."""
    _remember_user(request, user)
    await warm_ensemble()
    pool = _pool()
    try:
        async with _lock, pool.acquire() as conn:
            body = await _stats(conn)
    except asyncpg.PostgresError:
        logger.exception("GET /api/audit/stats failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not load audit stats.",
        ) from None
    return _json(body)
