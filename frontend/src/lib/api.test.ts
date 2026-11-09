import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { supabase } from '@/lib/supabase';

import { ApiError, requiredInputs } from './api';

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
          path: '01_project_technical_details.project.value_of_load_per_mwh',
          label: 'Receiving-end energy value ($/MWh)',
          stage: 'after_route' as const,
          message: 'Receiving-end energy value ($/MWh) is required.',
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
