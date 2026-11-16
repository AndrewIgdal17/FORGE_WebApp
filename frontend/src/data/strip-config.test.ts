import { expect, it } from 'vitest';

import { STRIP_CONFIG, getStripConfig, readFigureValue } from '@/data/strip-config';
import { SUNZIA_DELAY2_BLOCK } from '@/lib/delay-comparison.fixtures';

it('delay strips show the direct cost and the total cost of delay (acceptance 8)', () => {
  const t = getStripConfig('timeline')!, d = getStripConfig('delay-costs')!;
  expect(t.figures.map((f) => f.label)).toEqual(['Direct delay cost (PV)', 'Total cost of delay']);
  expect(d.figures.map((f) => f.label)).toEqual(['Direct delay cost (PV)']);
  for (const c of [t, d]) {
    expect(JSON.stringify(c)).not.toContain('total_delay_pv');
    expect(c.title.toLowerCase()).not.toContain('constraint');
  }
  expect(readFigureValue(t.figures[1], { delay_comparison: SUNZIA_DELAY2_BLOCK })).toBe(-541002927.9687195);
  expect(readFigureValue(t.figures[1], {})).toBeNull();
});
it('no web-owned label reads Base Delay (acceptance 9)', () => {
  const sources = import.meta.glob('../**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
  const hits = Object.entries(sources).filter(([f, s]) => !f.endsWith('.test.ts') && /Base Delay/.test(s)).map(([f]) => f);
  expect(hits).toEqual([]);
});

it('economic-details strip is removed; system-constraints leads with energy benefits (Spec 18)', () => {
  expect(STRIP_CONFIG['economic-details']).toBeUndefined();
  const labels = STRIP_CONFIG['system-constraints']!.figures.map((f) => f.label);
  expect(labels.slice(0, 2)).toEqual(['Delivered Energy PV', 'Capacity Value PV']);
});

it('outage-risk strip lists load shed and redispatch PV after outage total', () => {
  const labels = STRIP_CONFIG['outage-risk']!.figures.map((f) => f.label);
  expect(labels).toContain('Load Shed PV');
  expect(labels).toContain('Redispatch PV');
  const outageIdx = labels.indexOf('Outage PV');
  expect(labels.indexOf('Load Shed PV')).toBeGreaterThan(outageIdx);
  expect(labels.indexOf('Redispatch PV')).toBeGreaterThan(outageIdx);
});
