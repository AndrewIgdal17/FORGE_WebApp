import { describe, expect, it } from 'vitest';

import { waccValueSum } from './perspective-values';

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
});
