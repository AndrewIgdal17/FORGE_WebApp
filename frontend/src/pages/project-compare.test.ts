import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(), auth: { getSession: vi.fn() } },
}));

import { CMP_PICKER_STORAGE_KEY } from '@/data/configs';
import { compareCsv, ProjectCompareView } from '@/pages/project-compare';
import type { Scenario } from '@/stores/scenario-store';

function scenario(
  id: string,
  name: string,
  results: Record<string, unknown> | null,
): Scenario {
  return {
    id,
    name,
    source: 'manual',
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
    project_id: 'p1',
    route: null,
    route_geojson: null,
    segments: null,
  };
}

function stubKeys(keys: string[]): void {
  const store = new Map<string, string>([[CMP_PICKER_STORAGE_KEY, JSON.stringify(keys)]]);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  });
}

function renderCompare(scenarios: Scenario[], keys: string[]): string {
  stubKeys(keys);
  return renderToStaticMarkup(
    createElement(ProjectCompareView, {
      scenarios,
      baseId: scenarios[0]?.id ?? '',
      defaults: {},
      labelFor: (path: string) => path,
      onBaseChange: () => {},
    }),
  );
}

describe('ProjectCompareView', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('a null societal ratio renders Not available and no difference', () => {
    const html = renderCompare(
      [
        scenario('base', 'Reconductor', { bcr: { bcr_societal: 1.42 } }),
        scenario('copy', 'Rebuild', { bcr: { bcr_societal: null } }),
      ],
      ['bcr_societal'],
    );
    expect(html).toContain('Not available');
    expect(html).toContain('1.420');
    expect(html).not.toContain('Δ');
    expect(html).not.toContain('0.000');
    expect(html).not.toContain('$0');

    const csv = compareCsv(
      [
        scenario('base', 'Reconductor', { bcr: { bcr_societal: 1.42 } }),
        scenario('copy', 'Rebuild', { bcr: { bcr_societal: null } }),
      ],
      'base',
      {},
      (path) => path,
      false,
    );
    expect(csv).toContain('Not available');
    expect(csv).toContain('1.420');
    expect(csv).not.toContain('Δ');
    expect(csv).not.toContain('0.000');
  });

  it('a value that does not apply stays Does not apply', () => {
    const dedicated = scenario('dedicated', 'Dedicated', {
      bcr: { congestion_benefit_pv: 0, bcr_societal: 1 },
      taxonomy_results: [
        {
          taxonomy_id: 'congestion_benefit',
          applies: false,
          available: true,
          value_pv: 0,
        },
      ],
    });
    const html = renderCompare([dedicated], ['congestion_pv']);
    expect(html).toContain('Does not apply');
    expect(html).not.toContain('$0');
    expect(html).not.toContain('Δ');
  });
});
