import type { Feature, MultiPolygon, Polygon } from 'geojson';
import { describe, expect, it } from 'vitest';

import {
  REGION_CODES,
  REGION_NAMES,
  REGION_SUGGEST_MAX_M,
  REGION_TOLERANCE_M,
  regionShapes,
  sortRegions,
  terminalRegionCheck,
} from './regions';
import type { RegionShape } from './regions';

// Synthetic 1-degree squares on the equator. One degree of longitude there is
// about 111.2 km, so an offset of N km is N / 111.2 degrees.
const KM_PER_DEG = 111.195;

function square(code: string, west: number, south: number, east: number, north: number): RegionShape {
  const geometry: Polygon = {
    type: 'Polygon',
    coordinates: [[
      [west, south],
      [east, south],
      [east, north],
      [west, north],
      [west, south],
    ]],
  };
  return { code, geometry };
}

// WECC is ticked. TRE is an unticked square 5 km west of a point 40 km west of WECC.
const WECC = square('WECC', 0, 0, 1, 1);
const TRE = square('TRE', -0.9, 0, -0.405, 1);
const FAR = square('NPCC', 5, 0, 6, 1);
const SHAPES: RegionShape[] = [WECC, TRE, FAR];

describe('sortRegions', () => {
  it('orders codes as the server does and drops duplicates', () => {
    expect(sortRegions(['SERC', 'WECC', 'SERC', 'RF'])).toEqual(['WECC', 'RF', 'SERC']);
  });

  it('returns an empty list for no codes', () => {
    expect(sortRegions([])).toEqual([]);
  });
});

describe('region constants', () => {
  it('match the server codes, order, and names', () => {
    expect(REGION_CODES).toEqual(['WECC', 'TRE', 'MRO', 'NPCC', 'RF', 'SERC']);
    expect(REGION_NAMES).toEqual({
      WECC: 'WECC',
      TRE: 'Texas RE',
      MRO: 'MRO',
      NPCC: 'NPCC',
      RF: 'ReliabilityFirst',
      SERC: 'SERC',
    });
  });

  it('uses the server tolerance and suggestion distances', () => {
    expect(REGION_TOLERANCE_M).toBe(25000);
    expect(REGION_SUGGEST_MAX_M).toBe(100000);
  });
});

describe('regionShapes', () => {
  it('keeps the code and geometry of each feature', () => {
    const polygon = WECC.geometry as Polygon;
    const geometry: MultiPolygon = { type: 'MultiPolygon', coordinates: [polygon.coordinates] };
    const feature: Feature<MultiPolygon | Polygon, { code: string; name: string }> = {
      type: 'Feature',
      properties: { code: 'WECC', name: 'WECC' },
      geometry,
    };
    const shapes = regionShapes({ type: 'FeatureCollection', features: [feature] });
    expect(shapes).toEqual([{ code: 'WECC', geometry }]);
  });
});

describe('terminalRegionCheck', () => {
  it('accepts a terminal inside a ticked region', () => {
    expect(terminalRegionCheck([0.5, 0.5], ['WECC'], SHAPES)).toEqual({ ok: true });
  });

  it('accepts a terminal 10 km outside a ticked region', () => {
    const point: [number, number] = [-10 / KM_PER_DEG, 0.5];
    expect(terminalRegionCheck(point, ['WECC'], SHAPES)).toEqual({ ok: true });
  });

  it('refuses a terminal 40 km outside and suggests the unticked region 5 km away', () => {
    const point: [number, number] = [-40 / KM_PER_DEG, 0.5];
    expect(terminalRegionCheck(point, ['WECC'], SHAPES)).toEqual({
      ok: false,
      suggested: 'TRE',
    });
  });

  it('suggests nothing when the nearest unticked region is far away', () => {
    const point: [number, number] = [-300 / KM_PER_DEG, 0.5];
    expect(terminalRegionCheck(point, ['WECC'], SHAPES)).toEqual({
      ok: false,
      suggested: null,
    });
  });

  it('with no ticked regions, suggests the region that contains the terminal', () => {
    expect(terminalRegionCheck([0.5, 0.5], [], SHAPES)).toEqual({
      ok: false,
      suggested: 'WECC',
    });
  });

  it('does not suggest a region that is already ticked', () => {
    const point: [number, number] = [-40 / KM_PER_DEG, 0.5];
    expect(terminalRegionCheck(point, ['WECC', 'TRE'], SHAPES)).toEqual({ ok: true });
  });
});
