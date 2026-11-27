import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(), auth: { getSession: vi.fn() } },
}));

import { ProjectCard } from '@/components/projects/project-card';
import type { Project } from '@/stores/project-store';

function sampleProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    user_id: 'user-a',
    name: 'SunZia',
    sending_name: 'Sub A',
    receiving_name: 'Sub B',
    sending_substation_gid: 1,
    receiving_substation_gid: 2,
    sending_point: [-97.74, 30.27],
    receiving_point: [-97.75, 30.28],
    base_scenario_id: 's1',
    revision: 1,
    created_at: '2026-11-09T00:00:00Z',
    updated_at: '2026-11-09T00:00:00Z',
    ...overrides,
  };
}

function renderCard(
  overrides: {
    isOwner?: boolean;
  } = {},
): string {
  const noop = () => {};
  return renderToStaticMarkup(
    createElement(ProjectCard, {
      project: sampleProject(),
      scenarioCount: 2,
      ownerName: 'andy',
      isOwner: overrides.isOwner ?? true,
      onOpen: noop,
      onRename: noop,
      onDuplicate: noop,
      onDelete: noop,
    }),
  );
}

describe('ProjectCard', () => {
  it('renders name, terminals, scenario count, and owner', () => {
    const html = renderCard();
    expect(html).toContain('SunZia');
    expect(html).toContain('Sub A');
    expect(html).toContain('Sub B');
    expect(html).toContain('2 scenarios');
    expect(html).toContain('andy');
  });

  it('does not show a ratio', () => {
    const html = renderCard();
    expect(html).not.toMatch(/ratio/i);
  });

  it('hides Rename and Delete when isOwner is false', () => {
    const html = renderCard({ isOwner: false });
    expect(html).not.toContain('>Rename<');
    expect(html).not.toContain('>Delete<');
    expect(html).toContain('>Open<');
    expect(html).toContain('>Duplicate<');
  });
});
