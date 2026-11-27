import { describe, expect, it } from 'vitest';

import { changedInputs, routeRow } from '@/lib/changed-inputs';
import type { Scenario } from '@/stores/scenario-store';

const DEFAULTS = {
  project: {
    type: 'reconductoring',
    conductor: 'Advanced',
  },
};

function scenario(partial: {
  id: string;
  name?: string;
  changes?: Record<string, unknown>;
  results?: Record<string, unknown> | null;
  route_geojson?: unknown;
}): Scenario {
  return {
    id: partial.id,
    name: partial.name ?? partial.id,
    source: 'manual',
    defaults_id: 'defaults',
    changes: partial.changes ?? {},
    results: partial.results ?? null,
    calculator: null,
    inputs_id: null,
    computed_at: null,
    calc_error: null,
    revision: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    user_id: 'user',
    project_id: 'p1',
    route: null,
    route_geojson: partial.route_geojson ?? null,
    segments: null,
    line_selection: null,
  };
}

const labelFor = (path: string): string =>
  path === 'project.conductor' ? 'Conductor' : path;

describe('changedInputs', () => {
  const base = scenario({ id: 'base', name: 'Reconductor' });
  const duplicate = scenario({
    id: 'copy',
    name: 'Rebuild',
    changes: { 'project.conductor': 'Standard' },
  });

  it('a duplicate differing in one leaf yields exactly that row', () => {
    const rows = changedInputs([base, duplicate], 'base', labelFor, false, DEFAULTS);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.path).toBe('project.conductor');
    expect(rows[0]?.label).toBe('Conductor');
    expect(rows[0]?.values.base).toBe('Advanced');
    expect(rows[0]?.values.copy).toBe('Standard');
    expect(rows[0]?.differsFromBase.base).toBe(false);
    expect(rows[0]?.differsFromBase.copy).toBe(true);
  });

  it('a value equal to the default is not a difference from a missing leaf', () => {
    const same = scenario({
      id: 'copy',
      changes: { 'project.conductor': 'Advanced' },
    });
    expect(changedInputs([base, same], 'base', labelFor, false, DEFAULTS)).toEqual([]);
  });

  it('showAll returns every leaf', () => {
    const rows = changedInputs([base, duplicate], 'base', labelFor, true, DEFAULTS);
    expect(rows.map((row) => row.path)).toEqual(['project.type', 'project.conductor']);
    expect(rows[0]?.differsFromBase.copy).toBe(false);
    expect(rows[0]?.values.base).toBe('reconductoring');
    expect(rows[0]?.values.copy).toBe('reconductoring');
  });
});

describe('routeRow', () => {
  const coordinates = [
    [
      [-97.74, 30.27],
      [-97.75, 30.28],
    ],
  ];
  const geo = { type: 'MultiLineString', coordinates };

  it('says same as base for identical coordinates', () => {
    const base = scenario({
      id: 'base',
      route_geojson: geo,
      results: { technical_parameters: { line_length_miles: 31 } },
    });
    const copy = scenario({
      id: 'copy',
      route_geojson: { type: 'MultiLineString', coordinates },
      results: { technical_parameters: { line_length_miles: 31 } },
    });
    const row = routeRow([base, copy], 'base');
    expect(row.path).toBe('route');
    expect(row.label).toBe('Route');
    expect(row.values.base).toBe('31 mi');
    expect(row.values.copy).toBe('31 mi, same as base');
    expect(row.differsFromBase.base).toBe(false);
    expect(row.differsFromBase.copy).toBe(false);
  });

  it('says different path when the coordinates differ', () => {
    const base = scenario({
      id: 'base',
      route_geojson: geo,
      results: { technical_parameters: { line_length_miles: 31 } },
    });
    const other = scenario({
      id: 'other',
      route_geojson: {
        type: 'MultiLineString',
        coordinates: [
          [
            [-97.74, 30.27],
            [-97.9, 30.4],
          ],
        ],
      },
      results: { technical_parameters: { line_length_miles: 48 } },
    });
    const row = routeRow([base, other], 'base');
    expect(row.values.other).toBe('48 mi, different path');
    expect(row.differsFromBase.other).toBe(true);
  });

  it('a missing route length is not zero miles', () => {
    const base = scenario({
      id: 'base',
      route_geojson: geo,
      results: { technical_parameters: { line_length_miles: null } },
    });
    const copy = scenario({
      id: 'copy',
      route_geojson: geo,
      results: null,
    });
    const row = routeRow([base, copy], 'base');
    expect(row.values.base).toBe('Not available');
    expect(row.values.copy).toBe('Not available, same as base');
    expect(row.values.base).not.toBe('0 mi');
    expect(String(row.values.copy)).not.toContain('0 mi');
  });
});
