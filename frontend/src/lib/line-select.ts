import { create } from 'zustand';
import type { AssemblePrefill } from '@/lib/api';

export const OLD_AC_DC_PATH = '01_project_technical_details.project.old_ac_dc';
export const OLD_CAPACITY_PATH = '01_project_technical_details.project.old_capacity_mw';
export const OLD_CONDUCTOR_PATH = '01_project_technical_details.project.old_conductor_type';

const PREFILL_KEYS: { key: keyof AssemblePrefill; path: string }[] = [
  { key: 'old_ac_dc', path: OLD_AC_DC_PATH },
  { key: 'old_capacity_mw', path: OLD_CAPACITY_PATH },
  { key: 'old_conductor_type', path: OLD_CONDUCTOR_PATH },
];

export type CorridorCandidate = {
  gid: number;
  voltage_kv: number | null;
  sub_1: string | null;
  sub_2: string | null;
  source: string;
  circuits: number | null;
};

export function toggleGid(selected: number[], gid: number): number[] {
  const index = selected.indexOf(gid);
  if (index >= 0) {
    return [...selected.slice(0, index), ...selected.slice(index + 1)];
  }
  return [...selected, gid];
}

export function overlappingCandidates<T extends { gid: number }>(features: T[]): T[] {
  const seen = new Set<number>();
  const out: T[] = [];
  for (const feature of features) {
    if (seen.has(feature.gid)) continue;
    seen.add(feature.gid);
    out.push(feature);
  }
  return out;
}

function connectorPhrase(connectors: ReadonlyArray<{ length_m: number }>): string {
  if (connectors.length === 0) return 'no connectors';
  const parts = connectors.map((connector) => `${Math.round(connector.length_m)} m`);
  if (parts.length === 1) return `connector ${parts[0]}`;
  const last = parts[parts.length - 1] ?? '';
  const rest = parts.slice(0, -1).join(', ');
  return `connectors ${rest} and ${last}`;
}

export function selectionSummary(
  pieces: ReadonlyArray<{ miles: number }>,
  connectors: ReadonlyArray<{ length_m: number }>,
): string {
  const totalMi = pieces.reduce((sum, piece) => sum + piece.miles, 0);
  const mi = totalMi.toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const pieceLabel = pieces.length === 1 ? 'piece' : 'pieces';
  return `From line data: ${pieces.length} ${pieceLabel}, ${mi} mi, ${connectorPhrase(connectors)}`;
}

/** MapLibre filter for the hover highlight overlay; `null` hides every feature. */
export function hoverCorridorGidFilter(gid: number | null): ['==', ['get', 'gid'], number] {
  return ['==', ['get', 'gid'], gid ?? -1];
}

function isEmptyFieldValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  return false;
}

/** Returns form paths and values to set for empty old-line fields only. */
export function prefillChanges(
  current: Record<string, unknown>,
  prefill: AssemblePrefill,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const { key, path } of PREFILL_KEYS) {
    const next = prefill[key];
    if (next === undefined) continue;
    if (!isEmptyFieldValue(current[path])) continue;
    out[path] = next;
  }
  return out;
}

function squaredDistance(a: [number, number], b: [number, number]): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

/** Nearest point on a polyline (EPSG:4326 coordinates). */
export function nearestPointOnLine(
  point: [number, number],
  coords: ReadonlyArray<[number, number]>,
): [number, number] {
  if (coords.length === 0) return point;
  if (coords.length === 1) return [coords[0]![0], coords[0]![1]];

  let best = coords[0]!;
  let bestDist = squaredDistance(point, best);

  for (let index = 0; index < coords.length - 1; index += 1) {
    const start = coords[index]!;
    const end = coords[index + 1]!;
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const lengthSq = dx * dx + dy * dy;
    let projection: [number, number];
    if (lengthSq === 0) {
      projection = [start[0], start[1]];
    } else {
      const t = Math.max(
        0,
        Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSq),
      );
      projection = [start[0] + t * dx, start[1] + t * dy];
    }
    const dist = squaredDistance(point, projection);
    if (dist < bestDist) {
      bestDist = dist;
      best = projection;
    }
  }
  return [best[0], best[1]];
}

export function stretchTerminalName(voltage: number | null): string {
  if (voltage === null || !Number.isFinite(voltage)) return 'Point on line';
  return `Point on ${Math.round(voltage).toLocaleString('en-US')} kV line`;
}

export function missingLineSelectionGids(
  storedGids: ReadonlyArray<number>,
  loadedGids: ReadonlySet<number>,
): number[] {
  return storedGids.filter((gid) => !loadedGids.has(gid));
}

/** True when every vertex of the route lies inside the map viewport. */
export function routeFullyInMapView(
  route: { coordinates: ReadonlyArray<ReadonlyArray<readonly number[]>> } | null | undefined,
  contains: (lonLat: [number, number]) => boolean,
): boolean {
  if (!route?.coordinates.length) return false;
  let seen = 0;
  for (const line of route.coordinates) {
    for (const pair of line) {
      if (pair.length < 2) continue;
      const lon = pair[0];
      const lat = pair[1];
      if (typeof lon !== 'number' || typeof lat !== 'number') continue;
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
      seen += 1;
      if (!contains([lon, lat])) return false;
    }
  }
  return seen > 0;
}

/**
 * Best-effort stale notice: when the full route is in view, corridor features
 * have rendered in the view, and a stored gid is absent from those features.
 */
export function lineSelectionStaleInView(
  storedGids: ReadonlyArray<number>,
  renderedGids: ReadonlySet<number>,
  routeFullyInView: boolean,
  corridorsLoadedInView: boolean,
): boolean {
  if (!routeFullyInView || storedGids.length === 0) return false;
  if (!corridorsLoadedInView) return false;
  return storedGids.some((gid) => !renderedGids.has(gid));
}

export function coordsFromLineGeometry(
  geometry: GeoJSON.Geometry | undefined,
): [number, number][] {
  if (!geometry) return [];
  if (geometry.type === 'LineString') {
    return geometry.coordinates.map((pair) => [pair[0]!, pair[1]!] as [number, number]);
  }
  if (geometry.type === 'MultiLineString') {
    return geometry.coordinates.flatMap((line) =>
      line.map((pair) => [pair[0]!, pair[1]!] as [number, number]),
    );
  }
  return [];
}

interface LineDataPrefillState {
  paths: Set<string>;
  markPaths: (paths: string[]) => void;
  clearPath: (path: string) => void;
  reset: () => void;
}

export const useLineDataPrefill = create<LineDataPrefillState>((set) => ({
  paths: new Set(),
  markPaths: (paths) => {
    set((state) => {
      const next = new Set(state.paths);
      for (const path of paths) next.add(path);
      return { paths: next };
    });
  },
  clearPath: (path) => {
    set((state) => {
      if (!state.paths.has(path)) return state;
      const next = new Set(state.paths);
      next.delete(path);
      return { paths: next };
    });
  },
  reset: () => set({ paths: new Set() }),
}));

export function lineSelectTooltip(candidate: CorridorCandidate): string {
  const voltage =
    candidate.voltage_kv !== null
      ? `${Math.round(candidate.voltage_kv).toLocaleString('en-US')} kV`
      : '— kV';
  const ends =
    candidate.sub_1 && candidate.sub_2
      ? `${candidate.sub_1} – ${candidate.sub_2}`
      : candidate.sub_1 || candidate.sub_2 || '—';
  const source = candidate.source || '—';
  return `${voltage} · ${ends} · ${source}`;
}