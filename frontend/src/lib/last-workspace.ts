import type { Scenario } from '@/stores/scenario-store';
import { scenarioForWorkspace } from '@/stores/scenario-store';

const STORAGE_KEY = 'forge-last-workspace';

export interface LastWorkspace {
  project: string;
  scenario: string;
}

export function readLastWorkspace(): LastWorkspace | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const { project, scenario } = value as Partial<LastWorkspace>;
    if (typeof project === 'string' && typeof scenario === 'string') {
      return { project, scenario };
    }
    return null;
  } catch {
    return null;
  }
}

export function writeLastWorkspace(project: string, scenario: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ project, scenario }));
  } catch {
    // Storage can be blocked or full; the workspace still works without it.
  }
}

export function clearLastWorkspace(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}

/**
 * Checks a remembered workspace against loaded projects and scenarios. Returns
 * null when the project was deleted or has no scenarios (the caller should clear
 * the stored value). A remembered scenario that is gone falls back to the
 * project's base or first scenario. Call only after the project store has loaded.
 */
export function reconcileRemembered(
  remembered: LastWorkspace | null,
  projects: ReadonlyArray<{ id: string; base_scenario_id: string | null }>,
  scenarios: Scenario[],
): LastWorkspace | null {
  if (!remembered) return null;
  const project = projects.find((item) => item.id === remembered.project);
  if (!project) return null;
  const rows = scenarios.filter((item) => item.project_id === project.id);
  if (rows.some((item) => item.id === remembered.scenario)) return remembered;
  const fallback = scenarioForWorkspace(project, rows);
  return fallback ? { project: project.id, scenario: fallback.id } : null;
}

/**
 * Each loaded project to its base scenario, else its first scenario; null when
 * it has none. Projects that are not loaded are absent from the map.
 */
export function projectScenarioMap(
  projects: ReadonlyArray<{ id: string; base_scenario_id: string | null }>,
  scenarios: Scenario[],
): Map<string, string | null> {
  const map = new Map<string, string | null>();
  for (const project of projects) {
    map.set(project.id, scenarioForWorkspace(project, scenarios)?.id ?? null);
  }
  return map;
}

export type WorkspaceEntry =
  | { kind: 'stay' }
  | { kind: 'open'; project: string; scenario: string }
  | { kind: 'projects' };

export interface WorkspaceEntryInput {
  params: URLSearchParams;
  /** True when an imported draft is waiting to be opened. */
  pendingDraft: boolean;
  /** Already reconciled with loaded data (see reconcileRemembered). */
  remembered: LastWorkspace | null;
  projectIds: readonly string[];
  /** Scenario id to its project id (null when the scenario has no project). Missing ids are not loaded. */
  scenarioProjects: ReadonlyMap<string, string | null>;
  /** Project id to its base or first scenario id (see projectScenarioMap). Missing ids are not loaded. */
  projectScenarios: ReadonlyMap<string, string | null>;
}

/**
 * Decides what /app/workspace should do on load. The wizard (new=1), a pending
 * imported draft, and a URL naming both project and scenario stay where they are.
 * A project-only URL opens that project's base or first scenario. A scenario-only
 * URL opens that scenario's project. A bare visit opens the remembered workspace
 * when its project exists. Anything else goes to the project list.
 */
export function workspaceEntry(input: WorkspaceEntryInput): WorkspaceEntry {
  const { params, pendingDraft, remembered, projectIds, scenarioProjects, projectScenarios } =
    input;
  if (pendingDraft) return { kind: 'stay' };
  if (params.get('new') === '1') return { kind: 'stay' };

  const projectId = params.get('project');
  const scenarioId = params.get('scenario');
  if (projectId && scenarioId) return { kind: 'stay' };
  if (projectId) {
    const base = projectScenarios.get(projectId) ?? null;
    if (!base) return { kind: 'projects' };
    return { kind: 'open', project: projectId, scenario: base };
  }

  if (scenarioId) {
    if (!scenarioProjects.has(scenarioId)) return { kind: 'projects' };
    const projectId = scenarioProjects.get(scenarioId) ?? null;
    if (!projectId || !projectIds.includes(projectId)) return { kind: 'projects' };
    return { kind: 'open', project: projectId, scenario: scenarioId };
  }

  if (remembered && projectIds.includes(remembered.project)) {
    return { kind: 'open', project: remembered.project, scenario: remembered.scenario };
  }
  return { kind: 'projects' };
}
