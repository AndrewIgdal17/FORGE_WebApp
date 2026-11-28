import { describe, expect, it } from 'vitest';

import { terminalClickAction, terminalsAfterTypeChange } from '@/lib/terminal-pick';
import type { DraftTerminal } from '@/stores/scenario-store';

describe('terminalClickAction', () => {
  it('places a substation terminal for a substation hit on any project type', () => {
    expect(terminalClickAction({ kind: 'substation' }, 'greenfield', true)).toBe('place_substation');
    expect(terminalClickAction({ kind: 'substation' }, 'greenfield', false)).toBe('place_substation');
    expect(terminalClickAction({ kind: 'substation' }, 'reconductoring', true)).toBe('place_substation');
    expect(terminalClickAction({ kind: 'substation' }, 'rebuild', false)).toBe('place_substation');
    expect(terminalClickAction({ kind: 'substation' }, null, true)).toBe('place_substation');
  });

  it('never places a terminal on a line, and asks for a substation, for every project type', () => {
    for (const projectType of ['greenfield', 'reconductoring', 'rebuild', null]) {
      for (const zoomOk of [true, false]) {
        expect(terminalClickAction({ kind: 'line' }, projectType, zoomOk)).toBe('hint_pick_substation');
      }
    }
  });

  it('opens the point confirmation on empty map for greenfield when zoomed in', () => {
    expect(terminalClickAction({ kind: 'empty' }, 'greenfield', true)).toBe('confirm_point');
  });

  it('ignores an empty-map click for greenfield when zoomed out', () => {
    expect(terminalClickAction({ kind: 'empty' }, 'greenfield', false)).toBe('ignore');
  });

  it('asks for a substation on empty map for reconductoring and rebuild, zoomed in or out', () => {
    for (const projectType of ['reconductoring', 'rebuild']) {
      expect(terminalClickAction({ kind: 'empty' }, projectType, true)).toBe('hint_pick_substation');
      expect(terminalClickAction({ kind: 'empty' }, projectType, false)).toBe('hint_pick_substation');
    }
  });

  it('treats a missing project type as greenfield', () => {
    expect(terminalClickAction({ kind: 'empty' }, null, true)).toBe('confirm_point');
    expect(terminalClickAction({ kind: 'empty' }, null, false)).toBe('ignore');
  });
});

function sub(gid: number): DraftTerminal {
  return { substation_gid: gid, name: `Sub ${gid}`, point: [-97, 30] };
}

function point(lon: number): DraftTerminal {
  return { substation_gid: null, name: 'Point', point: [lon, 30] };
}

describe('terminalsAfterTypeChange', () => {
  it('leaves terminals alone for greenfield', () => {
    const pair = { sending: point(1), receiving: sub(2) };
    expect(terminalsAfterTypeChange(pair, null, 'greenfield')).toEqual({
      terminals: pair,
      pendingSending: null,
      restartAt: null,
      hint: false,
    });
  });

  it('keeps a substation-only pair when switching to reconductoring', () => {
    const pair = { sending: sub(1), receiving: sub(2) };
    const result = terminalsAfterTypeChange(pair, null, 'reconductoring');
    expect(result).toEqual({ terminals: pair, pendingSending: null, restartAt: null, hint: false });
  });

  it('drops a point receiving end and resumes picking at receiving with the substation sending kept', () => {
    const sending = sub(1);
    const result = terminalsAfterTypeChange({ sending, receiving: point(2) }, null, 'rebuild');
    expect(result).toEqual({
      terminals: undefined,
      pendingSending: sending,
      restartAt: 'receiving',
      hint: true,
    });
  });

  it('drops a point sending end and restarts at sending', () => {
    const result = terminalsAfterTypeChange({ sending: point(1), receiving: sub(2) }, null, 'reconductoring');
    expect(result).toEqual({ terminals: undefined, pendingSending: null, restartAt: 'sending', hint: true });
  });

  it('drops a pending point sending pick and restarts at sending', () => {
    const result = terminalsAfterTypeChange(undefined, point(1), 'reconductoring');
    expect(result).toEqual({ terminals: undefined, pendingSending: null, restartAt: 'sending', hint: true });
  });

  it('keeps a pending substation sending pick untouched', () => {
    const pending = sub(1);
    expect(terminalsAfterTypeChange(undefined, pending, 'reconductoring')).toEqual({
      terminals: undefined,
      pendingSending: pending,
      restartAt: null,
      hint: false,
    });
  });

  it('does nothing when there are no terminals', () => {
    expect(terminalsAfterTypeChange(undefined, null, 'rebuild')).toEqual({
      terminals: undefined,
      pendingSending: null,
      restartAt: null,
      hint: false,
    });
  });
});
