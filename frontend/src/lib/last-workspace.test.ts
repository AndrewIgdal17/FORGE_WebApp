import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(), auth: { getSession: vi.fn() } },
}));

import {
  clearLastWorkspace,
  readLastWorkspace,
  workspaceEntry,
  writeLastWorkspace,
} from '@/lib/last-workspace';

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

  it('round-trips the remembered project and scenario', () => {
    writeLastWorkspace('p1', 's1');
    expect(readLastWorkspace()).toEqual({ project: 'p1', scenario: 's1' });
    clearLastWorkspace();
    expect(readLastWorkspace()).toBeNull();
  });

  it('returns null for bad JSON or the wrong shape', () => {
    localStorage.setItem('forge.lastWorkspace', '{not json');
    expect(readLastWorkspace()).toBeNull();
    localStorage.setItem('forge.lastWorkspace', JSON.stringify({ project: 1 }));
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

describe('workspaceEntry', () => {
  const remembered = { project: 'p1', scenario: 's1' };
  const params = (query: string): URLSearchParams => new URLSearchParams(query);

  it('redirects a bare visit to the remembered project that still exists', () => {
    expect(workspaceEntry(params(''), false, remembered, ['p1', 'p2'])).toEqual({
      kind: 'redirect',
      to: '/app/workspace?project=p1&scenario=s1',
    });
  });

  it('sends a bare visit to /app/projects when the remembered project was deleted', () => {
    expect(workspaceEntry(params(''), false, remembered, ['p2'])).toEqual({
      kind: 'redirect',
      to: '/app/projects',
    });
  });

  it('sends a bare visit to /app/projects when nothing is remembered', () => {
    expect(workspaceEntry(params(''), false, null, ['p1'])).toEqual({
      kind: 'redirect',
      to: '/app/projects',
    });
  });

  it('stays for the wizard (new=1)', () => {
    expect(workspaceEntry(params('new=1'), false, remembered, ['p1'])).toEqual({
      kind: 'stay',
    });
  });

  it('stays while a pending imported draft is waiting', () => {
    expect(workspaceEntry(params(''), true, remembered, ['p1'])).toEqual({ kind: 'stay' });
  });

  it('stays when a project is named in the URL', () => {
    expect(workspaceEntry(params('project=p2&scenario=s9'), false, remembered, ['p1'])).toEqual({
      kind: 'stay',
    });
  });
});
