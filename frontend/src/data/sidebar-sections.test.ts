import { expect, test } from 'vitest';

import { SIDEBAR_SECTIONS } from './sidebar-sections';

test('sidebar has no energy-mix section or energy source mix sub-item', () => {
  const sections = [...SIDEBAR_SECTIONS.inputs, ...SIDEBAR_SECTIONS.results];
  const ids = sections.map((section) => section.id);
  const subIds = sections.flatMap((section) => section.subItems.map((item) => item.id));

  expect(ids).not.toContain('energy-mix');
  expect(subIds).not.toContain('energy-emissions-energy');
});

test('sidebar has no Value of Energy section (Spec 18)', () => {
  const subIds = SIDEBAR_SECTIONS.inputs.flatMap((section) => section.subItems.map((item) => item.id));
  expect(subIds).not.toContain('economic-details');
});
