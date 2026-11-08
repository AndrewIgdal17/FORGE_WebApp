import type { MultiLineString } from 'geojson';

import type { CalculateRequest } from './api';
import {
  buildCategoryKey,
  getRowWidthFeet,
  normalizeCT,
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

const TECHNOLOGY_HINT = 'in Project Identity → Technology before drawing a route.';

/** Form labels for the construction-type segment of a category key. */
const CONSTRUCTION_LABEL: Record<string, string> = {
  'Underground direct-buried': 'Underground Direct-Buried',
  'Underground tunnel': 'Underground Tunnel',
};

function englishList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  if (items.length === 2) return `${items[0]} or ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, or ${items[items.length - 1]}`;
}

function englishAnd(items: string[]): string {
  if (items.length <= 1) return items.join('');
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/**
 * Why `resolvedRowWidthFt` returns null for these fields, as a sentence that
 * names the field to set. Returns null when a positive width resolves. The
 * allowed values come from the deployed row-width table, so a value the
 * calculator dropped (for example a removed construction type) is named, not
 * converted.
 */
export function rowWidthProblem(
  fields: ProjectFields,
  lookups: LookupTables,
): string | null {
  if (resolvedRowWidthFt(fields, lookups) !== null) return null;

  const isDc = fields.acDc === 'DC';
  const labels = ['Construction type', 'AC / DC', 'Capacity (MW)', 'Conductor type', 'Converter type'];
  const raw = [
    fields.constructionType,
    fields.acDc,
    fields.capacityMw ? String(fields.capacityMw) : '',
    fields.conductorType,
    isDc ? (fields.converterType ?? '') : 'NA',
  ];
  const wanted = [
    fields.constructionType ? normalizeCT(fields.constructionType) : '',
    fields.acDc,
    fields.capacityMw ? `${String(fields.capacityMw).replace(/\s*MW\s*/i, '')}MW` : '',
    fields.conductorType,
    raw[4],
  ];
  const shown = (index: number, segment: string): string => {
    if (index === 0) return CONSTRUCTION_LABEL[segment] ?? segment;
    if (index === 2) return segment.replace(/MW$/, '');
    return segment;
  };
  const described = (index: number, segment: string): string =>
    index === 2 ? `${shown(index, segment)} MW` : shown(index, segment);

  // Check the filled-in fields against the table in key order before naming
  // blanks: the form blanks a conductor its construction type does not offer,
  // and the construction type is then the field to fix.
  let matching = Object.entries(lookups.rowWidthLookup)
    .filter(([, width]) => typeof width === 'number' && width > 0)
    .map(([category]) => category.split('/'));
  const blank: string[] = [];
  for (let index = 0; index < wanted.length; index += 1) {
    if (!wanted[index]) {
      blank.push(labels[index]);
      continue;
    }
    if (blank.length > 0) continue;
    const next = matching.filter((parts) => parts[index] === wanted[index]);
    if (next.length > 0) {
      matching = next;
      continue;
    }
    const choices: string[] = [];
    for (const parts of matching) {
      const choice = shown(index, parts[index] ?? '');
      if (choice && !choices.includes(choice)) choices.push(choice);
    }
    if (index === 2) choices.sort((a, b) => Number(a) - Number(b));
    const context = wanted
      .slice(0, index)
      .map((segment, at) => described(at, segment))
      .join(' ');
    const forWhat = context ? ` for ${context}` : '';
    const choose = choices.length > 0 ? ` Choose ${englishList(choices)}` : ' Change it';
    return `${labels[index]} '${raw[index]}' has no right-of-way width${forWhat}.${choose} ${TECHNOLOGY_HINT}`;
  }
  if (blank.length > 0) return `Set ${englishAnd(blank)} ${TECHNOLOGY_HINT}`;
  return `The right-of-way width for category '${wanted.join('/')}' is not positive. Change the Technology fields ${TECHNOLOGY_HINT}`;
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
