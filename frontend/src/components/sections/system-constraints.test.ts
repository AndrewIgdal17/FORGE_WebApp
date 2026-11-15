import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(), auth: { getSession: vi.fn() } },
}));

import { CAPACITY_GATE_HELP } from '@/components/sections/system-constraints';

describe('capacity value help (Spec 11 rule 7)', () => {
  it('uses the three-state wording', () => {
    expect(CAPACITY_GATE_HELP).toBe(
      'Capacity value does not apply unless this is on. With it on, a credit or price of 0 gives a measured $0.',
    );
  });
});
