import type { MultiLineString, Position } from 'geojson';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isStoredRoute(value: unknown): value is MultiLineString {
  return typeof value !== 'string' && isRecord(value) && value.type === 'MultiLineString';
}

/** A GeoJSON MultiLineString object. Strings are never parsed. */
export function asRoute(value: unknown): MultiLineString | null {
  return isStoredRoute(value) ? value : null;
}

export function isMultiLineString(value: unknown): value is MultiLineString {
  if (!isRecord(value) || value.type !== 'MultiLineString' || !Array.isArray(value.coordinates)) {
    return false;
  }
  return value.coordinates.every(
    (line) => Array.isArray(line) && line.length >= 2 && line.every(isPosition),
  );
}

function isPosition(value: unknown): value is Position {
  return Array.isArray(value) && value.length >= 2 && value.every((item) => typeof item === 'number');
}

function linePositions(geometry: unknown): Position[] | null {
  if (!isRecord(geometry) || geometry.type !== 'LineString' || !Array.isArray(geometry.coordinates)) {
    return null;
  }
  const line = geometry.coordinates.filter(isPosition);
  return line.length >= 2 ? line : null;
}

/** Rebuild a MultiLineString from stored segment LineStrings. */
export function routeFromSegments(segments: unknown[] | null): MultiLineString | null {
  if (!segments) return null;
  const coordinates: Position[][] = [];
  for (const segment of segments) {
    if (!isRecord(segment)) continue;
    const line = linePositions(segment.geometry);
    if (line) coordinates.push(line);
  }
  if (coordinates.length === 0) return null;
  return { type: 'MultiLineString', coordinates };
}

export function scenarioMapRoute(
  scenario: {
    route?: unknown;
    route_geojson?: unknown;
    segments?: unknown[] | null;
  } | null,
): MultiLineString | null {
  if (!scenario) return null;
  if (scenario.route_geojson != null) return asRoute(scenario.route_geojson);
  if (scenario.route_geojson === undefined && isMultiLineString(scenario.route)) {
    return scenario.route;
  }
  return routeFromSegments(scenario.segments ?? null);
}
