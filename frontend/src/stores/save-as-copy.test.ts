import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  createScenario: vi.fn(),
  updateScenario: vi.fn(),
  deleteScenario: vi.fn(),
  getDefaults: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: vi.fn() } } }));
vi.mock('@/lib/api', () => api);

import { saveCreatesCopy, useScenarioStore, type Scenario } from './scenario-store';

const ROUTE = {
  type: 'MultiLineString',
  coordinates: [
    [
      [-111.54, 32.87],
      [-105.59, 34.35],
    ],
  ],
};

function scenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: 'paper-1',
    name: 'SunZia_Delay17',
    source: 'paper',
    defaults_id: 'sha256:abc',
    changes: { '01_project_technical_details.project.capacity_mw': 2400 },
    results: null,
    calculator: null,
    inputs_id: null,
    computed_at: null,
    calc_error: null,
    revision: 1,
    created_at: '2026-10-10T00:00:00Z',
    updated_at: '2026-10-10T00:00:00Z',
    user_id: 'andy',
    route: ROUTE,
    segments: null,
    ...overrides,
  } as Scenario;
}

function response(row: Partial<Scenario>) {
  return {
    ...scenario(),
    id: 'copy-1',
    source: 'manual',
    revision: 1,
    ...row,
  };
}

describe('saveCreatesCopy', () => {
  it('copies an example even when the viewer owns it', () => {
    expect(saveCreatesCopy(scenario(), 'andy')).toBe(true);
  });

  it('copies a scenario someone else owns', () => {
    expect(saveCreatesCopy(scenario({ source: 'manual', user_id: 'other' }), 'andy')).toBe(true);
  });

  it('saves your own scenario in place', () => {
    expect(saveCreatesCopy(scenario({ source: 'manual' }), 'andy')).toBe(false);
    expect(saveCreatesCopy(scenario({ source: 'wizard' }), 'andy')).toBe(false);
  });
});

describe('saveScenarioAsCopy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getDefaults.mockResolvedValue({ calculator: { defaults_id: 'sha256:abc' }, defaults: {} });
    useScenarioStore.setState({
      scenarios: [
        scenario(),
        scenario({ id: 'old-copy', name: 'SunZia_Delay17 (copy)', source: 'manual' }),
      ],
      activeScenarioId: 'paper-1',
    });
  });

  it('creates a new manual row with the edits and leaves the example alone', async () => {
    const edits = { '01_project_technical_details.timeline.delay_years': 3 };
    api.createScenario.mockImplementation(async (payload: Record<string, unknown>) =>
      response({ name: payload.name as string, changes: payload.changes as Record<string, unknown> }),
    );

    const copy = await useScenarioStore
      .getState()
      .saveScenarioAsCopy('paper-1', edits, undefined, 215);

    expect(api.updateScenario).not.toHaveBeenCalled();
    expect(api.createScenario).toHaveBeenCalledWith({
      name: 'SunZia_Delay17 (copy) (2)',
      source: 'manual',
      defaults_id: 'sha256:abc',
      changes: edits,
      route: ROUTE,
      row_width_ft: 215,
    });
    expect(copy.id).toBe('copy-1');
    const state = useScenarioStore.getState();
    expect(state.activeScenarioId).toBe('copy-1');
    expect(state.unsavedChanges).toBe(false);
    expect(state.scenarios.find((row) => row.id === 'paper-1')?.revision).toBe(1);
  });

  it('uses a newly drawn line instead of the example route', async () => {
    const drawn = {
      route: { type: 'MultiLineString', coordinates: [[[-100, 31], [-99, 32]]] },
      segments: [{ id: 0 }],
    };
    api.createScenario.mockImplementation(async (payload: Record<string, unknown>) =>
      response({ name: payload.name as string }),
    );

    await useScenarioStore.getState().saveScenarioAsCopy('paper-1', {}, drawn, 215);

    expect(api.createScenario).toHaveBeenCalledWith(
      expect.objectContaining({ route: drawn.route, segments: drawn.segments }),
    );
  });
});
