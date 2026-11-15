import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(), auth: { getSession: vi.fn() } },
}));

import { stripGridClass } from '@/components/workspace/contribution-strip';
import { STRIP_CONFIG } from '@/data/strip-config';

describe('stripGridClass', () => {
  it('gives a one-figure strip a single column', () => {
    expect(stripGridClass(1)).toBe('grid-cols-1');
    expect(stripGridClass(STRIP_CONFIG['delay-costs'].figures.length)).toBe('grid-cols-1');
  });
  it('keeps the existing column counts', () => {
    expect(stripGridClass(2)).toBe('grid-cols-2');
    expect(stripGridClass(5)).toBe('grid-cols-5');
  });
});
