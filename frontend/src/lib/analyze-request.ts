import type { MultiLineString } from 'geojson';

import {
  buildCategoryKey,
  getRowWidthFeet,
  type LookupTables,
  type ProjectFields,
} from './lookups';

const SUBSEA_TERRAIN_PATH =
  '02_project_physical_details.terrain.terrain_miles.subsea';

const TERRAIN_MILES_PREFIX =
  '02_project_physical_details.terrain.terrain_miles.';

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
  return {
    ...changes,
    [SUBSEA_TERRAIN_PATH]: 0,
  };
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
