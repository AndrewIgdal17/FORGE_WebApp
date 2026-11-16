import { describe, expect, it } from 'vitest';

import { OANDM_PART_IDS } from '@/lib/results-utils';
import { resolveWaccIds, waccApplyingValueSum, waccValueSum } from './perspective-values';

const results = {
  taxonomy_results: [
    { taxonomy_id: 'oandm', value_pv: 100, value_pv_wacc: 80 },
    { taxonomy_id: 'insurance', value_pv: 10, value_pv_wacc: 8 },
    { taxonomy_id: 'capital_recovery', value_pv: null, value_pv_wacc: 500 },
    { taxonomy_id: 'wildfire_eac', value_pv: 7, value_pv_wacc: null },
  ],
};

describe('waccValueSum', () => {
  it('sums the WACC present values of the named items', () => {
    expect(waccValueSum(results, ['oandm', 'insurance', 'capital_recovery'])).toBe(588);
  });

  it('never falls back to the societal value', () => {
    expect(waccValueSum(results, ['wildfire_eac'])).toBeNull();
    expect(waccValueSum(results, ['oandm', 'wildfire_eac'])).toBeNull();
  });

  it('returns null when an item or the list is missing', () => {
    expect(waccValueSum(results, ['row_rent'])).toBeNull();
    expect(waccValueSum({}, ['oandm'])).toBeNull();
  });

  it('skips non-applying parts, sums applying line O&M, and returns 0 when all parts do not apply', () => {
    const partial = {
      taxonomy_results: [
        { taxonomy_id: 'oandm_line', value_pv_wacc: 80 },
        { taxonomy_id: 'oandm_converter', state: 'does_not_apply', value_pv_wacc: null },
      ],
    };
    expect(waccValueSum(partial, OANDM_PART_IDS)).toBe(80);

    const none = {
      taxonomy_results: [
        { taxonomy_id: 'oandm_line', state: 'does_not_apply', value_pv_wacc: null },
        { taxonomy_id: 'oandm_converter', state: 'does_not_apply', value_pv_wacc: null },
      ],
    };
    expect(waccValueSum(none, OANDM_PART_IDS)).toBe(0);
  });
});

describe('resolveWaccIds', () => {
  it('falls back to legacy ids when no part rows exist', () => {
    expect(
      resolveWaccIds(
        { taxonomy_results: [{ taxonomy_id: 'oandm', value_pv_wacc: 80 }] },
        OANDM_PART_IDS,
        ['oandm'],
      ),
    ).toEqual(['oandm']);
  });
});

describe('waccApplyingValueSum', () => {
  it('sums available WACC values and skips unavailable and non-applying items', () => {
    const partial = {
      taxonomy_results: [
        { taxonomy_id: 'congestion_benefit', available: false, value_pv_wacc: null },
        { taxonomy_id: 'delivered_energy_benefit', applies: false, value_pv_wacc: 0 },
        { taxonomy_id: 'capacity_value_benefit', value_pv_wacc: 42 },
      ],
    };
    expect(waccApplyingValueSum(partial, [
      'congestion_benefit',
      'delivered_energy_benefit',
      'capacity_value_benefit',
    ])).toBe(42);
  });
});
