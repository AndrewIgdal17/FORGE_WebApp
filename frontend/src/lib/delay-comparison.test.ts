import { describe, expect, it } from 'vitest';

import {
  baselineSentence,
  equalBaselineSentence,
  readDelayComparison,
} from './delay-comparison';
import { CTT_ACTUAL_DELAY2_BLOCK, SUNZIA_DELAY2_BLOCK } from './delay-comparison.fixtures';
import { excludesNote } from './results-utils';

describe('readDelayComparison', () => {
  it('reads a v5 block with omitted lists', () => {
    const v = readDelayComparison({ delay_comparison: SUNZIA_DELAY2_BLOCK })!;
    expect(v).toEqual({ baselineYears: 0, delayYears: 2, onTimeRun: true, cong: null, avoid: null,
      forgone: null, total: -541002927.9687195,
      omittedForgone: ['avoided_emissions_benefit', 'congestion_benefit'],
      omittedTotal: ['avoided_emissions_benefit', 'congestion_benefit', 'emissions_comp', 'line_loss_conductor', 'line_loss_converter'], notApplying: new Set() });
  });

  it('reads a v4 block without omitted as empty lists and keeps a measured zero', () => {
    const v = readDelayComparison({ delay_comparison: CTT_ACTUAL_DELAY2_BLOCK })!;
    expect(v.avoid).toBe(0); expect(v.cong).toBe(9218180.332145989);
    expect(v.omittedForgone).toEqual([]); expect(v.omittedTotal).toEqual([]);
  });

  it('returns null for a missing or null block', () => {
    expect(readDelayComparison({})).toBeNull();
    expect(readDelayComparison({ delay_comparison: null })).toBeNull();
    expect(readDelayComparison(null)).toBeNull();
  });

  it('treats non-numeric values as null, never zero', () => {
    const v = readDelayComparison({ delay_comparison: { ...SUNZIA_DELAY2_BLOCK, delta_nb_delay: 'x' } })!;
    expect(v.total).toBeNull();
  });

  it('writes the baseline sentences', () => {
    const base = readDelayComparison({ delay_comparison: SUNZIA_DELAY2_BLOCK })!;
    expect(baselineSentence(base)).toBe('Compared with the same project built on time (this project: 2-year delay).');
    expect(baselineSentence({ ...base, baselineYears: 3, delayYears: 7 }))
      .toBe('Compared with the same project built with a 3-year delay (this project: 7 years).');
    expect(equalBaselineSentence({ ...base, baselineYears: 4, delayYears: 4, onTimeRun: false }))
      .toBe("This project's delay equals the baseline (4 years), so there is no cost of delay to report.");
  });

  it('labels every omittable v5 id and passes unknown ids through', () => {
    expect(excludesNote(['delivered_energy_benefit', 'line_loss_converter'])).toBe('Excludes: Delivered energy, Converter losses.');
    expect(excludesNote(['future_id'])).toBe('Excludes: future_id.');
  });
});
