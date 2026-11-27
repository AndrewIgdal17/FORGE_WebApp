import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(), auth: { getSession: vi.fn() } },
}));

import {
  clearLastWorkspace,
  readLastWorkspace,
  projectScenarioMap,
  reconcileRemembered,
  workspaceEntry,
  writeLastWorkspace,
} from '@/lib/last-workspace';
import type { Scenario } from '@/stores/scenario-store';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key: string) => (data.has(key) ? (data.get(key) as string) : null),
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    removeItem: (key: string) => {
      data.delete(key);
    },
    setItem: (key: string, value: string) => {
      data.set(key, String(value));
    },
  } as Storage;
}

describe('last-workspace storage', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('writes under the exact key forge-last-workspace', () => {
    writeLastWorkspace('p1', 's1');
    expect(localStorage.getItem('forge-last-workspace')).toBe(
      JSON.stringify({ project: 'p1', scenario: 's1' }),
    );
  });

  it('round-trips the remembered project and scenario', () => {
    writeLastWorkspace('p1', 's1');
    expect(readLastWorkspace()).toEqual({ project: 'p1', scenario: 's1' });
    clearLastWorkspace();
    expect(readLastWorkspace()).toBeNull();
  });

  it('returns null for bad JSON or the wrong shape', () => {
    localStorage.setItem('forge-last-workspace', '{not json');
    expect(readLastWorkspace()).toBeNull();
    localStorage.setItem('forge-last-workspace', JSON.stringify({ project: 1 }));
    expect(readLastWorkspace()).toBeNull();
  });

  it('is safe when storage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    });
    expect(() => writeLastWorkspace('p1', 's1')).not.toThrow();
    expect(readLastWorkspace()).toBeNull();
    expect(() => clearLastWorkspace()).not.toThrow();
  });

  it('is safe when no storage exists at all', () => {
    vi.unstubAllGlobals();
    expect(readLastWorkspace()).toBeNull();
    expect(() => writeLastWorkspace('p1', 's1')).not.toThrow();
  });
});

function scenario(id: string, projectId: string | null, createdAt = '2026-01-01'): Scenario {
  return { id, project_id: projectId, created_at: createdAt } as unknown as Scenario;
}

describe('reconcileRemembered', () => {
  const projects = [
    { id: 'p1', base_scenario_id: 's2' },
    { id: 'p2', base_scenario_id: null },
    { id: 'p3', base_scenario_id: null },
  ];
  const scenarios = [
    scenario('s1', 'p1', '2026-01-01'),
    scenario('s2', 'p1', '2026-01-02'),
    scenario('s3', 'p2', '2026-01-01'),
  ];

  it('returns null when nothing is remembered', () => {
    expect(reconcileRemembered(null, projects, scenarios)).toBeNull();
  });

  it('returns null when the remembered project was deleted', () => {
    expect(reconcileRemembered({ project: 'gone', scenario: 's1' }, projects, scenarios)).toBeNull();
  });

  it('returns null when the remembered project has no scenarios', () => {
    expect(reconcileRemembered({ project: 'p3', scenario: 's9' }, projects, scenarios)).toBeNull();
  });

  it('keeps a remembered scenario that still belongs to the project', () => {
    expect(reconcileRemembered({ project: 'p1', scenario: 's1' }, projects, scenarios)).toEqual({
      project: 'p1',
      scenario: 's1',
    });
  });

  it('falls back to the project base scenario when the remembered one is gone', () => {
    expect(reconcileRemembered({ project: 'p1', scenario: 'deleted' }, projects, scenarios)).toEqual({
      project: 'p1',
      scenario: 's2',
    });
  });
});

describe('projectScenarioMap', () => {
  it('maps each project to its base scenario, else its first, else null', () => {
    const map = projectScenarioMap(
      [
        { id: 'p1', base_scenario_id: 's2' },
        { id: 'p2', base_scenario_id: null },
        { id: 'p3', base_scenario_id: null },
      ],
      [
        scenario('s1', 'p1', '2026-01-01'),
        scenario('s2', 'p1', '2026-01-02'),
        scenario('s3', 'p2', '2026-01-01'),
      ],
    );
    expect(map.get('p1')).toBe('s2');
    expect(map.get('p2')).toBe('s3');
    expect(map.get('p3')).toBeNull();
    expect(map.has('gone')).toBe(false);
  });
});

describe('workspaceEntry', () => {
  const remembered = { project: 'p1', scenario: 's1' };
  const projectIds = ['p1', 'p2'];
  const scenarioProjects = new Map<string, string | null>([
    ['s3', 'p2'],
    ['free', null],
  ]);
  const projectScenarios = new Map<string, string | null>([
    ['p1', 's1'],
    ['p2', 's3'],
    ['p3', null],
  ]);
  const entry = (
    query: string,
    overrides: Partial<{
      pendingDraft: boolean;
      remembered: typeof remembered | null;
      projectIds: string[];
    }> = {},
  ) =>
    workspaceEntry({
      params: new URLSearchParams(query),
      pendingDraft: overrides.pendingDraft ?? false,
      remembered: overrides.remembered === undefined ? remembered : overrides.remembered,
      projectIds: overrides.projectIds ?? projectIds,
      scenarioProjects,
      projectScenarios,
    });

  it('opens the remembered workspace on a bare visit when its project exists', () => {
    expect(entry('')).toEqual({ kind: 'open', project: 'p1', scenario: 's1' });
  });

  it('goes to /app/projects on a bare visit when the remembered project is gone', () => {
    expect(entry('', { projectIds: ['p2'] })).toEqual({ kind: 'projects' });
  });

  it('goes to /app/projects on a bare visit when nothing is remembered', () => {
    expect(entry('', { remembered: null })).toEqual({ kind: 'projects' });
  });

  it('stays for the wizard (new=1)', () => {
    expect(entry('new=1', { remembered: null })).toEqual({ kind: 'stay' });
  });

  it('stays while a pending imported draft is waiting', () => {
    expect(entry('', { pendingDraft: true })).toEqual({ kind: 'stay' });
  });

  it('stays when a project is named in the URL', () => {
    expect(entry('project=p2&scenario=s9')).toEqual({ kind: 'stay' });
  });

  it('opens the base or first scenario when only a project is named', () => {
    expect(entry('project=p1')).toEqual({ kind: 'open', project: 'p1', scenario: 's1' });
    expect(entry('project=p2')).toEqual({ kind: 'open', project: 'p2', scenario: 's3' });
  });

  it('sends a project-only URL to /app/projects when the project has no scenarios', () => {
    expect(entry('project=p3')).toEqual({ kind: 'projects' });
  });

  it('sends a project-only URL to /app/projects when the project is not loaded', () => {
    expect(entry('project=gone')).toEqual({ kind: 'projects' });
  });

  it('redirects a scenario-only URL to the scenario project when the scenario is loaded', () => {
    expect(entry('scenario=s3', { remembered: null })).toEqual({
      kind: 'open',
      project: 'p2',
      scenario: 's3',
    });
  });

  it('sends a scenario-only URL to /app/projects when the scenario is not found', () => {
    expect(entry('scenario=missing', { remembered: null })).toEqual({ kind: 'projects' });
  });

  it('sends a scenario-only URL to /app/projects when the scenario has no project', () => {
    expect(entry('scenario=free', { remembered: null })).toEqual({ kind: 'projects' });
  });
});
