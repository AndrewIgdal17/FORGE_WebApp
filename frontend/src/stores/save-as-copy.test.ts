import { describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  createScenario: vi.fn(),
  updateScenario: vi.fn(),
  deleteScenario: vi.fn(),
  getDefaults: vi.fn(),
  createProject: vi.fn(),
  duplicateScenarioApi: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  duplicateProject: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: vi.fn() } } }));
vi.mock('@/lib/api', () => api);

import type { Project } from './project-store';
import { saveAction, useScenarioStore } from './scenario-store';

function project(): Project {
  return {
    id: 'p1',
    user_id: 'andy',
    name: 'A → B',
    sending_name: 'A',
    receiving_name: 'B',
    sending_substation_gid: 1,
    receiving_substation_gid: 2,
    sending_point: [-97.74, 30.27],
    receiving_point: [-97.75, 30.28],
    base_scenario_id: 's1',
    nerc_regions: ['WECC'],
    revision: 1,
    created_at: '2026-11-27T00:00:00Z',
    updated_at: '2026-11-27T00:00:00Z',
  };
}

describe('save no longer copies a scenario in place', () => {
  it('offers a project duplicate instead of writing a paper or foreign scenario', () => {
    expect(saveAction(project(), [{ id: 's1', source: 'paper' }], 'andy')).toBe(
      'offer_duplicate',
    );
    expect(saveAction(project(), [{ id: 's1', source: 'manual' }], 'other')).toBe(
      'offer_duplicate',
    );
    expect(saveAction(project(), [{ id: 's1', source: 'manual' }], 'andy')).toBe('save');
    expect('saveScenarioAsCopy' in useScenarioStore.getState()).toBe(false);
  });
});
