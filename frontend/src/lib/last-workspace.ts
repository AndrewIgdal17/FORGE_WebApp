import { workspaceUrl } from '@/stores/scenario-store';

const STORAGE_KEY = 'forge.lastWorkspace';

export interface LastWorkspace {
  project: string;
  scenario: string;
}

export function readLastWorkspace(): LastWorkspace | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (
      typeof value === 'object' &&
      value !== null &&
      typeof (value as LastWorkspace).project === 'string' &&
      typeof (value as LastWorkspace).scenario === 'string'
    ) {
      return { project: (value as LastWorkspace).project, scenario: (value as LastWorkspace).scenario };
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

export type WorkspaceEntry = { kind: 'stay' } | { kind: 'redirect'; to: string };

/**
 * Decides what a bare visit to /app/workspace should do. The wizard, a pending
 * imported draft, and any URL that already names a project stay where they are.
 * Otherwise the remembered workspace opens when its project still exists; if not,
 * the user goes to the project list.
 */
export function workspaceEntry(
  params: URLSearchParams,
  pendingDraft: boolean,
  remembered: LastWorkspace | null,
  projectIds: readonly string[],
): WorkspaceEntry {
  if (pendingDraft) return { kind: 'stay' };
  if (params.get('new') === '1') return { kind: 'stay' };
  if (params.get('project') || params.get('scenario')) return { kind: 'stay' };
  if (remembered && projectIds.includes(remembered.project)) {
    return { kind: 'redirect', to: workspaceUrl(remembered.project, remembered.scenario) };
  }
  return { kind: 'redirect', to: '/app/projects' };
}
