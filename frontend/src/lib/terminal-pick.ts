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

type PickTerminal = { substation_gid: number | null; name: string; point: [number, number] };

export interface TerminalPair<T extends PickTerminal> {
  sending: T;
  receiving: T;
}

export interface TypeChangeTerminals<T extends PickTerminal> {
  terminals: TerminalPair<T> | undefined;
  pendingSending: T | null;
  /** Pick step to restart at, or null when no pick is needed. */
  restartAt: 'sending' | 'receiving' | null;
  /** True when a point terminal was dropped, so the user should be told to pick a substation. */
  hint: boolean;
}

/**
 * Drops point (non-substation) terminals when a draft becomes reconductoring
 * or rebuild, which accept substations only. A kept substation sending end
 * becomes the pending sending pick so picking resumes at receiving.
 */
export function terminalsAfterTypeChange<T extends PickTerminal>(
  terminals: TerminalPair<T> | undefined,
  pendingSending: T | null,
  projectType: string | null,
): TypeChangeTerminals<T> {
  const unchanged: TypeChangeTerminals<T> = {
    terminals,
    pendingSending,
    restartAt: null,
    hint: false,
  };
  if (projectType !== 'reconductoring' && projectType !== 'rebuild') return unchanged;
  const sendingKept =
    terminals && terminals.sending.substation_gid !== null ? terminals.sending : null;
  const receivingKept =
    terminals && terminals.receiving.substation_gid !== null ? terminals.receiving : null;
  const pendingKept =
    pendingSending && pendingSending.substation_gid !== null ? pendingSending : null;
  const hadPoint =
    (terminals !== undefined && (sendingKept === null || receivingKept === null)) ||
    (pendingSending !== null && pendingKept === null);
  if (!hadPoint) return unchanged;
  if (terminals !== undefined && sendingKept !== null && receivingKept !== null) {
    return { terminals, pendingSending: null, restartAt: null, hint: true };
  }
  if (sendingKept !== null) {
    return { terminals: undefined, pendingSending: sendingKept, restartAt: 'receiving', hint: true };
  }
  return { terminals: undefined, pendingSending: null, restartAt: 'sending', hint: true };
}
