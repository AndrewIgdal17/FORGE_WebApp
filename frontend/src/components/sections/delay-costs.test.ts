import { describe, expect, it } from 'vitest';

import { directDelayCostLabel } from '@/components/sections/delay-costs';

describe('directDelayCostLabel', () => {
  it('adds , required when delay years is above zero', () => {
    expect(directDelayCostLabel(2)).toMatch(/, required$/);
  });

  it('omits , required when delay years is zero or missing', () => {
    expect(directDelayCostLabel(0)).not.toMatch(/, required$/);
    expect(directDelayCostLabel(null)).not.toMatch(/, required$/);
  });
});