import { describe, expect, it } from 'vitest';

import { terminalClickAction } from '@/lib/terminal-pick';

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
