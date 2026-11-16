import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(), auth: { getSession: vi.fn() } },
}));

import afudcPanelSource from './afudc-panel.tsx?raw';
import insurancePanelSource from './insurance-panel.tsx?raw';
import financialRatesSource from './financial-rates.tsx?raw';
import sidebarSearchSource from '../sidebar/sidebar-search.tsx?raw';
import { showConverterRate } from './insurance-panel';

const FORBIDDEN = [
  'apply_afudc',
  'insurable_components',
  'rate_based',
  'delay_period_active_work',
] as const;

describe('Spec 14 — removed input switches', () => {
  it('panel sources and sidebar search omit the retired path tokens', () => {
    const sources = [
      afudcPanelSource,
      insurancePanelSource,
      financialRatesSource,
      sidebarSearchSource,
    ];
    for (const text of sources) {
      for (const token of FORBIDDEN) {
        expect(text).not.toContain(token);
      }
    }
  });

  it('afudc panel still exposes construction spending profiles', () => {
    expect(afudcPanelSource).toContain('construction_spending_profiles');
  });

  it('showConverterRate is true only for DC', () => {
    expect(showConverterRate('DC')).toBe(true);
    expect(showConverterRate('AC')).toBe(false);
    expect(showConverterRate(null)).toBe(false);
  });
});