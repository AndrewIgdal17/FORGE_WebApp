import { describe, expect, it } from 'vitest';

import {
  hoverCorridorGidFilter,
  pieceLabel,
  shouldRecordPiece,
  lineSelectionStaleInView,
  nearestPointOnLine,
  overlappingCandidates,
  prefillChanges,
  routeFullyInMapView,
  selectionSummary,
  stretchEndForAssembly,
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

describe('stretchEndForAssembly', () => {
  const sending: [number, number] = [-97.74, 30.27];
  const piece: [number, number][] = [
    [-97.74, 30.271],
    [-97.74, 30.281],
  ];

  it('returns null when the receiving point is far from the chain', () => {
    const receiving: [number, number] = [-97.72, 30.28];
    expect(stretchEndForAssembly(sending, receiving, [piece], true)).toBeNull();
  });

  it('returns null when the receiving point is at the chain end', () => {
    const receiving: [number, number] = [-97.74, 30.281];
    expect(stretchEndForAssembly(sending, receiving, [piece], true)).toBeNull();
  });

  it('returns the receiving point when it lies on the chain away from the ends', () => {
    const receiving: [number, number] = [-97.74, 30.276];
    expect(stretchEndForAssembly(sending, receiving, [piece], true)).toEqual(receiving);
  });

  it('returns null for substation receiving terminals', () => {
    const receiving: [number, number] = [-97.74, 30.276];
    expect(stretchEndForAssembly(sending, receiving, [piece], false)).toBeNull();
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
describe('pieceLabel', () => {
  it('names voltage and both substations', () => {
    expect(
      pieceLabel({ voltage_kv: 138, sub_1: 'Reusens', sub_2: 'Opossum Creek' }),
    ).toBe('138 kV · Reusens – Opossum Creek');
  });

  it('rounds the voltage to whole kV', () => {
    expect(pieceLabel({ voltage_kv: 137.6, sub_1: 'A', sub_2: 'B' })).toBe('138 kV · A – B');
  });

  it('says the voltage is missing when it is null', () => {
    expect(pieceLabel({ voltage_kv: null, sub_1: 'A', sub_2: 'B' })).toBe(
      'voltage not in the data · A – B',
    );
  });

  it('says unnamed when neither substation is named', () => {
    expect(pieceLabel({ voltage_kv: 69, sub_1: null, sub_2: null })).toBe('69 kV · unnamed');
  });

  it('treats blank names as missing', () => {
    expect(pieceLabel({ voltage_kv: 69, sub_1: '  ', sub_2: '' })).toBe('69 kV · unnamed');
  });

  it('shows the one named substation when only one is named', () => {
    expect(pieceLabel({ voltage_kv: 69, sub_1: 'Reusens', sub_2: null })).toBe(
      '69 kV · Reusens',
    );
  });

  it('reads Saved piece when the piece details are unknown', () => {
    expect(pieceLabel({ details: 'unknown' })).toBe('Saved piece');
  });
});

describe('shouldRecordPiece', () => {
  const details = { voltage_kv: 138, sub_1: 'Reusens', sub_2: 'Opossum Creek' };

  it('records a gid that has no details yet', () => {
    expect(shouldRecordPiece({}, 45081, details)).toBe(true);
  });

  it('skips a gid whose details are unchanged', () => {
    expect(shouldRecordPiece({ 45081: details }, 45081, { ...details })).toBe(false);
  });

  it('records a gid whose voltage or names changed', () => {
    expect(shouldRecordPiece({ 45081: details }, 45081, { ...details, voltage_kv: 69 })).toBe(true);
    expect(shouldRecordPiece({ 45081: details }, 45081, { ...details, sub_2: 'Other' })).toBe(true);
    expect(shouldRecordPiece({ 45081: details }, 45081, { ...details, sub_1: null })).toBe(true);
  });
});
