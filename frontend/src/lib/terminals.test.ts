import { describe, expect, it } from 'vitest';
import type { MultiLineString, MultiPolygon, Polygon } from 'geojson';

import {
  TERMINAL_TOLERANCE_M,
  haversineM,
  mismatchTransition,
  routeEndsMatch,
  routeFinishMessage,
} from './terminals';
import * as terminalLib from './terminals';

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

function boxAround(point: [number, number], halfDeg: number): Polygon {
  const [lon, lat] = point;
  return {
    type: 'Polygon',
    coordinates: [[
      [lon - halfDeg, lat - halfDeg],
      [lon + halfDeg, lat - halfDeg],
      [lon + halfDeg, lat + halfDeg],
      [lon - halfDeg, lat + halfDeg],
      [lon - halfDeg, lat - halfDeg],
    ]],
  };
}

describe('routeEndsMatch footprints', () => {
  const sending: [number, number] = [-97.74, 30.27];
  const receiving: [number, number] = [-97.5, 30.4];

  it('accepts an end 183 m inside the footprint', () => {
    const sendingOff = northOf(sending, 183);
    const receivingOff = northOf(receiving, -183);
    expect(haversineM(sending, sendingOff)).toBeCloseTo(183, 6);
    expect(haversineM(receiving, receivingOff)).toBeCloseTo(183, 6);

    const footprints = {
      sending: boxAround(sendingOff, 0.01),
      receiving: boxAround(receivingOff, 0.01),
    };
    expect(routeEndsMatch(route(sendingOff, receivingOff), sending, receiving, footprints)).toEqual({
      ok: true,
    });

    const multi: MultiPolygon = {
      type: 'MultiPolygon',
      coordinates: [boxAround(sendingOff, 0.01).coordinates],
    };
    expect(
      routeEndsMatch(route(sendingOff, receiving), sending, receiving, {
        sending: multi,
        receiving: null,
      }),
    ).toEqual({ ok: true });
    expect(terminalLib.TERMINAL_FOOTPRINT_MAX_M).toBe(1000);
  });

  it('refuses an end 1,200 m inside the footprint', () => {
    const sendingOff = northOf(sending, 1200);
    expect(haversineM(sending, sendingOff)).toBeCloseTo(1200, 6);

    const result = routeEndsMatch(route(sendingOff, receiving), sending, receiving, {
      sending: boxAround(sendingOff, 0.05),
      receiving: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.end).toBe('sending');
      expect(result.distanceM).toBeCloseTo(1200, 6);
    }
  });

  it('refuses an end 150 m outside the footprint', () => {
    const sendingOff = northOf(sending, 150);
    expect(haversineM(sending, sendingOff)).toBeCloseTo(150, 6);

    const result = routeEndsMatch(route(sendingOff, receiving), sending, receiving, {
      sending: boxAround(northOf(sending, -2000), 0.002),
      receiving: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.end).toBe('sending');
      expect(result.distanceM).toBeCloseTo(150, 6);
    }

    const near = northOf(sending, 99);
    expect(
      routeEndsMatch(route(near, receiving), sending, receiving, {
        sending: boxAround(northOf(sending, -2000), 0.002),
        receiving: null,
      }),
    ).toEqual({ ok: true });
  });

  it('keeps the 100 m test when no footprints are passed', () => {
    const sendingOff = northOf(sending, 150);
    const missed = routeEndsMatch(route(sendingOff, receiving), sending, receiving);
    expect(missed.ok).toBe(false);
    if (!missed.ok) {
      expect(missed.end).toBe('sending');
      expect(missed.distanceM).toBeCloseTo(150, 6);
    }

    const near = northOf(sending, 99);
    expect(routeEndsMatch(route(near, receiving), sending, receiving)).toEqual({ ok: true });

    const nullFootprints = { sending: null, receiving: null };
    const withNulls = routeEndsMatch(
      route(sendingOff, receiving),
      sending,
      receiving,
      nullFootprints,
    );
    expect(withNulls.ok).toBe(false);
    if (!withNulls.ok) {
      expect(withNulls.end).toBe('sending');
      expect(withNulls.distanceM).toBeCloseTo(150, 6);
    }
  });
});

describe('routeFinishMessage', () => {
  it('names the footprint rule and rounds the distance like the server', () => {
    expect(routeFinishMessage('sending', 150.4)).toBe(
      "The route's sending end is 150 m from the project's sending terminal; it must be within 100 m, or inside the substation's footprint and within 1 km.",
    );
    expect(routeFinishMessage('receiving', 250.7)).toBe(
      "The route's receiving end is 251 m from the project's receiving terminal; it must be within 100 m, or inside the substation's footprint and within 1 km.",
    );
  });
});

describe('mismatchTransition', () => {
  it('shows a message once, then clears it when the route later passes', () => {
    const fail = { ok: false as const, end: 'sending' as const, distanceM: 183 };
    const first = mismatchTransition(null, fail);
    expect(first.action).toBe('show');
    if (first.action !== 'show') throw new Error('expected show');
    expect(first.next).toBe(first.message);
    expect(mismatchTransition(first.next, fail).action).toBe('none');
    const cleared = mismatchTransition(first.next, { ok: true });
    expect(cleared).toEqual({ action: 'clear', next: null });
    expect(mismatchTransition(null, { ok: true })).toEqual({ action: 'none', next: null });
  });
});
