import { getValueAtPath } from '@/lib/path';
import { scenarioMapRoute } from '@/lib/route-geometry';
import type { Scenario } from '@/stores/scenario-store';

export interface ChangedInputRow {
  path: string;
  label: string;
  /** Resolved leaf value for each scenario id. A missing change is the template default. */
  values: Record<string, unknown>;
  differsFromBase: Record<string, boolean>;
}

const ROUTE_MILES_PATH = 'technical_parameters.line_length_miles';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function collectLeaves(
  node: unknown,
  prefix: string,
  out: Array<{ path: string; value: unknown }>,
): void {
  if (isPlainObject(node)) {
    for (const key of Object.keys(node)) {
      const path = prefix ? `${prefix}.${key}` : key;
      collectLeaves(node[key], path, out);
    }
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((child, index) => {
      collectLeaves(child, `${prefix}[${index}]`, out);
    });
    return;
  }
  if (prefix) out.push({ path: prefix, value: node });
}

function sameLeaf(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

/** A missing change is the template value. A stored change is never treated as zero. */
function resolved(
  changes: Record<string, unknown>,
  path: string,
  fallback: unknown,
): unknown {
  if (Object.prototype.hasOwnProperty.call(changes, path)) return changes[path];
  return fallback;
}

export function changedInputs(
  scenarios: Scenario[],
  baseId: string,
  labelFor: (path: string) => string,
  showAll: boolean,
  defaults: Record<string, unknown>,
): ChangedInputRow[] {
  const base = scenarios.find((scenario) => scenario.id === baseId);
  if (!base) return [];
  const leaves: Array<{ path: string; value: unknown }> = [];
  collectLeaves(defaults, '', leaves);
  const rows: ChangedInputRow[] = [];
  for (const leaf of leaves) {
    const baseValue = resolved(base.changes, leaf.path, leaf.value);
    const values: Record<string, unknown> = {};
    const differsFromBase: Record<string, boolean> = {};
    let anyDiffers = false;
    for (const scenario of scenarios) {
      const value = resolved(scenario.changes, leaf.path, leaf.value);
      values[scenario.id] = value;
      const differs = scenario.id !== baseId && !sameLeaf(value, baseValue);
      differsFromBase[scenario.id] = differs;
      if (differs) anyDiffers = true;
    }
    differsFromBase[baseId] = false;
    if (showAll || anyDiffers) {
      rows.push({
        path: leaf.path,
        label: labelFor(leaf.path),
        values,
        differsFromBase,
      });
    }
  }
  return rows;
}

function routeMiles(scenario: Scenario): number | null {
  if (!scenario.results) return null;
  const value = getValueAtPath(scenario.results, ROUTE_MILES_PATH);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

function formatMiles(miles: number | null): string {
  if (miles === null) return 'Not available';
  const text = miles.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return `${text} mi`;
}

function coordinateKey(scenario: Scenario): string {
  const route = scenarioMapRoute({
    route: scenario.route,
    route_geojson: scenario.route_geojson,
    segments: scenario.segments,
  });
  return JSON.stringify(route?.coordinates ?? null);
}

export function routeRow(scenarios: Scenario[], baseId: string): ChangedInputRow {
  const base = scenarios.find((scenario) => scenario.id === baseId) ?? null;
  const baseKey = base ? coordinateKey(base) : null;
  const values: Record<string, unknown> = {};
  const differsFromBase: Record<string, boolean> = {};
  for (const scenario of scenarios) {
    const miles = formatMiles(routeMiles(scenario));
    const same = base !== null && coordinateKey(scenario) === baseKey;
    const differs = base !== null && scenario.id !== baseId && !same;
    differsFromBase[scenario.id] = differs;
    if (scenario.id === baseId || base === null) {
      values[scenario.id] = miles;
    } else {
      values[scenario.id] = `${miles}, ${same ? 'same as base' : 'different path'}`;
    }
  }
  if (base) differsFromBase[baseId] = false;
  return { path: 'route', label: 'Route', values, differsFromBase };
}
