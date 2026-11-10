import { beforeEach, describe, expect, it, vi } from 'vitest';

const tables = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: tables.from, auth: { getSession: vi.fn() } },
}));

vi.mock('@/lib/api', () => ({
  createScenario: vi.fn(),
  getDefaults: vi.fn(),
  updateScenario: vi.fn(),
  deleteScenario: vi.fn(),
}));

import { scenarioMapRoute } from '@/lib/route-geometry';
import { asRoute, routePayload, useScenarioStore } from './scenario-store';

const LINE = {
  type: 'MultiLineString' as const,
  coordinates: [
    [
      [-111.54, 32.87],
      [-105.59, 34.35],
    ],
  ],
};

const HEX_ROUTE = '0105000020E610000001000000010200000002000000';

const SEGMENTS = [
  {
    geometry: {
      type: 'LineString',
      coordinates: [
        [-111.54, 32.87],
        [-105.59, 34.35],
      ],
    },
  },
];

const REBUILT = {
  type: 'MultiLineString',
  coordinates: [
    [
      [-111.54, 32.87],
      [-105.59, 34.35],
    ],
  ],
};

describe('asRoute', () => {
  it('returns the GeoJSON object when it is a MultiLineString', () => {
    expect(asRoute(LINE)).toBe(LINE);
  });

  it('returns null for a hex string and does not parse strings', () => {
    expect(asRoute(HEX_ROUTE)).toBeNull();
    expect(asRoute(JSON.stringify(LINE))).toBeNull();
  });

  it('returns null for any other value', () => {
    expect(asRoute({ type: 'LineString', coordinates: [[0, 0], [1, 1]] })).toBeNull();
    expect(asRoute(null)).toBeNull();
  });
});

describe('routePayload', () => {
  it('prefers the stored line over segments', () => {
    expect(routePayload(LINE, [])).toEqual(LINE);
    expect(routePayload(LINE, SEGMENTS)).toEqual(LINE);
  });

  it('falls back to segments only when route_geojson is null', () => {
    expect(routePayload(null, SEGMENTS)).toEqual(REBUILT);
    expect(routePayload(HEX_ROUTE, SEGMENTS)).toBeNull();
  });
});

describe('scenarioMapRoute', () => {
  it('yields the stored line when segments are empty', () => {
    expect(
      scenarioMapRoute({
        route: null,
        route_geojson: LINE,
        segments: [],
      }),
    ).toBe(LINE);
  });

  it('rebuilds from segments only when route_geojson is null', () => {
    expect(
      scenarioMapRoute({
        route: HEX_ROUTE,
        route_geojson: null,
        segments: SEGMENTS,
      }),
    ).toEqual(REBUILT);
  });

  it('keeps a drawn line that has no stored route_geojson', () => {
    expect(scenarioMapRoute({ route: LINE, segments: [] })).toBe(LINE);
  });
});

describe('loadScenarios', () => {
  beforeEach(() => {
    tables.from.mockReset();
    useScenarioStore.setState({ scenarios: [], loading: false });
  });

  it('reads scenario_read and maps route_geojson', async () => {
    const row = {
      id: 's1',
      name: 'Routed',
      source: 'manual',
      defaults_id: 'd1',
      changes: {},
      results: null,
      calculator: null,
      inputs_id: null,
      computed_at: null,
      calc_error: null,
      revision: 1,
      created_at: '2026-11-09T00:00:00Z',
      updated_at: '2026-11-09T00:00:00Z',
      user_id: 'user-a',
      route: HEX_ROUTE,
      route_geojson: LINE,
      segments: [],
    };
    tables.from.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return { select: () => Promise.resolve({ data: [], error: null }) };
      }
      return {
        select: () => ({
          order: () => Promise.resolve({ data: [row], error: null }),
        }),
      };
    });

    await useScenarioStore.getState().loadScenarios();

    expect(tables.from).toHaveBeenCalledWith('scenario_read');
    expect(tables.from).not.toHaveBeenCalledWith('scenario');
    const scenario = useScenarioStore.getState().scenarios[0];
    expect(scenario.route).toBe(LINE);
    expect(scenarioMapRoute(scenario)).toBe(LINE);
  });
});
