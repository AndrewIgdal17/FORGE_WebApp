import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(), auth: { getSession: vi.fn() } },
}));

import { ScenarioToolbar, newScenarioFromDefaults } from '@/components/projects/scenario-toolbar';
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

function renderToolbar(options: {
  scenarios: Scenario[];
  baseId?: string | null;
  activeId?: string;
  readOnly?: boolean;
}): string {
  return renderToStaticMarkup(
    createElement(ScenarioToolbar, {
      project: sampleProject(options.baseId ?? null),
      scenarios: options.scenarios,
      activeId: options.activeId ?? options.scenarios[0]?.id ?? '',
      readOnly: options.readOnly ?? false,
      onSelect: () => {},
      onDuplicate: () => {},
      onNew: () => {},
      onRename: () => {},
      onDelete: () => {},
      onCompare: () => {},
    }),
  );
}

const later = sampleScenario('s-later', 'Reconductor', '2026-11-02T00:00:00Z');
const earlier = sampleScenario('s-earlier', 'Rebuild', '2026-11-01T00:00:00Z');

describe('ScenarioToolbar', () => {
  it('lists every scenario in created_at order in the switcher', () => {
    const html = renderToolbar({
      scenarios: [later, earlier],
      activeId: 's-later',
    });
    const menu = html.slice(html.indexOf('role="menu"'));
    expect(menu).toContain('Rebuild');
    expect(menu).toContain('Reconductor');
    expect(menu.indexOf('Rebuild')).toBeLessThan(menu.indexOf('Reconductor'));
  });

  it('shows the active scenario name on the switcher button', () => {
    const html = renderToolbar({
      scenarios: [later, earlier],
      activeId: 's-later',
    });
    const switcher = html.match(/<button[^>]*aria-label="Switch scenario"[^>]*>/)?.[0] ?? '';
    expect(switcher).toContain('aria-haspopup="menu"');
    expect(html).toContain('>Reconductor<');
  });

  it('shows Compare and Duplicate buttons', () => {
    const html = renderToolbar({ scenarios: [later, earlier] });
    expect(html).toMatch(/<button[^>]*>Compare<\/button>/);
    expect(html).toMatch(/<button[^>]*>Duplicate<\/button>/);
  });

  it('never shows a base star or a Make base action', () => {
    const html = renderToolbar({
      scenarios: [later, earlier],
      baseId: 's-earlier',
    });
    expect(html).not.toContain('★');
    expect(html).not.toContain('Make base');
  });

  it('disables Delete with a tooltip when the project has one scenario', () => {
    const html = renderToolbar({
      scenarios: [earlier],
    });
    const deleteButton = html.match(/<button[^>]*>(?:<span[^>]*><\/span>)?Delete<\/button>/)?.[0] ?? '';
    expect(deleteButton).toContain('disabled');
    expect(deleteButton).toContain('A project needs at least one scenario');
    expect(html).toContain('Rename');
    expect(html).toContain('New scenario from defaults');
  });

  it('omits a scenario whose project_id is null', () => {
    const html = renderToolbar({
      scenarios: [
        earlier,
        sampleScenario('s-null', 'Orphan', '2026-11-03T00:00:00Z', null),
      ],
    });
    expect(html).toContain('Rebuild');
    expect(html).not.toContain('Orphan');
  });

  it('read-only shows Compare and Duplicate but hides Rename, Delete, and New', () => {
    const html = renderToolbar({
      scenarios: [later, earlier],
      readOnly: true,
    });
    expect(html).toContain('Compare');
    expect(html).toContain('Duplicate');
    expect(html).toContain('Reconductor');
    expect(html).not.toContain('Rename');
    expect(html).not.toContain('>Delete<');
    expect(html).not.toContain('New scenario from defaults');
    expect(html).not.toContain('Make base');
    expect(html).not.toContain('aria-label="More scenario actions"');
  });
});

describe('newScenarioFromDefaults', () => {
  it('builds a manual draft in the given project with no changes', () => {
    expect(newScenarioFromDefaults('p1', [])).toEqual({
      name: 'Scenario',
      source: 'manual',
      changes: {},
      project_id: 'p1',
    });
  });

  it('numbers the name when a scenario is already called Scenario', () => {
    expect(newScenarioFromDefaults('p1', ['Scenario']).name).toBe('Scenario (2)');
  });
});
