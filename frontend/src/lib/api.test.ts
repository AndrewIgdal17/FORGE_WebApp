import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { supabase } from '@/lib/supabase';

import {
  ApiError,
  assembleLine,
  createProject,
  deleteProject,
  duplicateProject,
  duplicateScenarioApi,
  requiredInputs,
  updateProject,
} from './api';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
  },
}));

describe('ApiError', () => {
  it('uses a string detail as the message', () => {
    const error = new ApiError(422, {
      detail: 'A drawn route inside the lower 48 is required.',
    });
    expect(error.message).toBe('A drawn route inside the lower 48 is required.');
    expect(error.status).toBe(422);
    expect(error.body).toEqual({
      detail: 'A drawn route inside the lower 48 is required.',
    });
  });

  it('uses a nested error message when detail is not a string', () => {
    const error = new ApiError(400, {
      detail: [{ msg: 'field required' }],
      error: { message: 'Name is taken' },
    });
    expect(error.message).toBe('Name is taken');
  });

  it('stringifies other object shapes', () => {
    const body = { detail: [{ msg: 'field required' }] };
    expect(new ApiError(422, body).message).toBe(JSON.stringify(body));
  });

  it('keeps a plain string and the empty-body fallback', () => {
    expect(new ApiError(500, 'boom').message).toBe('boom');
    expect(new ApiError(500, '').message).toBe('Request failed');
    expect(new ApiError(500, null).message).toBe('Request failed');
    expect(new ApiError(500, undefined).message).toBe('Request failed');
  });
});

describe('requiredInputs', () => {
  beforeEach(() => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts changes to /api/forge/required', async () => {
    const changes = { '01_project_technical_details.project.capacity_mw': 500 };
    const payload = {
      before_route: [],
      after_route: [
        {
          path: '17_congestion_reductions.greenfield_congestion_reductions.constraints.average_exceedance',
          label: 'Average exceedance (MW)',
          stage: 'after_route' as const,
          message: 'Average exceedance (MW) is required.',
        },
      ],
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(requiredInputs(changes)).resolves.toEqual(payload);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/api/forge/required');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ changes }));
  });
});

const SCENARIO_CREATE = {
  name: 'First',
  source: 'manual',
  defaults_id: 'def-1',
  changes: {},
  route: {
    type: 'MultiLineString' as const,
    coordinates: [
      [
        [-97.74, 30.27],
        [-97.75, 30.28],
      ],
    ],
  },
  row_width_ft: 150,
};

describe('createProject', () => {
  beforeEach(() => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { access_token: 'tok' } as never },
      error: null,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts to /api/projects with sending, receiving, and scenario body', async () => {
    const body = { project: { id: 'p1' }, scenario: { id: 's1' } };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const payload = {
      sending: { substation_gid: 847 },
      receiving: { substation_gid: 19279 },
      nerc_regions: ['WECC'],
      scenario: SCENARIO_CREATE,
    };
    await expect(createProject(payload)).resolves.toEqual(body);

    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/api/projects');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify(payload));
    const headers = init.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer tok');
  });
});

describe('updateProject', () => {
  beforeEach(() => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('patches /api/projects/{id} with revision and fields', async () => {
    const project = { id: 'p1', name: 'Renamed', revision: 2 };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(project), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      updateProject('p1', { revision: 1, name: 'Renamed' }),
    ).resolves.toEqual(project);

    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/api/projects/p1');
    expect(init.method).toBe('PATCH');
    expect(init.body).toBe(JSON.stringify({ revision: 1, name: 'Renamed' }));
  });
});

describe('deleteProject', () => {
  beforeEach(() => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('deletes /api/projects/{id}', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await deleteProject('p1');

    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/api/projects/p1');
    expect(init.method).toBe('DELETE');
  });
});

describe('duplicateProject', () => {
  beforeEach(() => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts to /api/projects/{id}/duplicate', async () => {
    const body = { project: { id: 'p2' }, scenarios: [{ id: 's2' }] };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(duplicateProject('p1')).resolves.toEqual(body);

    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/api/projects/p1/duplicate');
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();
  });
});

describe('assembleLine', () => {
  beforeEach(() => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { access_token: 'tok' } as never },
      error: null,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts to /api/lines/assemble with the request body', async () => {
    const request = {
      gids: [123, 456],
      sending: [-97.74, 30.27] as [number, number],
      receiving: [-97.75, 30.28] as [number, number],
      sending_gid: 10,
      stretch_end: null as [number, number] | null,
    };
    const responseBody = {
      route: {
        type: 'MultiLineString',
        coordinates: [
          [
            [-97.74, 30.27],
            [-97.75, 30.28],
          ],
        ],
      },
      connectors: [],
      pieces: [{ gid: 123, voltage_kv: 138, sub_1: 'A', sub_2: 'B', source: 'hifld', miles: 12.4 }],
      prefill: { old_ac_dc: 'AC', old_capacity_mw: 394, old_conductor_type: 'Standard Aluminum Conductor' },
      corridors_release: 'HIFLD 2022 + OSM 2026-10-09',
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(assembleLine(request)).resolves.toEqual(responseBody);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/api/lines/assemble');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify(request));
    const headers = init.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer tok');
  });
});

describe('duplicateScenarioApi', () => {
  beforeEach(() => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts to /api/scenarios/{id}/duplicate', async () => {
    const scenario = { id: 's3', name: 'Copy (2)' };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(scenario), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(duplicateScenarioApi('s1')).resolves.toEqual(scenario);

    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/api/scenarios/s1/duplicate');
    expect(init.method).toBe('POST');
  });
});
