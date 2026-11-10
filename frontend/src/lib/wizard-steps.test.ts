import { describe, expect, it } from 'vitest';

import type { RequiredField, RequiredResponse } from './api';
import { STEP_ORDER, projectTypes, stepBlocked, stepFields } from './wizard-steps';

const PROJECT = '01_project_technical_details.project';
const TIMELINE = '01_project_technical_details.timeline';
const GREENFIELD = '17_congestion_reductions.greenfield_congestion_reductions';
const INCREMENTAL = '17_congestion_reductions.incremental_congestion_reductions';
const CAPACITY_VALUE = '20_capacity_value';

const DELAY = `${TIMELINE}.delay_years`;
const CONSTRUCTION = `${TIMELINE}.construction_years`;
const LIFETIME = `${TIMELINE}.project_lifetime`;
const FLOW = `${GREENFIELD}.constraints.flow_factor`;
const CONTRACT = `${PROJECT}.dedicated_resource.contract_price_per_mwh`;
const CO2E = `${PROJECT}.dedicated_resource.emission_rate_kg_per_mwh.co2e`;
const SO2 = `${PROJECT}.dedicated_resource.emission_rate_kg_per_mwh.so2`;
const NOX = `${PROJECT}.dedicated_resource.emission_rate_kg_per_mwh.nox`;
const RATING = `${PROJECT}.capacity_mw`;

function requiredField(
  path: string,
  label: string,
  stage: RequiredField['stage'] = 'before_route',
): RequiredField {
  return { path, label, stage, message: `${label} is required.` };
}

describe('STEP_ORDER', () => {
  it('walks name, project, timeline, then benefits', () => {
    expect(STEP_ORDER).toEqual(['name', 'project', 'timeline', 'benefits']);
  });
});

describe('projectTypes', () => {
  it('offers greenfield, reconductoring, and rebuild', () => {
    expect(projectTypes()).toEqual(['greenfield', 'reconductoring', 'rebuild']);
  });
});

describe('stepFields', () => {
  it('gives the name step no calculator path', () => {
    expect(stepFields('name')).toEqual([]);
  });

  it('gives the project step its calculator paths, excluding derived voltage', () => {
    expect(stepFields('project')).toEqual([
      `${PROJECT}.project_type`,
      `${PROJECT}.construction_type`,
      `${PROJECT}.ac_dc`,
      RATING,
      `${PROJECT}.conductor_type`,
      `${PROJECT}.converter_type`,
      `${PROJECT}.number_of_converters`,
      `${PROJECT}.old_capacity_mw`,
      `${PROJECT}.old_ac_dc`,
      `${PROJECT}.old_conductor_type`,
      `${PROJECT}.old_converter_type`,
    ]);
    expect(stepFields('project').some((path) => path.includes('voltage_kv'))).toBe(false);
    expect(stepFields('project').some((path) => path.includes('number_of_circuits_poles'))).toBe(
      false,
    );
  });

  it('gives the timeline step delay, construction, and lifetime', () => {
    expect(stepFields('timeline')).toEqual([DELAY, CONSTRUCTION, LIFETIME]);
  });

  it('gives the benefits step the flow share and the dedicated paths', () => {
    expect(stepFields('benefits')).toEqual([
      `${PROJECT}.sending_source`,
      FLOW,
      CONTRACT,
      CO2E,
      SO2,
      NOX,
      `${PROJECT}.line_utilization`,
      `${GREENFIELD}.constraints.average_exceedance`,
      `${INCREMENTAL}.constraints.average_exceedance`,
      `${CAPACITY_VALUE}.applicability_gate`,
      `${CAPACITY_VALUE}.capacity_credit`,
      `${CAPACITY_VALUE}.capacity_price`,
    ]);
  });
});

describe('stepBlocked', () => {
  const delay = requiredField(DELAY, 'Delay Years');
  const construction = requiredField(CONSTRUCTION, 'Construction Years');
  const lifetime = requiredField(LIFETIME, 'Project Lifetime (Years)');
  const flow = requiredField(FLOW, 'Flow Factor');
  const contract = requiredField(CONTRACT, 'Contract price');
  const co2e = requiredField(CO2E, 'CO2e');
  const rating = requiredField(RATING, 'Capacity MW');
  const energy = requiredField(
    `${PROJECT}.value_of_load_per_mwh`,
    'Receiving-end energy value ($/MWh)',
    'after_route',
  );

  const required: RequiredResponse = {
    before_route: [contract, rating, delay, construction, lifetime, flow, co2e],
    after_route: [energy, { ...flow, stage: 'after_route' }],
  };

  it('returns only that step’s before_route entries, in API order', () => {
    expect(stepBlocked('timeline', required)).toEqual([delay, construction, lifetime]);
    expect(stepBlocked('benefits', required)).toEqual([contract, flow, co2e]);
    expect(stepBlocked('project', required)).toEqual([rating]);
    expect(stepBlocked('name', required)).toEqual([]);
  });

  it('keeps the API message text', () => {
    expect(stepBlocked('timeline', required).map((field) => field.message)).toEqual([
      'Delay Years is required.',
      'Construction Years is required.',
      'Project Lifetime (Years) is required.',
    ]);
  });
});
