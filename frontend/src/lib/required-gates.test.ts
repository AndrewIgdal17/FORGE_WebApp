import { describe, expect, it } from 'vitest';

import type { RequiredField, RequiredResponse } from './api';
import { canCalculate, canDraw, panelFields } from './required-gates';

const PROJECT = '01_project_technical_details.project';
const GREENFIELD = '17_congestion_reductions.greenfield_congestion_reductions';

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
const energy = requiredField(
  `${PROJECT}.value_of_load_per_mwh`,
  'Receiving-end energy value ($/MWh)',
  'after_route',
);
const spread = requiredField(
  `${GREENFIELD}.prices.average_congestion_price`,
  'Congestion spread ($/MWh, mean over all 8,760 hours)',
  'after_route',
);

const empty: RequiredResponse = { before_route: [], after_route: [] };

describe('canDraw', () => {
  it('is true only when before_route is empty', () => {
    expect(canDraw(empty)).toBe(true);
    expect(canDraw({ before_route: [], after_route: [energy] })).toBe(true);
    expect(canDraw({ before_route: [flow], after_route: [] })).toBe(false);
    expect(canDraw({ before_route: [flow], after_route: [energy, spread] })).toBe(false);
  });
});

describe('canCalculate', () => {
  it('is true only when a route is present and both lists are empty', () => {
    expect(canCalculate(empty, false)).toBe(false);
    expect(canCalculate(empty, true)).toBe(true);
    expect(canCalculate({ before_route: [flow], after_route: [] }, true)).toBe(false);
    expect(canCalculate({ before_route: [], after_route: [spread] }, true)).toBe(false);
    expect(canCalculate({ before_route: [flow], after_route: [energy] }, true)).toBe(false);
    expect(canCalculate({ before_route: [], after_route: [energy] }, false)).toBe(false);
  });
});

describe('panelFields', () => {
  it('returns after_route when a route is present, and nothing otherwise', () => {
    const required: RequiredResponse = {
      before_route: [flow],
      after_route: [spread, energy],
    };
    expect(panelFields(required, false)).toEqual([]);
    expect(panelFields(required, true)).toEqual([spread, energy]);
    expect(panelFields(empty, true)).toEqual([]);
    expect(panelFields(empty, false)).toEqual([]);
  });
});

describe('existing scenario with a route and a missing energy value', () => {
  const required: RequiredResponse = { before_route: [], after_route: [energy] };

  it('blocks calculation and lists the energy value', () => {
    expect(canDraw(required)).toBe(true);
    expect(canCalculate(required, true)).toBe(false);
    expect(panelFields(required, true)).toEqual([energy]);
    expect(panelFields(required, true).map((field) => field.message)).toEqual([
      'Receiving-end energy value ($/MWh) is required.',
    ]);
  });
});
