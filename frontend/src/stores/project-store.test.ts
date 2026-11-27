import { beforeEach, describe, expect, it, vi } from 'vitest';

const tables = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: tables.from, auth: { getSession: vi.fn() } },
}));

vi.mock('@/lib/api', () => ({
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  duplicateProject: vi.fn(),
}));

import {
  duplicateProject,
  deleteProject,
  updateProject,
} from '@/lib/api';
import type { ProjectResponse } from '@/lib/api';

import {
  fromProjectResponse,
  isProjectReadOnly,
  useProjectStore,
  type Project,
} from './project-store';

const GEO_SEND: ProjectResponse['sending_point'] = {
  type: 'Point',
  coordinates: [-97.74, 30.27],
};
const GEO_RECV: ProjectResponse['receiving_point'] = {
  type: 'Point',
  coordinates: [-97.75, 30.28],
};

function sampleProjectResponse(
  overrides: Partial<Project> = {},
): ProjectResponse {
  const base = sampleProject(overrides);
  return {
    id: base.id,
    user_id: base.user_id,
    name: base.name,
    sending_name: base.sending_name,
    receiving_name: base.receiving_name,
    sending_substation_gid: base.sending_substation_gid,
    receiving_substation_gid: base.receiving_substation_gid,
    sending_point: GEO_SEND,
    receiving_point: GEO_RECV,
    base_scenario_id: base.base_scenario_id,
    revision: base.revision,
    created_at: base.created_at,
    updated_at: base.updated_at,
  };
}

function sampleProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    user_id: 'user-a',
    name: 'A → B',
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

describe('isProjectReadOnly', () => {
  const project = sampleProject();

  it('is false for the owner with only manual scenarios', () => {
    expect(
      isProjectReadOnly(project, [{ id: 's1', source: 'manual' }], 'user-a'),
    ).toBe(false);
  });

  it('is true for a non-owner', () => {
    expect(isProjectReadOnly(project, [], 'user-b')).toBe(true);
  });

  it('is true when any scenario has source paper', () => {
    expect(
      isProjectReadOnly(
        project,
        [{ id: 's1', source: 'manual' }, { id: 's2', source: 'paper' }],
        'user-a',
      ),
    ).toBe(true);
  });
});

describe('loadProjects', () => {
  beforeEach(() => {
    tables.from.mockReset();
    useProjectStore.setState({ projects: [], loading: false });
  });

  it('reads project_read and maps sending_point_geojson to [lon, lat]', async () => {
    const row = {
      id: 'p1',
      user_id: 'user-a',
      name: 'Line',
      sending_name: 'Send',
      receiving_name: 'Recv',
      sending_substation_gid: 10,
      receiving_substation_gid: null,
      sending_point_geojson: { type: 'Point', coordinates: [-97.7401, 30.2702] },
      receiving_point_geojson: { type: 'Point', coordinates: [-81.2841, 35.5928] },
      base_scenario_id: 's1',
      revision: 1,
      created_at: '2026-11-09T00:00:00Z',
      updated_at: '2026-11-09T00:00:00Z',
    };
    tables.from.mockImplementation((table: string) => {
      expect(table).toBe('project_read');
      return {
        select: () => ({
          order: () => Promise.resolve({ data: [row], error: null }),
        }),
      };
    });

    await useProjectStore.getState().loadProjects();

    expect(tables.from).toHaveBeenCalledWith('project_read');
    const project = useProjectStore.getState().projects[0];
    expect(project.sending_point).toEqual([-97.7401, 30.2702]);
    expect(project.receiving_point).toEqual([-81.2841, 35.5928]);
  });

  it('does not store a missing sending_point_geojson as [0, 0]', async () => {
    const row = {
      id: 'p1',
      user_id: 'user-a',
      name: 'Line',
      sending_name: 'Send',
      receiving_name: 'Recv',
      sending_substation_gid: null,
      receiving_substation_gid: null,
      sending_point_geojson: null,
      receiving_point_geojson: { type: 'Point', coordinates: [-81.2841, 35.5928] },
      base_scenario_id: 's1',
      revision: 1,
      created_at: '2026-11-09T00:00:00Z',
      updated_at: '2026-11-09T00:00:00Z',
    };
    tables.from.mockImplementation(() => ({
      select: () => ({
        order: () => Promise.resolve({ data: [row], error: null }),
      }),
    }));

    await useProjectStore.getState().loadProjects();

    const project = useProjectStore.getState().projects[0];
    expect(project.sending_point).toBeNull();
    expect(project.sending_point).not.toEqual([0, 0]);
    expect(project.receiving_point).toEqual([-81.2841, 35.5928]);
  });
});

describe('fromProjectResponse', () => {
  it('does not store an unreadable terminal as [0, 0]', () => {
    const response = sampleProjectResponse();
    const broken = {
      ...response,
      sending_point: { type: 'LineString', coordinates: [] } as unknown as ProjectResponse['sending_point'],
    };
    const project = fromProjectResponse(broken);
    expect(project.sending_point).toBeNull();
    expect(project.sending_point).not.toEqual([0, 0]);
    expect(project.receiving_point).toEqual([-97.75, 30.28]);
  });
});

describe('renameProject', () => {
  beforeEach(() => {
    useProjectStore.setState({ projects: [sampleProject()] });
    vi.mocked(updateProject).mockReset();
  });

  it('calls updateProject and upserts the store', async () => {
    const updated = sampleProjectResponse({ name: 'New name', revision: 2 });
    vi.mocked(updateProject).mockResolvedValue(updated);

    const result = await useProjectStore.getState().renameProject('p1', 'New name', 1);

    expect(updateProject).toHaveBeenCalledWith('p1', { revision: 1, name: 'New name' });
    expect(result.name).toBe('New name');
    expect(result.sending_point).toEqual([-97.74, 30.27]);
    expect(useProjectStore.getState().projects[0].name).toBe('New name');
  });
});

describe('setBase', () => {
  beforeEach(() => {
    useProjectStore.setState({ projects: [sampleProject()] });
    vi.mocked(updateProject).mockReset();
  });

  it('patches base_scenario_id via updateProject', async () => {
    const updated = sampleProjectResponse({ base_scenario_id: 's2', revision: 2 });
    vi.mocked(updateProject).mockResolvedValue(updated);

    await useProjectStore.getState().setBase('p1', 's2', 1);

    expect(updateProject).toHaveBeenCalledWith('p1', {
      revision: 1,
      base_scenario_id: 's2',
    });
    expect(useProjectStore.getState().projects[0].base_scenario_id).toBe('s2');
  });
});

describe('removeProject', () => {
  beforeEach(() => {
    useProjectStore.setState({ projects: [sampleProject()] });
    vi.mocked(deleteProject).mockReset();
  });

  it('deletes on the server and drops the project locally', async () => {
    vi.mocked(deleteProject).mockResolvedValue(undefined);

    await useProjectStore.getState().removeProject('p1');

    expect(deleteProject).toHaveBeenCalledWith('p1');
    expect(useProjectStore.getState().projects).toHaveLength(0);
  });
});

describe('duplicate', () => {
  beforeEach(() => {
    useProjectStore.setState({ projects: [sampleProject()] });
    vi.mocked(duplicateProject).mockReset();
  });

  it('calls duplicateProject and adds the copy to the store', async () => {
    const copy = sampleProjectResponse({ id: 'p2', name: 'A → B (copy)' });
    vi.mocked(duplicateProject).mockResolvedValue({
      project: copy,
      scenarios: [],
    });

    const result = await useProjectStore.getState().duplicate('p1');

    expect(duplicateProject).toHaveBeenCalledWith('p1');
    expect(result.id).toBe('p2');
    expect(useProjectStore.getState().projects).toHaveLength(2);
  });
});