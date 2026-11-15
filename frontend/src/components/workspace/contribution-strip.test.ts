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

import { displayFigure } from '@/components/workspace/contribution-strip';

const NOT_APPLYING = {
  bcr: { delivered_benefit_pv: 0, capacity_value_benefit_pv: 0, congestion_benefit_pv: 0 },
  taxonomy_results: [
    { taxonomy_id: 'delivered_energy_benefit', applies: false, available: true, value_pv: 0 },
    { taxonomy_id: 'capacity_value_benefit', applies: false, available: true, value_pv: 0 },
    { taxonomy_id: 'congestion_benefit', applies: false, available: true, value_pv: 0 },
  ],
};

describe('benefit strips and applies (Spec 10 rule 8)', () => {
  const figures = [
    ...STRIP_CONFIG['economic-details'].figures.slice(0, 2),
    STRIP_CONFIG['system-constraints'].figures[1]!,
  ];
  it('a benefit that does not apply reads Does not apply', () => {
    for (const figure of figures) expect(displayFigure(figure, NOT_APPLYING)).toBe('Does not apply');
  });
  it('a stored result without applies shows its value as today', () => {
    const old = { bcr: NOT_APPLYING.bcr };
    for (const figure of figures) expect(displayFigure(figure, old)).toBe('$0');
  });
});
