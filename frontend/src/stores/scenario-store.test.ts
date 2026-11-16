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
import {
  asRoute,
  exportAsCsv,
  routePayload,
  useScenarioStore,
  type Scenario,
} from './scenario-store';

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

function acScenario(results: Record<string, unknown>): Scenario {
  return {
    id: 'ac',
    name: 'AC',
    source: 'user',
    defaults_id: 'defaults',
    changes: {},
    results,
    calculator: null,
    inputs_id: null,
    computed_at: null,
    calc_error: null,
    revision: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    user_id: 'user',
    route: null,
    route_geojson: null,
    segments: null,
  };
}

async function captureCsv(row: Scenario): Promise<string> {
  const blobs: Blob[] = [];
  vi.stubGlobal('document', {
    createElement: () => ({
      href: '',
      download: '',
      click() {},
    }),
    body: {
      appendChild() {},
      removeChild() {},
    },
  });
  vi.stubGlobal('URL', {
    createObjectURL(blob: Blob) {
      blobs.push(blob);
      return 'blob:csv';
    },
    revokeObjectURL() {},
  });
  exportAsCsv(row, {});
  return blobs[0]?.text() ?? '';
}

describe('CSV line loss omitted key (Task 5)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('line_loss_pv omitted column reads energy_losses_pv, not line_loss_benefit_pv', async () => {
    const csv = await captureCsv(
      acScenario({
        costs: { line_loss: { total_pv: 1_234 } },
        bcr: {
          omitted: {
            energy_losses_pv: ['line_loss_conductor', 'line_loss_converter'],
          },
        },
      }),
    );
    expect(csv).toContain('line_loss_pv,1234,line_loss_conductor;line_loss_converter\n');
    expect(csv).not.toContain('line_loss_benefit_pv');
  });
});

describe('CSV outage split (Spec 18)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('exports load shed and not-available redispatch', async () => {
    const csv = await captureCsv(
      acScenario({
        bcr: {
          outage_load_shed_pv: 12_000,
          outage_redispatch_pv: null,
        },
        costs: {
          outage: { pv_load_shed: 12_000, pv_redispatch: null, pv_cost: 12_000 },
        },
      }),
    );
    expect(csv).toContain('outage_load_shed_pv,12000,');
    expect(csv).toContain('outage_redispatch_pv,not available,');
  });
});

describe('CSV operating parts (Task 8)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('exports converter O&M as does not apply and a numeric line O&M on AC', async () => {
    const csv = await captureCsv(
      acScenario({
        bcr: {
          oandm_line_pv: 12_345.67,
          oandm_converter_pv: 0,
        },
        taxonomy_results: [
          { taxonomy_id: 'oandm_line', state: 'measured', value_pv: 12_345.67 },
          { taxonomy_id: 'oandm_converter', state: 'does_not_apply', value_pv: null },
        ],
      }),
    );
    expect(csv).toContain('oandm_converter_pv,does not apply,');
    expect(csv).toContain('oandm_line_pv,12345.67,');
  });
});