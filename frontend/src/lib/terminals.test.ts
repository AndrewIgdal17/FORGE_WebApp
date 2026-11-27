import { describe, expect, it } from 'vitest';
import type { MultiLineString } from 'geojson';

import { TERMINAL_TOLERANCE_M, haversineM, routeEndsMatch } from './terminals';

const EARTH_RADIUS_M = 6_371_008.8;

function northOf(origin: [number, number], meters: number): [number, number] {
  const degrees = (meters / EARTH_RADIUS_M) * (180 / Math.PI);
  return [origin[0], origin[1] + degrees];
}

function route(first: [number, number], last: [number, number]): MultiLineString {
  const mid: [number, number] = [(first[0] + last[0]) / 2, (first[1] + last[1]) / 2];
  return { type: 'MultiLineString', coordinates: [[first, mid, last]] };
}

describe('routeEndsMatch', () => {
  const sending: [number, number] = [-97.74, 30.27];
  const receiving: [number, number] = [-97.5, 30.4];

  it('accepts an end 99 m off and rejects an end 101 m off', () => {
    expect(TERMINAL_TOLERANCE_M).toBe(100);

    const sendingNear = northOf(sending, 99);
    const sendingFar = northOf(sending, 101);
    expect(haversineM(sending, sendingNear)).toBeCloseTo(99, 6);
    expect(haversineM(sending, sendingFar)).toBeCloseTo(101, 6);

    expect(routeEndsMatch(route(sendingNear, receiving), sending, receiving)).toEqual({ ok: true });

    const sendingMiss = routeEndsMatch(route(sendingFar, receiving), sending, receiving);
    expect(sendingMiss.ok).toBe(false);
    if (!sendingMiss.ok) {
      expect(sendingMiss.end).toBe('sending');
      expect(sendingMiss.distanceM).toBeCloseTo(101, 6);
    }

    const receivingNear = northOf(receiving, -99);
    const receivingFar = northOf(receiving, 101);
    expect(haversineM(receiving, receivingNear)).toBeCloseTo(99, 6);
    expect(haversineM(receiving, receivingFar)).toBeCloseTo(101, 6);
    expect(routeEndsMatch(route(sending, receivingNear), sending, receiving)).toEqual({ ok: true });

    const receivingMiss = routeEndsMatch(route(sending, receivingFar), sending, receiving);
    expect(receivingMiss.ok).toBe(false);
    if (!receivingMiss.ok) {
      expect(receivingMiss.end).toBe('receiving');
      expect(receivingMiss.distanceM).toBeCloseTo(101, 6);
    }
  });

  it('fails a reversed route on the sending end', () => {
    const result = routeEndsMatch(route(receiving, sending), sending, receiving);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.end).toBe('sending');
      expect(result.distanceM).toBeGreaterThan(TERMINAL_TOLERANCE_M);
    }
  });
});
