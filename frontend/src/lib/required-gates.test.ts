import { describe, expect, it } from 'vitest';

import type { RequiredField, RequiredResponse } from './api';
import { canCalculate, canDraw, panelFields } from './required-gates';

const GREENFIELD = '17_congestion_reductions.greenfield_congestion_reductions';
const INCREMENTAL = '17_congestion_reductions.incremental_congestion_reductions';

function requiredField(
  path: string,
  label: string,
  stage: RequiredField['stage'],
): RequiredField {
  return { path, label, stage, message: `${label} is required.` };
}

const flow = requiredField(
  `${GREENFIELD}.constraints.flow_factor`,
  'Flow Factor',
  'before_route',
);
const exceedance = requiredField(
  `${GREENFIELD}.constraints.average_exceedance`,
  'Average exceedance (MW)',
  'after_route',
);
const incrementalExceedance = requiredField(
  `${INCREMENTAL}.constraints.average_exceedance`,
  'Incremental average exceedance (MW)',
  'after_route',
);

const empty: RequiredResponse = { before_route: [], after_route: [] };

describe('canDraw', () => {
  it('is true only when before_route is empty', () => {
    expect(canDraw(empty)).toBe(true);
    expect(canDraw({ before_route: [], after_route: [exceedance] })).toBe(true);
    expect(canDraw({ before_route: [flow], after_route: [] })).toBe(false);
    expect(canDraw({ before_route: [flow], after_route: [exceedance, incrementalExceedance] })).toBe(
      false,
    );
  });
});

describe('canCalculate', () => {
  it('is true only when a route is present and both lists are empty', () => {
    expect(canCalculate(empty, false)).toBe(false);
    expect(canCalculate(empty, true)).toBe(true);
    expect(canCalculate({ before_route: [flow], after_route: [] }, true)).toBe(false);
    expect(canCalculate({ before_route: [], after_route: [exceedance] }, true)).toBe(false);
    expect(canCalculate({ before_route: [flow], after_route: [incrementalExceedance] }, true)).toBe(
      false,
    );
    expect(canCalculate({ before_route: [], after_route: [exceedance] }, false)).toBe(false);
  });
});

describe('panelFields', () => {
  it('returns after_route when a route is present, and nothing otherwise', () => {
    const required: RequiredResponse = {
      before_route: [flow],
      after_route: [exceedance, incrementalExceedance],
    };
    expect(panelFields(required, false)).toEqual([]);
    expect(panelFields(required, true)).toEqual([exceedance, incrementalExceedance]);
    expect(panelFields(empty, true)).toEqual([]);
    expect(panelFields(empty, false)).toEqual([]);
  });
});

describe('existing scenario with a route and a missing exceedance', () => {
  const required: RequiredResponse = { before_route: [], after_route: [exceedance] };

  it('blocks calculation and lists the exceedance', () => {
    expect(canDraw(required)).toBe(true);
    expect(canCalculate(required, true)).toBe(false);
    expect(panelFields(required, true)).toEqual([exceedance]);
    expect(panelFields(required, true).map((field) => field.message)).toEqual([
      'Average exceedance (MW) is required.',
    ]);
  });
});
