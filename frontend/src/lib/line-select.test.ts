import { describe, expect, it } from 'vitest';

import {
  overlappingCandidates,
  selectionSummary,
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