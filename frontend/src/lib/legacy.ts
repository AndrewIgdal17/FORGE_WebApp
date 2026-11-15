/** Spec 12 item 5: a scenario without a drawn route predates the route rule. */
export const LEGACY_BADGE = 'Legacy (no route)';

export const LEGACY_BANNER =
  'Legacy scenario: no route is drawn, so these results do not follow the current method. Draw its route to recalculate.';

export function isLegacyScenario(scenario: {
  route: Record<string, unknown> | null;
  segments: unknown[] | null;
}): boolean {
  return scenario.route == null && !(Array.isArray(scenario.segments) && scenario.segments.length > 0);
}
