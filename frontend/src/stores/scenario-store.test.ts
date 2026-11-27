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
  createProject: vi.fn(),
  duplicateScenarioApi: vi.fn(),
}));

import {
  createProject,
  createScenario,
  duplicateScenarioApi,
  getDefaults,
  updateScenario,
} from '@/lib/api';
import type { ProjectResponse, ScenarioResponse } from '@/lib/api';
import { scenarioMapRoute } from '@/lib/route-geometry';
import { useProjectStore, type Project } from './project-store';
import {
  asRoute,
  exportAsCsv,
  routePayload,
  saveAction,
  useScenarioStore,
  type Scenario,
  type ScenarioDraft,
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
    expect(scenario.project_id).toBeNull();
  });

  it('keeps a project_id from scenario_read and does not store a blank', async () => {
    const base = {
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
    const rows = [
      { ...base, id: 'kept', project_id: 'p1' },
      { ...base, id: 'missing' },
      { ...base, id: 'blank', project_id: '' },
      { ...base, id: 'nulled', project_id: null },
    ];
    tables.from.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return { select: () => Promise.resolve({ data: [], error: null }) };
      }
      return {
        select: () => ({
          order: () => Promise.resolve({ data: rows, error: null }),
        }),
      };
    });

    await useScenarioStore.getState().loadScenarios();

    const byId = new Map(
      useScenarioStore.getState().scenarios.map((scenario) => [scenario.id, scenario.project_id]),
    );
    expect(byId.get('kept')).toBe('p1');
    expect(byId.get('missing')).toBeNull();
    expect(byId.get('blank')).toBeNull();
    expect(byId.get('nulled')).toBeNull();
    expect(useScenarioStore.getState().scenarios.some((scenario) => scenario.project_id === '')).toBe(
      false,
    );
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
    project_id: 'p-ac',
    route: null,
    route_geojson: null,
    segments: null,
    line_selection: null,
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

  it('exports redispatch as does not apply on a dedicated line', async () => {
    const csv = await captureCsv(
      acScenario({
        bcr: { outage_load_shed_pv: 12_000, outage_redispatch_pv: null },
        costs: {
          outage: { pv_load_shed: 12_000, pv_redispatch: null, pv_cost: 12_000 },
        },
        taxonomy_results: [
          { taxonomy_id: 'outage_load_shed', state: 'measured', value_pv: 12_000 },
          { taxonomy_id: 'outage_redispatch', state: 'does_not_apply', value_pv: null },
        ],
      }),
    );
    expect(csv).toContain('outage_redispatch_pv,does not apply,');
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

const SEND_POINT: [number, number] = [-97.74, 30.27];
const RECV_POINT: [number, number] = [-97.75, 30.28];

function ownedProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    user_id: 'andy',
    name: 'A → B',
    sending_name: 'Sub A',
    receiving_name: 'Sub B',
    sending_substation_gid: 10,
    receiving_substation_gid: 20,
    sending_point: SEND_POINT,
    receiving_point: RECV_POINT,
    base_scenario_id: 's1',
    revision: 1,
    created_at: '2026-11-27T00:00:00Z',
    updated_at: '2026-11-27T00:00:00Z',
    ...overrides,
  };
}

function projectResponse(): ProjectResponse {
  return {
    id: 'p1',
    user_id: 'user-a',
    name: 'Sub A → Point at 30.2800, -97.7500',
    sending_name: 'Sub A',
    receiving_name: 'Point at 30.2800, -97.7500',
    sending_substation_gid: 10,
    receiving_substation_gid: null,
    sending_point: { type: 'Point', coordinates: SEND_POINT },
    receiving_point: { type: 'Point', coordinates: RECV_POINT },
    base_scenario_id: 's-new',
    revision: 1,
    created_at: '2026-11-27T00:00:00Z',
    updated_at: '2026-11-27T00:00:00Z',
  };
}

function scenarioResponse(
  overrides: Partial<ScenarioResponse & { project_id: string }> = {},
): ScenarioResponse & { project_id: string } {
  return {
    id: 's-new',
    user_id: 'user-a',
    name: 'Reconductor',
    source: 'wizard',
    defaults_id: 'sha256:abc',
    changes: { '01_project_technical_details.project.capacity_mw': 500 },
    results: null,
    calculator: null,
    inputs_id: null,
    computed_at: null,
    calc_error: null,
    revision: 1,
    created_at: '2026-11-27T00:00:00Z',
    updated_at: '2026-11-27T00:00:00Z',
    route: LINE,
    segments: null,
    project_id: 'p1',
    ...overrides,
  };
}

describe('saveAction', () => {
  const manual = [{ id: 's1', source: 'manual' }];

  it('offers duplicate to a non-owner', () => {
    expect(saveAction(ownedProject(), manual, 'someone-else')).toBe('offer_duplicate');
  });

  it('offers duplicate to the owner of a paper project', () => {
    expect(
      saveAction(ownedProject(), [{ id: 's1', source: 'paper' }], 'andy'),
    ).toBe('offer_duplicate');
  });

  it('saves for the owner of a project with no paper scenario', () => {
    expect(saveAction(ownedProject(), manual, 'andy')).toBe('save');
  });
});

describe('createProjectWithScenario', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useScenarioStore.setState({
      scenarios: [],
      activeScenarioId: null,
      unsavedChanges: false,
      pendingDraft: null,
    });
    useProjectStore.setState({ projects: [], loading: false });
    vi.mocked(getDefaults).mockResolvedValue({
      calculator: {
        package: 'forge',
        version: 'v6.0.1',
        commit: null,
        defaults_id: 'sha256:abc',
      },
      defaults: {},
    });
  });

  it('sends terminals and the scenario body, and upserts both stores', async () => {
    const changes = { '01_project_technical_details.project.capacity_mw': 500 };
    const draft: ScenarioDraft = {
      name: 'Reconductor',
      source: 'wizard',
      changes,
      terminals: {
        sending: { substation_gid: 10, name: 'Sub A', point: SEND_POINT },
        receiving: {
          substation_gid: null,
          name: 'Point at 30.2800, -97.7500',
          point: RECV_POINT,
        },
      },
    };
    vi.mocked(createProject).mockResolvedValue({
      project: projectResponse(),
      scenario: scenarioResponse(),
    });

    const created = await useScenarioStore
      .getState()
      .createProjectWithScenario(draft, changes, LINE, SEGMENTS, 215);

    expect(createProject).toHaveBeenCalledWith({
      sending: { substation_gid: 10 },
      receiving: { point: RECV_POINT },
      scenario: {
        name: 'Reconductor',
        source: 'wizard',
        defaults_id: 'sha256:abc',
        changes,
        route: LINE,
        segments: SEGMENTS,
        row_width_ft: 215,
      },
    });
    const body = vi.mocked(createProject).mock.calls[0][0];
    expect(body.scenario).not.toHaveProperty('project_id');
    expect(body.sending).not.toHaveProperty('point');
    expect(body.receiving).not.toEqual({ point: [0, 0] });
    expect(created.project.sending_point).toEqual(SEND_POINT);
    expect(created.project.receiving_point).toEqual(RECV_POINT);
    expect(created.scenario.project_id).toBe('p1');
    expect(useScenarioStore.getState().scenarios.map((row) => row.id)).toContain('s-new');
    expect(useProjectStore.getState().projects.map((row) => row.id)).toContain('p1');
    expect(createScenario).not.toHaveBeenCalled();
  });

  it('does not call createProject when a point terminal has no coordinates', async () => {
    const draft: ScenarioDraft = {
      name: 'Broken',
      source: 'wizard',
      changes: {},
      terminals: {
        sending: { substation_gid: 10, name: 'Sub A', point: SEND_POINT },
        receiving: {
          substation_gid: null,
          name: 'missing',
          point: undefined as unknown as [number, number],
        },
      },
    };

    await expect(
      useScenarioStore.getState().createProjectWithScenario(draft, {}, LINE, null, 215),
    ).rejects.toThrow(/missing or unreadable/);
    expect(createProject).not.toHaveBeenCalled();
  });
});

describe('saveScenario', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useScenarioStore.setState({
      scenarios: [{ ...acScenario({}), id: 's-null', project_id: null }],
    });
  });

  it('refuses when project_id is null and does not write', async () => {
    await expect(useScenarioStore.getState().saveScenario('s-null', {}, 1)).rejects.toThrow(
      'This scenario is not in a project, so nothing was saved.',
    );
    expect(updateScenario).not.toHaveBeenCalled();
  });
});

describe('saveScenario line_selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useScenarioStore.setState({
      scenarios: [
        {
          ...acScenario({}),
          id: 's1',
          project_id: 'p1',
          route_geojson: LINE,
          route: LINE as unknown as Record<string, unknown>,
          revision: 2,
        },
      ],
    });
    vi.mocked(updateScenario).mockResolvedValue(
      scenarioResponse({ id: 's1', revision: 3 }),
    );
  });

  it('sends line_selection when lineSelection is provided', async () => {
    const lineSelection = { gids: [101, 102], stretch_end: null };
    await useScenarioStore
      .getState()
      .saveScenario('s1', {}, 2, undefined, 215, lineSelection);

    expect(updateScenario).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(updateScenario).mock.calls[0]?.[1];
    expect(payload?.line_selection).toEqual(lineSelection);
  });

  it('omits line_selection when lineSelection is not provided', async () => {
    await useScenarioStore.getState().saveScenario('s1', {}, 2, undefined, 215);

    const payload = vi.mocked(updateScenario).mock.calls[0]?.[1];
    expect(payload).not.toHaveProperty('line_selection');
  });
});

describe('duplicateScenario', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useScenarioStore.setState({
      scenarios: [
        {
          ...acScenario({}),
          id: 's1',
          name: 'SunZia_Delay17',
          project_id: 'p1',
          user_id: 'andy',
        },
      ],
    });
  });

  it('hits /api/scenarios/{id}/duplicate and keeps the server name', async () => {
    vi.mocked(duplicateScenarioApi).mockResolvedValue(
      scenarioResponse({
        id: 's2',
        name: 'SunZia_Delay17 (2)',
        source: 'manual',
        project_id: 'p1',
        user_id: 'andy',
      }),
    );

    const copy = await useScenarioStore.getState().duplicateScenario('s1');

    expect(duplicateScenarioApi).toHaveBeenCalledTimes(1);
    expect(duplicateScenarioApi).toHaveBeenCalledWith('s1');
    expect(createScenario).not.toHaveBeenCalled();
    expect(createProject).not.toHaveBeenCalled();
    expect(copy.name).toBe('SunZia_Delay17 (2)');
    expect(copy.project_id).toBe('p1');
    expect(useScenarioStore.getState().scenarios.map((row) => row.id)).toContain('s2');
  });
});