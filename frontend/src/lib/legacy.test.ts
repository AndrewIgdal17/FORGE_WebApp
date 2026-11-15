import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(), auth: { getSession: vi.fn() } },
}));

import { LegacyBanner } from '@/components/results/legacy-banner';
import { ScenarioCard } from '@/components/scenarios/scenario-card';
import { LEGACY_BADGE, LEGACY_BANNER, isLegacyScenario } from '@/lib/legacy';
import type { Scenario } from '@/stores/scenario-store';

function scenario(route: Record<string, unknown> | null, segments: unknown[] | null = null): Scenario {
  return {
    id: 's', name: 'CTT_Actual_Delay2', source: 'user', defaults_id: 'd', changes: {}, results: {},
    calculator: null, inputs_id: null, computed_at: null, calc_error: null, revision: 1,
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', user_id: 'u',
    route, route_geojson: null, segments,
  };
}

function card(s: Scenario): string {
  const noop = () => {};
  return renderToStaticMarkup(createElement(ScenarioCard, {
    scenario: s, currentUserId: 'u', onOpen: noop, onRename: noop, onDuplicate: noop,
    onDelete: noop, onExportForge: noop, onExportCsv: noop,
  }));
}

describe('legacy scenarios (Spec 12 item 5)', () => {
  it('a scenario with no route and no segments is legacy', () => {
    expect(isLegacyScenario(scenario(null))).toBe(true);
    expect(isLegacyScenario(scenario({ type: 'MultiLineString' }))).toBe(false);
    expect(isLegacyScenario(scenario(null, [{}]))).toBe(false);
  });
  it('the scenario list card shows the badge only for legacy rows', () => {
    expect(LEGACY_BADGE).toBe('Legacy (no route)');
    expect(card(scenario(null))).toContain(LEGACY_BADGE);
    expect(card(scenario({ type: 'MultiLineString' }))).not.toContain(LEGACY_BADGE);
  });
  it('the results banner has the exact copy', () => {
    expect(LEGACY_BANNER).toBe(
      'Legacy scenario: no route is drawn, so these results do not follow the current method. Draw its route to recalculate.',
    );
    expect(renderToStaticMarkup(createElement(LegacyBanner))).toContain('Draw its route to recalculate.');
  });
});
