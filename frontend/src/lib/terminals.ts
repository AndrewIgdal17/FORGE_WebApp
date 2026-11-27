import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import type { MultiLineString, MultiPolygon, Polygon, Position } from 'geojson';

/** Same sphere, tolerance, and footprint cap as `app/terminals.py`. */
export const TERMINAL_TOLERANCE_M = 100;
export const TERMINAL_FOOTPRINT_MAX_M = 1000;

export type TerminalFootprints = {
  sending: Polygon | MultiPolygon | null;
  receiving: Polygon | MultiPolygon | null;
};

const EARTH_RADIUS_M = 6_371_008.8;

export type RouteEnds =
  | { ok: true }
  | { ok: false; end: 'sending' | 'receiving'; distanceM: number };

export function haversineM(a: [number, number], b: [number, number]): number {
  const lon1 = (a[0] * Math.PI) / 180;
  const lat1 = (a[1] * Math.PI) / 180;
  const lon2 = (b[0] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const dlat = lat2 - lat1;
  const dlon = lon2 - lon1;
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dlon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

function pair(position: Position | undefined): [number, number] | null {
  if (!position || position.length < 2) return null;
  const lon = position[0];
  const lat = position[1];
  if (typeof lon !== 'number' || typeof lat !== 'number') return null;
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  return [lon, lat];
}

/**
 * Same rule as the server: an end passes within 100 m, or inside that end's
 * footprint and within 1 km. Sending is checked first. No footprints means
 * the 100 m test only. A missing endpoint is not a distance of zero.
 */
export function routeEndsMatch(
  route: MultiLineString,
  sending: [number, number],
  receiving: [number, number],
  footprints?: TerminalFootprints,
): RouteEnds {
  const lines = route.coordinates;
  const first = pair(lines[0]?.[0]);
  if (!first) {
    return { ok: false, end: 'sending', distanceM: Number.POSITIVE_INFINITY };
  }
  const lastLine = lines[lines.length - 1];
  const last = pair(lastLine?.[lastLine.length - 1]);
  const sendingDistance = haversineM(first, sending);
  if (!endReaches(sendingDistance, first, footprints?.sending)) {
    return { ok: false, end: 'sending', distanceM: sendingDistance };
  }
  if (!last) {
    return { ok: false, end: 'receiving', distanceM: Number.POSITIVE_INFINITY };
  }
  const receivingDistance = haversineM(last, receiving);
  if (!endReaches(receivingDistance, last, footprints?.receiving)) {
    return { ok: false, end: 'receiving', distanceM: receivingDistance };
  }
  return { ok: true };
}

function endReaches(
  distanceM: number,
  point: [number, number],
  footprint: Polygon | MultiPolygon | null | undefined,
): boolean {
  if (distanceM <= TERMINAL_TOLERANCE_M) return true;
  if (!footprint || distanceM > TERMINAL_FOOTPRINT_MAX_M) return false;
  try {
    return booleanPointInPolygon(point, footprint);
  } catch {
    return false;
  }
}

/** Python `format(distance, '.0f')`: round half to even. */
function formatDistanceM(distanceM: number): string {
  if (!Number.isFinite(distanceM)) return 'inf';
  const sign = distanceM < 0 ? -1 : 1;
  const abs = Math.abs(distanceM);
  const floor = Math.floor(abs);
  const fraction = abs - floor;
  let rounded = floor;
  if (fraction > 0.5) rounded = floor + 1;
  else if (fraction === 0.5) rounded = floor % 2 === 0 ? floor : floor + 1;
  return String(sign * rounded);
}

export function routeFinishMessage(end: 'sending' | 'receiving', distanceM: number): string {
  return (
    `The route's ${end} end is ${formatDistanceM(distanceM)} m ` +
    `from the project's ${end} terminal; it must be within 100 m, ` +
    `or inside the substation's footprint and within 1 km.`
  );
}

/** Point terminal name: latitude, then longitude, four decimals. Matches the API. */
export function pointTerminalName(point: [number, number]): string {
  const [lon, lat] = point;
  return `Point at ${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}
