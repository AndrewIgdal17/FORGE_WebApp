import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(), auth: { getSession: vi.fn() } },
}));

import {
  ScenarioToolbar,
  chooseScenario,
  isPlainLeftClick,
  newScenarioFromDefaults,
  nextMenuIndex,
  scenarioMenuItems,
} from '@/components/projects/scenario-toolbar';
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

/** The opening tag of the first button whose text is `label`, e.g. the Delete menu item. */
function openingTagOf(html: string, label: string): string {
  const end = html.indexOf(`${label}</button>`);
  if (end < 0) return '';
  return html.slice(html.lastIndexOf('<button', end), html.indexOf('>', html.lastIndexOf('<button', end)) + 1);
}

const later = sampleScenario('s-later', 'Reconductor', '2026-11-02T00:00:00Z');
const earlier = sampleScenario('s-earlier', 'Rebuild', '2026-11-01T00:00:00Z');

describe('scenarioMenuItems', () => {
  it('lists this project scenarios in created_at order with only the active one checked', () => {
    const items = scenarioMenuItems('p1', [later, earlier], 's-later');
    expect(items).toEqual([
      { id: 's-earlier', name: 'Rebuild', checked: false },
      { id: 's-later', name: 'Reconductor', checked: true },
    ]);
  });

  it('drops scenarios from other projects and orphans', () => {
    const items = scenarioMenuItems(
      'p1',
      [earlier, sampleScenario('s-null', 'Orphan', '2026-11-03T00:00:00Z', null)],
      's-earlier',
    );
    expect(items.map((item) => item.name)).toEqual(['Rebuild']);
  });
});

describe('chooseScenario', () => {
  it('calls onSelect with the id of the non-active item it was built for', () => {
    const onSelect = vi.fn();
    const items = scenarioMenuItems('p1', [later, earlier], 's-later');
    const other = items.find((item) => !item.checked);
    expect(other).toBeDefined();
    chooseScenario(onSelect, other?.id ?? '')();
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('s-earlier');
  });
});

describe('ScenarioToolbar', () => {
  it('renders the switcher items as radios with the active one checked', () => {
    const html = renderToolbar({
      scenarios: [later, earlier],
      activeId: 's-later',
    });
    const menu = html.slice(html.indexOf('role="menu"'));
    expect(menu).toContain('role="menuitemradio" aria-checked="false"');
    expect(menu).toContain('role="menuitemradio" aria-checked="true"');
    expect(menu.indexOf('Rebuild')).toBeLessThan(menu.indexOf('Reconductor'));
  });

  it('labels the switcher with the active scenario name', () => {
    const html = renderToolbar({
      scenarios: [later, earlier],
      activeId: 's-later',
    });
    expect(html).toContain('aria-label="Scenario: Reconductor"');
    expect(html).toContain('aria-haspopup="menu"');
  });

  it('shows Compare as a link to the project compare page, and Duplicate as a button', () => {
    const html = renderToolbar({ scenarios: [later, earlier] });
    expect(html).toMatch(/<a [^>]*href="\/app\/projects\/p1\/compare"[^>]*>Compare<\/a>/);
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
    const html = renderToolbar({ scenarios: [earlier] });
    const tag = openingTagOf(html, 'Delete');
    expect(tag).toContain('disabled=""');
    expect(tag).toContain('title="A project needs at least one scenario"');
    expect(html).toContain('Rename');
    expect(html).toContain('New scenario from defaults');
  });

  it('leaves Delete enabled when the project has more than one scenario', () => {
    const html = renderToolbar({ scenarios: [later, earlier] });
    const tag = openingTagOf(html, 'Delete');
    expect(tag).toContain('role="menuitem"');
    expect(tag).not.toContain('disabled');
    expect(tag).not.toContain('title=');
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
    expect(html).not.toContain('Delete</button>');
    expect(html).not.toContain('New scenario from defaults');
    expect(html).not.toContain('Make base');
    expect(html).not.toContain('aria-label="More scenario actions"');
  });
});

describe('isPlainLeftClick', () => {
  function click(overrides: Partial<{
    metaKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
    button: number;
  }> = {}): { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; button: number } {
    return {
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      button: 0,
      ...overrides,
    };
  }

  it('is true for a plain primary-button click', () => {
    expect(isPlainLeftClick(click())).toBe(true);
  });

  it('is false when a modifier or non-primary button is used', () => {
    expect(isPlainLeftClick(click({ metaKey: true }))).toBe(false);
    expect(isPlainLeftClick(click({ ctrlKey: true }))).toBe(false);
    expect(isPlainLeftClick(click({ shiftKey: true }))).toBe(false);
    expect(isPlainLeftClick(click({ button: 1 }))).toBe(false);
  });
});

describe('nextMenuIndex', () => {
  it('wraps forward and backward through item indices', () => {
    expect(nextMenuIndex(0, 3, 'ArrowDown')).toBe(1);
    expect(nextMenuIndex(2, 3, 'ArrowDown')).toBe(0);
    expect(nextMenuIndex(0, 3, 'ArrowUp')).toBe(2);
    expect(nextMenuIndex(1, 3, 'ArrowUp')).toBe(0);
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
