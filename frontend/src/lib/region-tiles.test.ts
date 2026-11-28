import type { LineString, MultiLineString, MultiPolygon, Polygon } from 'geojson';
import { describe, expect, it } from 'vitest';

import {
  REGION_FILTERED_LAYERS,
  TILE_ORIGIN,
  heavySourceSpec,
  paddedBounds,
  regionMaskGeometry,
  regionTileUrl,
  tickedBounds,
  unlistedRegionsOnRoute,
} from './region-tiles';
import type { RegionShape } from './regions';

// Synthetic 1-degree squares on the equator, as in regions.test.ts.
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

const WECC = square('WECC', 0, 0, 1, 1);
const TRE = square('TRE', 2, 0, 3, 1);
const MRO = square('MRO', 4, 0, 5, 1);
const SHAPES: RegionShape[] = [WECC, TRE, MRO];

describe('REGION_FILTERED_LAYERS', () => {
  it('lists the four heavy layers', () => {
    expect(REGION_FILTERED_LAYERS).toEqual([
      'ref.corridors',
      'ref.substations_display',
      'ref.highways_nhs',
      'ref.rail_narn',
    ]);
  });
});

describe('regionTileUrl', () => {
  it('builds the function-source tile URL with a literal comma and unencoded placeholders', () => {
    expect(regionTileUrl('ref.corridors', ['WECC', 'MRO'])).toBe(
      'https://tiles.forge-calc.com/ref.corridors_by_region/{z}/{x}/{y}?regions=WECC,MRO',
    );
  });

  it('gives the same URL for the same regions in any order', () => {
    const forward = regionTileUrl('ref.corridors', ['SERC', 'MRO']);
    const backward = regionTileUrl('ref.corridors', ['MRO', 'SERC']);
    expect(forward).toBe(backward);
    expect(forward).toBe(`${TILE_ORIGIN}/ref.corridors_by_region/{z}/{x}/{y}?regions=MRO,SERC`);
  });

  it('sorts in REGION_CODES order and drops duplicates', () => {
    expect(regionTileUrl('ref.rail_narn', ['SERC', 'WECC', 'SERC'])).toContain('?regions=WECC,SERC');
  });

  it('uses the tile origin constant', () => {
    expect(TILE_ORIGIN).toBe('https://tiles.forge-calc.com');
  });
});

describe('paddedBounds', () => {
  it('expands each side by 10 percent of the width and height by default', () => {
    expect(paddedBounds([-100, 30, -90, 40])).toEqual([-101, 29, -89, 41]);
  });

  it('takes the pad as a parameter', () => {
    expect(paddedBounds([0, 0, 10, 20], 0.5)).toEqual([-5, -10, 15, 30]);
  });

  it('clamps to valid longitude and latitude', () => {
    expect(paddedBounds([-179, -89, 179, 89], 0.5)).toEqual([-180, -90, 180, 90]);
  });
});

describe('tickedBounds', () => {
  it('is the bounding box of the ticked shapes only', () => {
    expect(tickedBounds(SHAPES, ['TRE', 'MRO'])).toEqual([2, 0, 5, 1]);
  });

  it('is null when no region is ticked', () => {
    expect(tickedBounds(SHAPES, [])).toBeNull();
  });
});

/** Shoelace sum: its sign gives the ring's orientation. */
function orientation(ring: readonly (readonly number[])[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x1, y1] = ring[i] as [number, number];
    const [x2, y2] = ring[i + 1] as [number, number];
    sum += (x2 - x1) * (y2 + y1);
  }
  return Math.sign(sum);
}

describe('heavySourceSpec', () => {
  it('serves a project from the region query with the zoom range and promoteId', () => {
    expect(heavySourceSpec('ref.corridors', ['WECC'])).toEqual({
      type: 'vector',
      tiles: ['https://tiles.forge-calc.com/ref.corridors_by_region/{z}/{x}/{y}?regions=WECC'],
      minzoom: 0,
      maxzoom: 22,
      promoteId: 'gid',
    });
  });

  it('serves the plain tile template when no regions are set', () => {
    expect(heavySourceSpec('ref.highways_nhs', [])).toEqual({
      type: 'vector',
      tiles: ['https://tiles.forge-calc.com/ref.highways_nhs/{z}/{x}/{y}'],
      minzoom: 0,
      maxzoom: 22,
      promoteId: 'gid',
    });
  });
});

describe('regionMaskGeometry', () => {
  it('winds every hole opposite to the outer world ring', () => {
    const mask = regionMaskGeometry(SHAPES, ['WECC', 'TRE', 'MRO']);
    const [outer, ...holes] = mask.geometry.coordinates;
    expect(holes).toHaveLength(3);
    for (const hole of holes) {
      expect(orientation(hole)).toBe(-orientation(outer as number[][]));
    }
  });

  it('is a world polygon with the ticked outer rings as holes', () => {
    const mask = regionMaskGeometry(SHAPES, ['WECC']);
    expect(mask.type).toBe('Feature');
    expect(mask.geometry.type).toBe('Polygon');
    const [outer, ...holes] = mask.geometry.coordinates;
    expect(outer).toEqual([
      [-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85],
    ]);
    // Holes are reversed so they wind opposite to the world ring.
    expect(holes).toEqual([[...WECC.geometry.coordinates[0]].reverse()]);
  });

  it('uses each polygon of a MultiPolygon as a hole', () => {
    const multi: MultiPolygon = {
      type: 'MultiPolygon',
      coordinates: [
        [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
        [[[3, 0], [4, 0], [4, 1], [3, 1], [3, 0]]],
      ],
    };
    const shapes: RegionShape[] = [{ code: 'RF', geometry: multi }];
    const mask = regionMaskGeometry(shapes, ['RF']);
    expect(mask.geometry.coordinates).toHaveLength(3);
  });

  it('ignores unticked shapes', () => {
    const mask = regionMaskGeometry(SHAPES, ['MRO']);
    expect(mask.geometry.coordinates).toHaveLength(2);
    expect(mask.geometry.coordinates[1]).toEqual([...MRO.geometry.coordinates[0]].reverse());
  });
});

function route(...lines: Array<Array<[number, number]>>): MultiLineString {
  return { type: 'MultiLineString', coordinates: lines } as MultiLineString;
}

describe('unlistedRegionsOnRoute', () => {
  it('returns the unticked region a route runs through', () => {
    // Runs west to east through the middle of WECC, then TRE.
    const line = route([[0.5, 0.5], [2.5, 0.5]]);
    expect(unlistedRegionsOnRoute(line, ['WECC'], SHAPES)).toEqual(['TRE']);
  });

  it('finds a region crossed between two far-apart vertices', () => {
    const line = route([[-0.5, 0.5], [5.5, 0.5]]);
    expect(unlistedRegionsOnRoute(line, ['WECC'], SHAPES)).toEqual(['TRE', 'MRO']);
  });

  it('returns nothing for a route that stays in ticked regions', () => {
    const line = route([[0.1, 0.1], [0.9, 0.9]]);
    expect(unlistedRegionsOnRoute(line, ['WECC'], SHAPES)).toEqual([]);
  });

  it('returns nothing for a route that stays in the gap between regions', () => {
    const line = route([[1.2, 0.5], [1.8, 0.5]]);
    expect(unlistedRegionsOnRoute(line, ['WECC'], SHAPES)).toEqual([]);
  });

  it('returns nothing when there is no route', () => {
    expect(unlistedRegionsOnRoute(null, ['WECC'], SHAPES)).toEqual([]);
  });

  it('checks every line of a MultiLineString', () => {
    const line = route([[0.1, 0.1], [0.2, 0.2]], [[2.5, 0.5], [2.6, 0.6]]);
    expect(unlistedRegionsOnRoute(line, ['WECC'], SHAPES)).toEqual(['TRE']);
  });

  it('ignores lines with fewer than two positions', () => {
    const line: MultiLineString = {
      type: 'MultiLineString',
      coordinates: [[[2.5, 0.5]] as unknown as LineString['coordinates']],
    };
    expect(unlistedRegionsOnRoute(line, ['WECC'], SHAPES)).toEqual([]);
  });
});
