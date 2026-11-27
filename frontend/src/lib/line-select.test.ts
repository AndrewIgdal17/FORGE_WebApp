import { describe, expect, it } from 'vitest';

import {
  hoverCorridorGidFilter,
  lineSelectionStaleInView,
  nearestPointOnLine,
  overlappingCandidates,
  prefillChanges,
  routeFullyInMapView,
  selectionSummary,
  stretchTerminalName,
  toggleGid,
  type CorridorCandidate,
} from '@/lib/line-select';

describe('toggleGid', () => {
  it('appends a gid when it is not selected', () => {
    expect(toggleGid([1, 2], 3)).toEqual([1, 2, 3]);
  });

  it('removes a gid when it is already selected', () => {
    expect(toggleGid([1, 2, 3], 2)).toEqual([1, 3]);
  });
});

describe('overlappingCandidates', () => {
  const base = (gid: number, sub = 'a'): CorridorCandidate => ({
    gid,
    voltage_kv: 138,
    sub_1: sub,
    sub_2: 'b',
    source: 'hifld',
    circuits: 1,
  });

  it('returns two candidates when two distinct gids overlap at a click', () => {
    const result = overlappingCandidates([base(10), base(20, 'c')]);
    expect(result).toHaveLength(2);
    expect(result.map((row) => row.gid)).toEqual([10, 20]);
  });

  it('deduplicates the same gid twice', () => {
    const result = overlappingCandidates([base(10), base(10)]);
    expect(result).toHaveLength(1);
    expect(result[0]?.gid).toBe(10);
  });
});

describe('hoverCorridorGidFilter', () => {
  it('matches one corridor gid on the map', () => {
    expect(hoverCorridorGidFilter(12345)).toEqual(['==', ['get', 'gid'], 12345]);
  });

  it('matches no feature when hover is cleared', () => {
    expect(hoverCorridorGidFilter(null)).toEqual(['==', ['get', 'gid'], -1]);
  });
});

describe('nearestPointOnLine', () => {
  it('snaps to the closest point on a segment', () => {
    const coords: [number, number][] = [
      [0, 0],
      [10, 0],
    ];
    expect(nearestPointOnLine([5, 4], coords)).toEqual([5, 0]);
  });

  it('returns the sole vertex when the line is one point', () => {
    expect(nearestPointOnLine([1, 2], [[3, 4]])).toEqual([3, 4]);
  });
});

describe('stretchTerminalName', () => {
  it('includes rounded voltage when present', () => {
    expect(stretchTerminalName(138.2)).toBe('Point on 138 kV line');
  });

  it('omits voltage when missing', () => {
    expect(stretchTerminalName(null)).toBe('Point on line');
  });
});

describe('prefillChanges', () => {
  const paths = {
    old_ac_dc: '01_project_technical_details.project.old_ac_dc',
    old_capacity_mw: '01_project_technical_details.project.old_capacity_mw',
    old_conductor_type: '01_project_technical_details.project.old_conductor_type',
  };

  it('fills only empty old-line fields', () => {
    const current = {
      [paths.old_ac_dc]: 'AC',
      [paths.old_capacity_mw]: null,
      [paths.old_conductor_type]: '',
    };
    const result = prefillChanges(current, {
      old_ac_dc: 'DC',
      old_capacity_mw: 394,
      old_conductor_type: 'Standard Aluminum Conductor',
    });
    expect(result).toEqual({
      [paths.old_capacity_mw]: 394,
      [paths.old_conductor_type]: 'Standard Aluminum Conductor',
    });
  });

  it('keeps user-entered values', () => {
    const current = {
      [paths.old_capacity_mw]: 500,
    };
    const result = prefillChanges(current, { old_capacity_mw: 394 });
    expect(result).toEqual({});
  });
});

describe('routeFullyInMapView', () => {
  it('requires every vertex inside the viewport predicate', () => {
    const route = {
      coordinates: [
        [
          [0, 0],
          [1, 1],
        ],
      ],
    };
    const contains = (pt: [number, number]): boolean => pt[0] >= 0 && pt[0] <= 1;
    expect(routeFullyInMapView(route, contains)).toBe(true);
    expect(routeFullyInMapView(route, () => false)).toBe(false);
  });
});

describe('lineSelectionStaleInView', () => {
  it('does not flag when the route is not fully in view', () => {
    const rendered = new Set([10, 20]);
    expect(lineSelectionStaleInView([10, 20, 30], rendered, false, true)).toBe(false);
  });

  it('does not flag when corridor features have not rendered in the view yet', () => {
    expect(lineSelectionStaleInView([10, 20], new Set(), true, false)).toBe(false);
    expect(lineSelectionStaleInView([10], new Set(), true, false)).toBe(false);
  });

  it('flags when the route is in view, corridors loaded, and one stored gid is absent', () => {
    expect(lineSelectionStaleInView([10, 20], new Set([10]), true, true)).toBe(true);
  });

  it('flags when every stored gid is absent but other corridors are in view', () => {
    expect(lineSelectionStaleInView([10], new Set([99, 100]), true, true)).toBe(true);
    expect(lineSelectionStaleInView([10, 20], new Set([50]), true, true)).toBe(true);
  });
});

describe('selectionSummary', () => {
  it('formats pieces, miles, and connector lengths', () => {
    expect(
      selectionSummary(
        [{ miles: 12.0 }, { miles: 19.2 }],
        [{ length_m: 240 }, { length_m: 90 }],
      ),
    ).toBe('From line data: 2 pieces, 31.2 mi, connectors 240 m and 90 m');
  });

  it('reads no connectors when the list is empty', () => {
    expect(selectionSummary([{ miles: 5 }], [])).toBe(
      'From line data: 1 piece, 5.0 mi, no connectors',
    );
  });
});