"""Admin-only substation-name audit API.

Three routes, all gated to one operator email:

- ``GET /api/audit/next`` — one unreviewed mismatch, plus ensemble predictions
- ``POST /api/audit/decide`` — store a decision and retrain
- ``GET /api/audit/stats`` — decision counts and accuracy history

The ensemble lives on this module. The first request, and startup when the
database pool is already open, retrain from ``ref.audit_decisions`` once that
table has at least 30 rows. Writes use the API pool (``forge_api``), which
has ``SELECT`` and ``INSERT`` on ``ref.audit_decisions``.
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
from .audit_features import compute_features, features_to_array
from .audit_models import AuditEnsemble
from .models import sanitize_for_json
from .route import _nlcd_lock, _open_nlcd, _pixel_code

logger = logging.getLogger(__name__)

router = APIRouter()

ADMIN_EMAIL = "andrewigdal17@gmail.com"
_DECISIONS = ("accept", "keep", "skip")
_bearer = HTTPBearer(auto_error=False)

ensemble = AuditEnsemble()
_lock = asyncio.Lock()
_warmed = False

# Census state FIPS (TIGER ``statefp``) to the postal code stored on
# ``ref.substations.state``.
_FIPS_TO_STATE = {
    "01": "AL",
    "02": "AK",
    "04": "AZ",
    "05": "AR",
    "06": "CA",
    "08": "CO",
    "09": "CT",
    "10": "DE",
    "11": "DC",
    "12": "FL",
    "13": "GA",
    "15": "HI",
    "16": "ID",
    "17": "IL",
    "18": "IN",
    "19": "IA",
    "20": "KS",
    "21": "KY",
    "22": "LA",
    "23": "ME",
    "24": "MD",
    "25": "MA",
    "26": "MI",
    "27": "MN",
    "28": "MS",
    "29": "MO",
    "30": "MT",
    "31": "NE",
    "32": "NV",
    "33": "NH",
    "34": "NJ",
    "35": "NM",
    "36": "NY",
    "37": "NC",
    "38": "ND",
    "39": "OH",
    "40": "OK",
    "41": "OR",
    "42": "PA",
    "44": "RI",
    "45": "SC",
    "46": "SD",
    "47": "TN",
    "48": "TX",
    "49": "UT",
    "50": "VT",
    "51": "VA",
    "53": "WA",
    "54": "WV",
    "55": "WI",
    "56": "WY",
    "60": "AS",
    "66": "GU",
    "69": "MP",
    "72": "PR",
    "78": "VI",
}

# One unreviewed endpoint per corridor. Endpoint A is served before B when
# both ends are still mismatches. The substation join drops rows whose node
# id does not resolve. GeoJSON is computed only for the picked row.
_CANDIDATE_CTES = """
candidates AS (
    SELECT c.gid,
           CASE WHEN c.sub_1_flag = 'mismatch' AND NOT EXISTS (
               SELECT 1 FROM ref.audit_decisions d
               WHERE d.corridor_gid = c.gid AND d.endpoint = 'a'
           ) THEN 'a'
           WHEN c.sub_2_flag = 'mismatch' AND NOT EXISTS (
               SELECT 1 FROM ref.audit_decisions d
               WHERE d.corridor_gid = c.gid AND d.endpoint = 'b'
           ) THEN 'b'
           END AS endpoint
    FROM ref.corridors c
    WHERE c.sub_1_flag = 'mismatch' OR c.sub_2_flag = 'mismatch'
),
eligible AS (
    SELECT cand.gid, cand.endpoint
    FROM candidates cand
    JOIN ref.corridors c ON c.gid = cand.gid
    JOIN ref.substations s
      ON s.gid = CASE WHEN cand.endpoint = 'a' THEN c.node_a ELSE c.node_b END
    WHERE cand.endpoint IS NOT NULL
)
"""

_NEXT_SQL = f"""
WITH {_CANDIDATE_CTES},
picked AS (
    SELECT gid, endpoint
    FROM eligible
    ORDER BY random()
    LIMIT 1
)
SELECT c.gid,
       p.endpoint,
       c.volt_class,
       c.voltage_kv,
       c.source,
       CASE WHEN p.endpoint = 'a' THEN c.sub_1 ELSE c.sub_2 END AS hifld_name,
       s.gid AS sub_gid,
       s.name AS matched_name,
       s.voltage_kv AS sub_voltage_kv,
       s.state AS sub_state,
       s.hifld_type,
       ST_AsGeoJSON(ST_Transform(c.geom, 4326)) AS corridor_geojson,
       ST_AsGeoJSON(ST_Transform(s.geom, 4326)) AS sub_geojson,
       ST_AsGeoJSON(ST_Transform(ep.geom, 4326)) AS endpoint_geojson,
       ST_Distance(ep.geom, s.geom) AS distance_m,
       ST_Length(c.geom) / 1609.344 AS corridor_miles,
       CASE
           WHEN ST_GeometryType(s.geom) LIKE '%Polygon%'
            AND ST_Within(ep.geom, s.geom) THEN 1
           ELSE 2
       END AS match_tier,
       (
           SELECT ct.statefp
           FROM ref.counties_tiger ct
           WHERE ST_Intersects(ct.geom, ep.geom)
           LIMIT 1
       ) AS corridor_statefp,
       ST_Area(s.geom) AS sub_area_sqm,
       (
           SELECT count(*)
           FROM ref.corridors
           WHERE node_a = s.gid OR node_b = s.gid
       ) AS corridor_degree,
       ST_X(ep.geom) AS endpoint_x,
       ST_Y(ep.geom) AS endpoint_y
FROM picked p
JOIN ref.corridors c ON c.gid = p.gid
JOIN ref.substations s
  ON s.gid = CASE WHEN p.endpoint = 'a' THEN c.node_a ELSE c.node_b END
JOIN LATERAL (
    SELECT CASE WHEN p.endpoint = 'a'
                THEN ST_StartPoint(ST_GeometryN(c.geom, 1))
                ELSE ST_EndPoint(ST_GeometryN(c.geom, ST_NumGeometries(c.geom)))
           END AS geom
) ep ON true
"""

_REMAINING_SQL = f"""
WITH {_CANDIDATE_CTES}
SELECT count(*)::int FROM eligible
"""

_TRAINING_SQL = """
SELECT d.decision,
       CASE WHEN d.endpoint = 'a' THEN c.sub_1 ELSE c.sub_2 END AS hifld_name,
       s.name AS matched_name,
       s.hifld_type,
       c.voltage_kv,
       s.voltage_kv AS sub_voltage_kv,
       c.source,
       s.state AS sub_state,
       ST_Distance(ep.geom, s.geom) AS distance_m,
       ST_Length(c.geom) / 1609.344 AS corridor_miles,
       CASE
           WHEN ST_GeometryType(s.geom) LIKE '%Polygon%'
            AND ST_Within(ep.geom, s.geom) THEN 1
           ELSE 2
       END AS match_tier,
       (
           SELECT ct.statefp
           FROM ref.counties_tiger ct
           WHERE ST_Intersects(ct.geom, ep.geom)
           LIMIT 1
       ) AS corridor_statefp,
       ST_Area(s.geom) AS sub_area_sqm,
       (
           SELECT count(*)
           FROM ref.corridors
           WHERE node_a = s.gid OR node_b = s.gid
       ) AS corridor_degree,
       ST_X(ep.geom) AS endpoint_x,
       ST_Y(ep.geom) AS endpoint_y
FROM ref.audit_decisions d
JOIN ref.corridors c ON c.gid = d.corridor_gid
JOIN ref.substations s
  ON s.gid = CASE WHEN d.endpoint = 'a' THEN c.node_a ELSE c.node_b END
JOIN LATERAL (
    SELECT CASE WHEN d.endpoint = 'a'
                THEN ST_StartPoint(ST_GeometryN(c.geom, 1))
                ELSE ST_EndPoint(ST_GeometryN(c.geom, ST_NumGeometries(c.geom)))
           END AS geom
) ep ON true
ORDER BY d.id
"""

_LOOKUP_SQL = """
SELECT CASE WHEN $2 = 'a' THEN c.sub_1 ELSE c.sub_2 END AS hifld_name,
       s.name AS matched_name,
       s.gid AS matched_sub_gid
FROM ref.corridors c
JOIN ref.substations s
  ON s.gid = CASE WHEN $2 = 'a' THEN c.node_a ELSE c.node_b END
WHERE c.gid = $1
"""

_INSERT_SQL = """
INSERT INTO ref.audit_decisions
    (corridor_gid, endpoint, hifld_name, matched_name, matched_sub_gid, decision)
VALUES ($1, $2, $3, $4, $5, $6)
"""

_COUNT_SQL = "SELECT count(*)::int FROM ref.audit_decisions"

_COUNT_BY_DECISION_SQL = """
SELECT decision, count(*)::int AS n
FROM ref.audit_decisions
GROUP BY decision
"""


class DecideRequest(BaseModel):
    corridor_gid: int
    endpoint: Literal["a", "b"]
    decision: Literal["accept", "keep", "skip"]


def _voltage_tier(kv: float) -> str:
    if kv >= 345:
        return "ehv"
    if kv >= 100:
        return "hv"
    return "sub"


def _voltage_match(corridor_kv: Any, sub_kv: Any) -> float:
    """1 when the kV values match, 0.5 on the same enrich tier, else 0."""
    if corridor_kv is None or sub_kv is None:
        return 0.0
    try:
        corridor = float(corridor_kv)
        sub = float(sub_kv)
    except (TypeError, ValueError):
        return 0.0
    if corridor == sub:
        return 1.0
    if _voltage_tier(corridor) == _voltage_tier(sub):
        return 0.5
    return 0.0


def _state_match(statefp: Any, sub_state: Any) -> bool:
    """True when the endpoint's county state is the substation's state."""
    if statefp is None or sub_state is None:
        return False
    code = _FIPS_TO_STATE.get(str(statefp).zfill(2))
    if code is None:
        return False
    return code == str(sub_state).strip().upper()


# Set after the NLCD COG is missing or rasterio is not installed, so later
# decisions do not reopen a file that is not there.
_nlcd_unavailable = False


def _nlcd_classes(points: list[tuple[Any, Any]]) -> list[float]:
    """NLCD class codes at EPSG:5070 coordinates. Missing samples are 0."""
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


def _features_from_row(row: Any, nlcd_class: float) -> dict[str, float]:
    voltage = row["voltage_kv"]
    return compute_features(
        hifld_name=row["hifld_name"],
        matched_name=row["matched_name"],
        distance_m=float(row["distance_m"] or 0.0),
        match_tier=int(row["match_tier"]),
        voltage_match=_voltage_match(voltage, row["sub_voltage_kv"]),
        corridor_miles=float(row["corridor_miles"] or 0.0),
        corridor_voltage_kv=None if voltage is None else float(voltage),
        hifld_type=row["hifld_type"],
        corridor_source=row["source"] or "",
        state_match=_state_match(row["corridor_statefp"], row["sub_state"]),
        sub_area_sqm=row["sub_area_sqm"],
        corridor_degree=row["corridor_degree"],
        nlcd_class=nlcd_class,
    )


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


def _mismatch_payload(row: Any, nlcd_class: float) -> dict[str, Any]:
    features = _features_from_row(row, nlcd_class)
    voltage = row["voltage_kv"]
    return {
        "done": False,
        "corridor_gid": int(row["gid"]),
        "endpoint": row["endpoint"],
        "volt_class": row["volt_class"],
        "voltage_kv": None if voltage is None else int(voltage),
        "source": row["source"],
        "hifld_name": row["hifld_name"],
        "sub_gid": int(row["sub_gid"]),
        "matched_name": row["matched_name"],
        "sub_voltage_kv": _optional_number(row["sub_voltage_kv"]),
        "sub_state": row["sub_state"],
        "hifld_type": row["hifld_type"],
        "distance_m": float(row["distance_m"] or 0.0),
        "corridor_miles": float(row["corridor_miles"] or 0.0),
        "match_tier": int(row["match_tier"]),
        "voltage_match": features["voltage_match"],
        "state_match": bool(features["state_match"]),
        "corridor_geojson": _geojson(row["corridor_geojson"]),
        "sub_geojson": _geojson(row["sub_geojson"]),
        "endpoint_geojson": _geojson(row["endpoint_geojson"]),
        "predictions": ensemble.predict(features_to_array(features)),
    }


async def _email_from_token(user: dict) -> str:
    """Operator email from the JWT, then ``auth.users`` if the claim is absent."""
    for claim in (user.get("email"), (user.get("user_metadata") or {}).get("email")):
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


async def _retrain(conn: asyncpg.Connection) -> None:
    """Fit the ensemble on every stored decision that still joins."""
    total = int(await conn.fetchval(_COUNT_SQL))
    rows = await conn.fetch(_TRAINING_SQL)
    skipped = total - len(rows)
    if skipped:
        logger.warning(
            "Audit retrain skipped %s decisions with no corridor/substation join",
            skipped,
        )
    if not rows:
        return
    classes = await asyncio.to_thread(
        _nlcd_classes,
        [(row["endpoint_x"], row["endpoint_y"]) for row in rows],
    )
    matrix = np.vstack(
        [
            features_to_array(_features_from_row(row, classes[index]))
            for index, row in enumerate(rows)
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
    row = await conn.fetchrow(_NEXT_SQL)
    if row is None:
        return {"done": True}
    classes = await asyncio.to_thread(
        _nlcd_classes, [(row["endpoint_x"], row["endpoint_y"])]
    )
    return _mismatch_payload(row, classes[0])


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
            logger.info("Audit ensemble warm skipped: database pool is not initialized")
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


@router.get("/api/audit/next")
async def audit_next(
    request: Request,
    user: dict = Depends(require_admin),
) -> JSONResponse:
    """Return one random unreviewed mismatch, or ``{"done": true}``."""
    _remember_user(request, user)
    await warm_ensemble()
    pool = _pool()
    try:
        async with _lock, pool.acquire() as conn:
            body = await _next_row(conn)
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
    """Store one decision, retrain, and return stats plus the next mismatch."""
    global _warmed
    _remember_user(request, user)
    pool = _pool()
    try:
        async with _lock, pool.acquire() as conn:
            linked = await conn.fetchrow(
                _LOOKUP_SQL, payload.corridor_gid, payload.endpoint
            )
            if linked is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Corridor endpoint not found.",
                )
            try:
                await conn.execute(
                    _INSERT_SQL,
                    payload.corridor_gid,
                    payload.endpoint,
                    linked["hifld_name"],
                    linked["matched_name"],
                    linked["matched_sub_gid"],
                    payload.decision,
                )
            except asyncpg.UniqueViolationError as exc:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="This corridor endpoint is already decided.",
                ) from exc
            try:
                await _retrain(conn)
            except Exception:
                _warmed = False
                logger.exception("Audit retrain failed after saving a decision")
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
