/**
 * What a click does while a terminal is being picked on the map.
 * Reconductoring and rebuild terminals are substations only; greenfield also
 * accepts a point on empty map (after the confirmation) when zoomed in enough.
 */
export type TerminalHit = { kind: 'substation' } | { kind: 'line' } | { kind: 'empty' };

export type TerminalClickAction =
  | 'place_substation'
  | 'confirm_point'
  | 'hint_pick_substation'
  | 'ignore';

export function terminalClickAction(
  hit: TerminalHit,
  projectType: string | null,
  zoomOk: boolean,
): TerminalClickAction {
  if (hit.kind === 'substation') return 'place_substation';
  if (hit.kind === 'line') return 'hint_pick_substation';
  if (projectType === 'reconductoring' || projectType === 'rebuild') {
    return 'hint_pick_substation';
  }
  return zoomOk ? 'confirm_point' : 'ignore';
}
