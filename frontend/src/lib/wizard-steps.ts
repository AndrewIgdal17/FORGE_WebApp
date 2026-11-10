import type { RequiredField, RequiredResponse } from './api';

const PROJECT = '01_project_technical_details.project';
const TIMELINE = '01_project_technical_details.timeline';
const GREENFIELD = '17_congestion_reductions.greenfield_congestion_reductions';
const INCREMENTAL = '17_congestion_reductions.incremental_congestion_reductions';
const CAPACITY_VALUE = '20_capacity_value';

/** Calculator paths the project-setup wizard reads and writes. */
export const WIZARD_PATH = {
  projectType: `${PROJECT}.project_type`,
  constructionType: `${PROJECT}.construction_type`,
  acDc: `${PROJECT}.ac_dc`,
  capacityMw: `${PROJECT}.capacity_mw`,
  conductorType: `${PROJECT}.conductor_type`,
  converterType: `${PROJECT}.converter_type`,
  numberOfConverters: `${PROJECT}.number_of_converters`,
  oldCapacityMw: `${PROJECT}.old_capacity_mw`,
  oldAcDc: `${PROJECT}.old_ac_dc`,
  oldConductorType: `${PROJECT}.old_conductor_type`,
  oldConverterType: `${PROJECT}.old_converter_type`,
  delayYears: `${TIMELINE}.delay_years`,
  constructionYears: `${TIMELINE}.construction_years`,
  projectLifetime: `${TIMELINE}.project_lifetime`,
  sendingSource: `${PROJECT}.sending_source`,
  flowShare: `${GREENFIELD}.constraints.flow_factor`,
  contractPrice: `${PROJECT}.dedicated_resource.contract_price_per_mwh`,
  emissionCo2e: `${PROJECT}.dedicated_resource.emission_rate_kg_per_mwh.co2e`,
  emissionSo2: `${PROJECT}.dedicated_resource.emission_rate_kg_per_mwh.so2`,
  emissionNox: `${PROJECT}.dedicated_resource.emission_rate_kg_per_mwh.nox`,
  utilization: `${PROJECT}.line_utilization`,
  greenfieldExceedance: `${GREENFIELD}.constraints.average_exceedance`,
  incrementalExceedance: `${INCREMENTAL}.constraints.average_exceedance`,
  capacityGate: `${CAPACITY_VALUE}.applicability_gate`,
  capacityCredit: `${CAPACITY_VALUE}.capacity_credit`,
  capacityPrice: `${CAPACITY_VALUE}.capacity_price`,
} as const;

export type StepKind = 'name' | 'project' | 'timeline' | 'benefits';

export const STEP_ORDER: StepKind[] = ['name', 'project', 'timeline', 'benefits'];

const PROJECT_TYPES = ['greenfield', 'reconductoring', 'rebuild'] as const;

export type ProjectType = (typeof PROJECT_TYPES)[number];

export function projectTypes(): Array<'greenfield' | 'reconductoring' | 'rebuild'> {
  return [...PROJECT_TYPES];
}

/**
 * Calculator paths the step owns. Voltage and circuits/poles are derived
 * from the category row and are not included.
 */
export function stepFields(step: StepKind): string[] {
  switch (step) {
    case 'name':
      return [];
    case 'project':
      return [
        WIZARD_PATH.projectType,
        WIZARD_PATH.constructionType,
        WIZARD_PATH.acDc,
        WIZARD_PATH.capacityMw,
        WIZARD_PATH.conductorType,
        WIZARD_PATH.converterType,
        WIZARD_PATH.numberOfConverters,
        WIZARD_PATH.oldCapacityMw,
        WIZARD_PATH.oldAcDc,
        WIZARD_PATH.oldConductorType,
        WIZARD_PATH.oldConverterType,
      ];
    case 'timeline':
      return [
        WIZARD_PATH.delayYears,
        WIZARD_PATH.constructionYears,
        WIZARD_PATH.projectLifetime,
      ];
    case 'benefits':
      return [
        WIZARD_PATH.sendingSource,
        WIZARD_PATH.flowShare,
        WIZARD_PATH.contractPrice,
        WIZARD_PATH.emissionCo2e,
        WIZARD_PATH.emissionSo2,
        WIZARD_PATH.emissionNox,
        WIZARD_PATH.utilization,
        WIZARD_PATH.greenfieldExceedance,
        WIZARD_PATH.incrementalExceedance,
        WIZARD_PATH.capacityGate,
        WIZARD_PATH.capacityCredit,
        WIZARD_PATH.capacityPrice,
      ];
  }
}

/** `before_route` entries whose path this step owns, in API order. */
export function stepBlocked(step: StepKind, required: RequiredResponse): RequiredField[] {
  const owned = new Set(stepFields(step));
  return required.before_route.filter((field) => owned.has(field.path));
}
