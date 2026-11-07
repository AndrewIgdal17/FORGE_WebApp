import { describe, expect, it, vi } from 'vitest';

import { ApiError } from './api';

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
