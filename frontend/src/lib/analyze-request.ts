import type { MultiLineString } from 'geojson';

import type { CalculateRequest } from './api';
import {
  buildCategoryKey,
  getRowWidthFeet,
  type LookupTables,
  type ProjectFields,
} from './lookups';

const TERRAIN_MILES_PREFIX =
  '02_project_physical_details.terrain.terrain_miles.';

/** Route-derived terrain totals match the route length inside this tolerance. */
export const ROUTE_MILES_TOLERANCE = 1e-6;

export function resolvedRowWidthFt(
  fields: ProjectFields,
  lookups: LookupTables,
): number | null {
  const key = buildCategoryKey(fields);
  if (!key) return null;
  const width = getRowWidthFeet(lookups, key);
  if (width === null || width <= 0) return null;
  return width;
}

export function calculateRequestBody(
  defaultsId: string,
  changes: Record<string, unknown>,
  route: MultiLineString,
  rowWidthFt: number,
  scenarioId?: string,
): CalculateRequest {
  if (!(rowWidthFt > 0)) {
    throw new Error('row_width_ft must be a positive number');
  }
  return {
    defaults_id: defaultsId,
    changes,
    route,
    row_width_ft: rowWidthFt,
    scenario_id: scenarioId,
  };
}

export function analyzeRequestBody(
  route: MultiLineString,
  rowWidthFt: number,
): { route: MultiLineString; row_width_ft: number } {
  if (!(rowWidthFt > 0)) {
    throw new Error('row_width_ft must be a positive number');
  }
  return { route, row_width_ft: rowWidthFt };
}

export function changesAfterAnalyze(
  changes: Record<string, unknown>,
): Record<string, unknown> {
  return changes;
}

export function terrainMatchesRouteLength(
  terrainMiles: number,
  routeMiles: number,
): boolean {
  return Math.abs(terrainMiles - routeMiles) <= ROUTE_MILES_TOLERANCE;
}

export function submittedTerrainMiles(
  prior: Record<string, number>,
  appliedChanges: Record<string, unknown>,
): number {
  const merged: Record<string, number> = { ...prior };
  for (const [path, value] of Object.entries(appliedChanges)) {
    if (!path.startsWith(TERRAIN_MILES_PREFIX)) continue;
    if (typeof value !== 'number') continue;
    const key = path.slice(TERRAIN_MILES_PREFIX.length);
    merged[key] = value;
  }
  return Object.values(merged).reduce((sum, miles) => sum + miles, 0);
}
