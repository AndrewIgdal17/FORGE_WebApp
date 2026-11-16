import { describe, expect, it } from 'vitest';

import { LOAD_SHED_HELP } from '@/components/sections/outage-risk';

const OUTAGE_RISK_SOURCE = import.meta.glob(
  './outage-risk.tsx',
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

const EXACT_HELP =
  "Share of lost power shed as unserved energy and priced at the value of lost load. Default 0.05 for AC and DC lines alike (ENTSO-E 2021). The rest is redispatched at the route's congestion spread.";

describe('outage risk inputs (Spec 18 Task 6)', () => {
  it('LOAD_SHED_HELP matches the method copy', () => {
    expect(LOAD_SHED_HELP).toBe(EXACT_HELP);
  });

  it('outage-risk source has no redispatch cost field or auto share branches', () => {
    const source = OUTAGE_RISK_SOURCE['./outage-risk.tsx'] ?? '';
    expect(source).not.toContain('redispatch_cost_per_mwh');
    expect(source).not.toContain('loadShedAutomatic');
    expect(source).not.toContain('autoLoadShed');
    expect(source).not.toMatch(/LOAD_SHED_PATH[^;]*'auto'/);
  });
});