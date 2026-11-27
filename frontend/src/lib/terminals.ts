import type { MultiLineString, Position } from 'geojson';

/** Same sphere and tolerance as `app/terminals.py`. */
export const TERMINAL_TOLERANCE_M = 100;

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
 * Same rule as the server: sending end first, then receiving.
 * A missing endpoint is not a distance of zero.
 */
export function routeEndsMatch(
  route: MultiLineString,
  sending: [number, number],
  receiving: [number, number],
): RouteEnds {
  const lines = route.coordinates;
  const first = pair(lines[0]?.[0]);
  if (!first) {
    return { ok: false, end: 'sending', distanceM: Number.POSITIVE_INFINITY };
  }
  const lastLine = lines[lines.length - 1];
  const last = pair(lastLine?.[lastLine.length - 1]);
  const sendingDistance = haversineM(first, sending);
  if (sendingDistance > TERMINAL_TOLERANCE_M) {
    return { ok: false, end: 'sending', distanceM: sendingDistance };
  }
  if (!last) {
    return { ok: false, end: 'receiving', distanceM: Number.POSITIVE_INFINITY };
  }
  const receivingDistance = haversineM(last, receiving);
  if (receivingDistance > TERMINAL_TOLERANCE_M) {
    return { ok: false, end: 'receiving', distanceM: receivingDistance };
  }
  return { ok: true };
}

export function routeFinishMessage(end: 'sending' | 'receiving', terminalName: string): string {
  return `The route's ${end} end must finish within 100 m of ${terminalName}.`;
}

/** Point terminal name: latitude, then longitude, four decimals. Matches the API. */
export function pointTerminalName(point: [number, number]): string {
  const [lon, lat] = point;
  return `Point at ${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}
