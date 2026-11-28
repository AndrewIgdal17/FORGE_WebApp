import pointToPolygonDistance from '@turf/point-to-polygon-distance';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';

/** NERC regions in the server's order (app/regions.py). */
export const REGION_CODES = ['WECC', 'TRE', 'MRO', 'NPCC', 'RF', 'SERC'] as const;

export type RegionCode = (typeof REGION_CODES)[number];

export const REGION_NAMES: Record<RegionCode, string> = {
  WECC: 'WECC',
  TRE: 'Texas RE',
  MRO: 'MRO',
  NPCC: 'NPCC',
  RF: 'ReliabilityFirst',
  SERC: 'SERC',
};

/** Display name for a code; falls back to the code itself for unknown codes. */
export function regionName(code: string): string {
  return REGION_NAMES[code as RegionCode] ?? code;
}

/** A terminal must lie this close (metres) to the union of the ticked regions. */
export const REGION_TOLERANCE_M = 25000;
/** The suggestion is the nearest unticked region within this distance (metres). */
export const REGION_SUGGEST_MAX_M = 100000;

export interface RegionShape {
  code: string;
  geometry: Polygon | MultiPolygon;
}

export type TerminalRegionResult = { ok: true } | { ok: false; suggested: string | null };

/** Unique codes in REGION_CODES order. Codes that are not NERC regions are dropped. */
export function sortRegions(codes: readonly string[]): string[] {
  const wanted = new Set(codes);
  return REGION_CODES.filter((code) => wanted.has(code));
}

/** Shapes from the GET /api/nerc-regions FeatureCollection. */
export function regionShapes(
  collection: FeatureCollection<Polygon | MultiPolygon, { code: string; name: string }>,
): RegionShape[] {
  return collection.features.map((feature) => ({
    code: feature.properties.code,
    geometry: feature.geometry,
  }));
}

/** Metres from the point to the shape; 0 or less when the point is inside. */
function distanceM(point: [number, number], shape: RegionShape): number {
  return pointToPolygonDistance(point, shape.geometry, { units: 'meters', method: 'geodesic' });
}

/**
 * The 25 km rule from the server. Inside or within REGION_TOLERANCE_M of a
 * ticked region passes. Otherwise the suggestion is the nearest unticked
 * region within REGION_SUGGEST_MAX_M, or null.
 */
export function terminalRegionCheck(
  point: [number, number],
  regions: readonly string[],
  shapes: readonly RegionShape[],
): TerminalRegionResult {
  const ticked = new Set(regions);
  let nearestTicked = Infinity;
  for (const shape of shapes) {
    if (!ticked.has(shape.code)) continue;
    nearestTicked = Math.min(nearestTicked, distanceM(point, shape));
  }
  if (nearestTicked <= REGION_TOLERANCE_M) return { ok: true };

  let suggested: string | null = null;
  let suggestedM = Infinity;
  for (const shape of shapes) {
    if (ticked.has(shape.code)) continue;
    const d = Math.max(0, distanceM(point, shape));
    if (d <= REGION_SUGGEST_MAX_M && d < suggestedM) {
      suggested = shape.code;
      suggestedM = d;
    }
  }
  return { ok: false, suggested };
}

/** Why a draft cannot be created yet, or null. The server rejects a project with no regions. */
export function createBlockedReason(nercRegions: readonly string[]): string | null {
  return nercRegions.length === 0
    ? 'Pick at least one NERC region (use Add on the terminal warning)'
    : null;
}
