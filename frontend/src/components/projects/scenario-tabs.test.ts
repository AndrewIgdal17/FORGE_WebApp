import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(), auth: { getSession: vi.fn() } },
}));

import { ScenarioTabs } from '@/components/projects/scenario-tabs';
import type { Project } from '@/stores/project-store';
import type { Scenario } from '@/stores/scenario-store';

function sampleProject(baseId: string | null): Project {
  return {
    id: 'p1',
    user_id: 'user-a',
    name: 'Laredo – Rio Grande',
    sending_name: 'Sub A',
    receiving_name: 'Sub B',
    sending_substation_gid: 1,
    receiving_substation_gid: 2,
    sending_point: [-97.74, 30.27],
    receiving_point: [-97.75, 30.28],
    base_scenario_id: baseId,
    revision: 1,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
  };
}

function sampleScenario(
  id: string,
  name: string,
  createdAt: string,
  projectId: string | null = 'p1',
): Scenario {
  return {
    id,
    name,
    source: 'manual',
    defaults_id: 'defaults',
    changes: {},
    results: null,
    calculator: null,
    inputs_id: null,
    computed_at: null,
    calc_error: null,
    revision: 1,
    created_at: createdAt,
    updated_at: createdAt,
    user_id: 'user-a',
    project_id: projectId,
    route: null,
    route_geojson: null,
    segments: null,
  };
}

function renderTabs(options: {
  scenarios: Scenario[];
  baseId: string | null;
  activeId?: string;
  readOnly?: boolean;
}): string {
  return renderToStaticMarkup(
    createElement(ScenarioTabs, {
      project: sampleProject(options.baseId),
      scenarios: options.scenarios,
      activeId: options.activeId ?? options.scenarios[0]?.id ?? '',
      readOnly: options.readOnly ?? false,
      onSelect: () => {},
      onDuplicate: () => {},
      onNew: () => {},
      onMakeBase: () => {},
      onRename: () => {},
      onDelete: () => {},
      onCompare: () => {},
    }),
  );
}

const later = sampleScenario('s-later', 'Reconductor', '2026-11-02T00:00:00Z');
const earlier = sampleScenario('s-earlier', 'Rebuild', '2026-11-01T00:00:00Z');

describe('ScenarioTabs', () => {
  it('marks the base with a star and orders tabs by created_at', () => {
    const html = renderTabs({
      scenarios: [later, earlier],
      baseId: 's-earlier',
      activeId: 's-later',
    });
    expect(html.indexOf('Rebuild')).toBeLessThan(html.indexOf('Reconductor'));
    expect(html).toContain('★ Rebuild');
    expect(html).not.toContain('★ Reconductor');
  });

  it('disables Delete when the project has one scenario', () => {
    const html = renderTabs({
      scenarios: [earlier],
      baseId: 's-earlier',
    });
    const deleteButton = html.match(/<button[^>]*>Delete<\/button>/)?.[0] ?? '';
    expect(deleteButton).toContain('disabled');
    expect(deleteButton).toContain('A project needs at least one scenario');
    expect(html).toContain('Make base');
    expect(html).toContain('Rename');
  });

  it('omits a scenario whose project_id is null', () => {
    const html = renderTabs({
      scenarios: [
        earlier,
        sampleScenario('s-null', 'Orphan', '2026-11-03T00:00:00Z', null),
      ],
      baseId: 's-earlier',
    });
    expect(html).toContain('Rebuild');
    expect(html).not.toContain('Orphan');
  });

  it('hides Make base, Rename, and Delete when read-only', () => {
    const html = renderTabs({
      scenarios: [later, earlier],
      baseId: 's-earlier',
      readOnly: true,
    });
    expect(html).not.toContain('Make base');
    expect(html).not.toContain('Rename');
    expect(html).not.toContain('>Delete<');
    expect(html).toContain('Duplicate');
    expect(html).toContain('Compare');
  });
});
