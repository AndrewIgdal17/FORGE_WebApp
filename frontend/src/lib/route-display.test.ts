import { describe, expect, it } from 'vitest';
import type { MultiLineString } from 'geojson';

import { solidRouteGeometry } from '@/lib/route-display';

describe('solidRouteGeometry', () => {
  it('removes connector vertices from the solid route stroke', () => {
    const route: MultiLineString = {
      type: 'MultiLineString',
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [2, 0],
          [3, 0],
          [4, 0],
        ],
      ],
    };
    const solid = solidRouteGeometry(route, [
      { end: 'sending', coordinates: [[0, 0], [1, 0]] },
      { end: 'receiving', coordinates: [[3, 0], [4, 0]] },
    ]);
    expect(solid?.coordinates[0]).toEqual([
      [1, 0],
      [2, 0],
      [3, 0],
    ]);
  });

  it('leaves the route unchanged when there are no connectors', () => {
    const route: MultiLineString = {
      type: 'MultiLineString',
      coordinates: [[[0, 0], [2, 0]]],
    };
    expect(solidRouteGeometry(route, [])).toEqual(route);
  });
});