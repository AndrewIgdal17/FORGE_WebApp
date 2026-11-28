import { describe, expect, it } from 'vitest';

import { exampleProjects } from './example-projects';

const project = (id: string, name: string, created_at: string) => ({
  id,
  name,
  sending_name: `${name} A`,
  receiving_name: `${name} B`,
  created_at,
});

describe('exampleProjects', () => {
  it('lists each project holding a paper scenario once, with its scenario count', () => {
    const projects = [
      project('p-sunzia', 'SunZia', '2026-11-27T10:00:00Z'),
      project('p-mine', 'Mine', '2026-11-27T11:00:00Z'),
    ];
    const scenarios = [
      { project_id: 'p-sunzia', source: 'paper' },
      { project_id: 'p-sunzia', source: 'paper' },
      { project_id: 'p-mine', source: 'manual' },
    ];
    expect(exampleProjects(projects, scenarios)).toEqual([
      { id: 'p-sunzia', name: 'SunZia', terminals: 'SunZia A → SunZia B', scenarioCount: 2 },
    ]);
  });

  it('counts every scenario in an example project, not only the paper ones', () => {
    const projects = [project('p1', 'One', '2026-11-27T10:00:00Z')];
    const scenarios = [
      { project_id: 'p1', source: 'paper' },
      { project_id: 'p1', source: 'manual' },
    ];
    expect(exampleProjects(projects, scenarios)[0]?.scenarioCount).toBe(2);
  });

  it('orders examples by creation, oldest first, and ignores scenarios without a project', () => {
    const projects = [
      project('p-new', 'New', '2026-11-28T00:00:00Z'),
      project('p-old', 'Old', '2026-11-01T00:00:00Z'),
    ];
    const scenarios = [
      { project_id: 'p-new', source: 'paper' },
      { project_id: 'p-old', source: 'paper' },
      { project_id: null, source: 'paper' },
    ];
    expect(exampleProjects(projects, scenarios).map((row) => row.id)).toEqual(['p-old', 'p-new']);
  });

  it('returns nothing when no project holds a paper scenario', () => {
    expect(exampleProjects([project('p1', 'One', '2026-11-27T10:00:00Z')], [])).toEqual([]);
  });
});
