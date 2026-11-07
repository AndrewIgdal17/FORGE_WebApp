import { describe, expect, it } from 'vitest';
import type { MultiLineString } from 'geojson';

import { finishedRouteStep, ROW_WIDTH_REQUIRED } from './finished-route';

const route: MultiLineString = {
  type: 'MultiLineString',
  coordinates: [[[-97.74, 30.27], [-96.8, 32.78]]],
};

const other: MultiLineString = {
  type: 'MultiLineString',
  coordinates: [[[-100, 31], [-99, 32]]],
};

describe('finishedRouteStep', () => {
  it('keeps a finished line and skips analysis when width is missing or non-positive', () => {
    const segments = [{ id: 0 }];
    for (const width of [null, 0, -5]) {
      expect(finishedRouteStep(route, width, { route, segments })).toEqual({
        kind: 'pending',
        route,
        segments,
        message: ROW_WIDTH_REQUIRED,
      });
    }
    expect(finishedRouteStep(route, null, null)).toEqual({
      kind: 'pending',
      route,
      segments: null,
      message: ROW_WIDTH_REQUIRED,
    });
    expect(finishedRouteStep(route, null, { route: other, segments })).toEqual({
      kind: 'pending',
      route,
      segments: null,
      message: ROW_WIDTH_REQUIRED,
    });
  });

  it('analyzes only when the width is positive', () => {
    expect(finishedRouteStep(route, 100, null)).toEqual({
      kind: 'analyze',
      route,
      rowWidthFt: 100,
    });
    expect(finishedRouteStep(null, null, null)).toEqual({ kind: 'none' });
    expect(finishedRouteStep(null, 100, null)).toEqual({ kind: 'none' });
  });
});
