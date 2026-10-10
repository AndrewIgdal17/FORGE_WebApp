// repos/FORGE_WebApp/frontend/src/data/strip-config.ts

import { getValueAtPath } from '@/lib/path';

interface PathFigure {
  label: string;
  source: 'path';
  path: string;
  format: 'currency' | 'number' | 'percent' | 'ratio';
  colorByThreshold?: boolean;
  decimals?: number;
  unit?: string;
}

interface TaxonomyFigure {
  label: string;
  source: 'taxonomy';
  taxonomyId: string;
  field: 'value_pv' | 'value_nominal' | 'value_annual';
  format: 'currency' | 'number';
}

interface ComputedFigure {
  label: string;
  source: 'computed';
  paths: string[];
  operation: 'multiply' | 'sum' | 'subtract';
  format: 'currency' | 'number';
  unit?: string;
}

export type StripFigure = PathFigure | TaxonomyFigure | ComputedFigure;

export interface StripConfig {
  /** Strip title: e.g. "Rights of Way contributes to capital" */
  title: string;
  /** Figures for this sub-item (2–5) */
  figures: StripFigure[];
  /** Which results sidebar sub-item ID to link to */
  resultsView: string;
}

export function readFinite(
  results: Record<string, unknown> | null,
  path: string,
): number | null {
  if (!results) return null;
  const value = getValueAtPath(results, path);
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function readFigureValue(
  figure: StripFigure,
  results: Record<string, unknown>,
): number | null {
  switch (figure.source) {
    case 'path':
      return readFinite(results, figure.path);
    case 'taxonomy': {
      const items = results.taxonomy_results;
      if (!Array.isArray(items)) return null;
      const match = items.find(
        (item: unknown) =>
          item &&
          typeof item === 'object' &&
          (item as Record<string, unknown>).taxonomy_id === figure.taxonomyId,
      );
      if (!match || typeof match !== 'object') return null;
      const value = (match as Record<string, unknown>)[figure.field];
      return typeof value === 'number' && Number.isFinite(value) ? value : null;
    }
    case 'computed': {
      const values = figure.paths.map((p) => readFinite(results, p));
      if (values.some((v) => v === null)) return null;
      const nums = values as number[];
      switch (figure.operation) {
        case 'multiply':
          return nums.reduce((a, b) => a * b, 1);
        case 'sum':
          return nums.reduce((a, b) => a + b, 0);
        case 'subtract':
          return nums.length >= 2
            ? nums[0] - nums.slice(1).reduce((a, b) => a + b, 0)
            : null;
      }
    }
  }
}

export const STRIP_CONFIG: Record<string, StripConfig> = {
  // --- Project Identity ---
  technology: {
    title: 'Technology affects build cost and delivered energy',
    figures: [
      { label: 'Build Cost PV', source: 'path', path: 'bcr.build_cost_pv', format: 'currency' },
      {
        label: 'Conductor Cost PV',
        source: 'taxonomy',
        taxonomyId: 'build_conductor',
        field: 'value_pv',
        format: 'currency',
      },
      {
        label: 'Structure Cost PV',
        source: 'taxonomy',
        taxonomyId: 'build_structure',
        field: 'value_pv',
        format: 'currency',
      },
      {
        label: 'Converter Cost PV',
        source: 'taxonomy',
        taxonomyId: 'build_converter',
        field: 'value_pv',
        format: 'currency',
      },
      {
        label: 'Effective Capacity',
        source: 'computed',
        paths: ['technical_parameters.capacity_mw', 'technical_parameters.line_utilization'],
        operation: 'multiply',
        format: 'number',
        unit: 'MW',
      },
    ],
    resultsView: 'r-overview',
  },
  timeline: {
    title: 'Timeline affects delay cost and AFUDC',
    figures: [
      { label: 'Base Delay PV', source: 'path', path: 'bcr.delay_cost_pv', format: 'currency' },
      {
        label: 'Congestion Delay PV',
        source: 'path',
        path: 'bcr.congestion_delay_cost_pv',
        format: 'currency',
      },
      {
        label: 'Displacement Delay Emissions PV',
        source: 'path',
        path: 'bcr.emissions_displacement_delay_pv',
        format: 'currency',
      },
      { label: 'Total Delay PV', source: 'path', path: 'summary.total_delay_pv', format: 'currency' },
    ],
    resultsView: 'r-overview',
  },

  // --- Equipment ---
  'conductor-details': {
    title: 'Conductors affect line losses',
    figures: [
      {
        label: 'Conductor Build Cost PV',
        source: 'taxonomy',
        taxonomyId: 'build_conductor',
        field: 'value_pv',
        format: 'currency',
      },
      { label: 'Conductor Loss PV', source: 'path', path: 'bcr.conductor_loss_pv', format: 'currency' },
      {
        label: 'Conductor Losses (MWh/yr)',
        source: 'path',
        path: 'costs.line_loss.line_loss_mwh_yr',
        format: 'number',
      },
    ],
    resultsView: 'r-overview',
  },
  'converter-details': {
    title: 'Converters contribute to capital',
    figures: [
      {
        label: 'Converter Build Cost PV',
        source: 'taxonomy',
        taxonomyId: 'build_converter',
        field: 'value_pv',
        format: 'currency',
      },
      { label: 'Converter Loss PV', source: 'path', path: 'bcr.converter_loss_pv', format: 'currency' },
      {
        label: 'Converter Losses (MWh/yr)',
        source: 'path',
        path: 'costs.line_loss.converter_loss_mwh_yr',
        format: 'number',
      },
    ],
    resultsView: 'r-overview',
  },

  // --- Routing & Terrain ---
  'terrain-mix': {
    title: 'Terrain affects mitigation and build costs',
    figures: [
      { label: 'Total Miles', source: 'path', path: 'derived_parameters.total_miles', format: 'number' },
      {
        label: 'Average Multiplier',
        source: 'path',
        path: 'derived_parameters.average_terrain_multiplier',
        format: 'number',
        decimals: 2,
      },
      {
        label: 'Weighted Miles',
        source: 'path',
        path: 'derived_parameters.weighted_miles',
        format: 'number',
      },
    ],
    resultsView: 'r-overview',
  },
  'rights-of-way': {
    title: 'Rights of Way contributes to capital',
    figures: [
      { label: 'Holding PV', source: 'path', path: 'costs.row.row_holding_pv', format: 'currency' },
      { label: 'Acquisition PV', source: 'path', path: 'costs.row.acquisition_pv', format: 'currency' },
      { label: 'Rent PV', source: 'path', path: 'costs.row.row_rent_pv', format: 'currency' },
    ],
    resultsView: 'r-overview',
  },

  // --- Benefits ---
  'economic-details': {
    title: 'Economic details drive loss-compensation benefits',
    figures: [
      {
        label: 'Delivered Energy PV',
        source: 'path',
        path: 'bcr.delivered_benefit_pv',
        format: 'currency',
      },
      {
        label: 'Capacity Value PV',
        source: 'path',
        path: 'bcr.capacity_value_benefit_pv',
        format: 'currency',
      },
      { label: 'Outage PV', source: 'path', path: 'bcr.outage_pv', format: 'currency' },
    ],
    resultsView: 'r-overview',
  },
  'system-constraints': {
    title: 'System constraints drive congestion benefits',
    figures: [
      { label: 'Relief MW', source: 'path', path: 'benefits.congestion.relief_mw', format: 'number' },
      {
        label: 'Congestion Benefit PV',
        source: 'path',
        path: 'bcr.congestion_benefit_pv',
        format: 'currency',
      },
      {
        label: 'Congestion Delay Cost PV',
        source: 'path',
        path: 'bcr.congestion_delay_cost_pv',
        format: 'currency',
      },
    ],
    resultsView: 'r-overview',
  },

  // --- Financial ---
  rates: {
    title: 'Discount rates affect every present value',
    figures: [
      {
        label: 'Societal BCR',
        source: 'path',
        path: 'bcr.bcr_societal',
        format: 'ratio',
        colorByThreshold: true,
      },
      {
        label: 'Ratepayer BCR',
        source: 'path',
        path: 'bcr.bcr_ratepayer',
        format: 'ratio',
        colorByThreshold: true,
      },
      {
        label: 'Utility BCR',
        source: 'path',
        path: 'bcr.bcr_utility',
        format: 'ratio',
        colorByThreshold: true,
      },
    ],
    resultsView: 'r-overview',
  },
  afudc: {
    title: 'AFUDC adds to capital cost',
    figures: [
      { label: 'AFUDC Rate', source: 'path', path: 'derived_parameters.afudc_rate', format: 'percent' },
      { label: 'Build Cost Capitalized', source: 'path', path: 'costs.build.total_afudc', format: 'currency' },
      {
        label: 'Capital Costs Nominal',
        source: 'path',
        path: 'bcr.capital_costs_nominal',
        format: 'currency',
      },
    ],
    resultsView: 'r-overview',
  },

  // --- Capital Costs ---
  conductor: {
    title: 'Contingencies add to capital',
    figures: [
      {
        label: 'Conductor Contingency %',
        source: 'path',
        path: 'derived_parameters.contingencies.conductor_contingency',
        format: 'percent',
      },
      {
        label: 'Structure Contingency %',
        source: 'path',
        path: 'derived_parameters.contingencies.structure_contingency',
        format: 'percent',
      },
      { label: 'Build Cost PV', source: 'path', path: 'bcr.build_cost_pv', format: 'currency' },
    ],
    resultsView: 'r-overview',
  },
  'base-mitigation': {
    title: 'Mitigation contributes to capital',
    figures: [
      {
        label: 'Base Restoration PV',
        source: 'path',
        path: 'costs.environmental.base_cost_pv',
        format: 'currency',
      },
      { label: 'Credits PV', source: 'path', path: 'costs.environmental.credits_pv', format: 'currency' },
      {
        label: 'Total Env. Mitigation PV',
        source: 'path',
        path: 'bcr.env_mitigation_pv',
        format: 'currency',
      },
    ],
    resultsView: 'r-overview',
  },
  credits: {
    title: 'Credits reduce capital cost',
    figures: [
      { label: 'Credits PV', source: 'path', path: 'costs.environmental.credits_pv', format: 'currency' },
      {
        label: 'Base Restoration PV',
        source: 'path',
        path: 'costs.environmental.base_cost_pv',
        format: 'currency',
      },
      {
        label: 'Total Env. Mitigation PV',
        source: 'path',
        path: 'bcr.env_mitigation_pv',
        format: 'currency',
      },
    ],
    resultsView: 'r-overview',
  },

  // --- Operating Costs ---
  'operational-insurance': {
    title: 'Insurance contributes to operational costs',
    figures: [
      { label: 'Annual Premium', source: 'path', path: 'costs.insurance.annual_premium', format: 'currency' },
      {
        label: 'Insurable Value',
        source: 'path',
        path: 'costs.insurance.insurable_value',
        format: 'currency',
      },
      { label: 'Insurance PV', source: 'path', path: 'bcr.insurance_pv', format: 'currency' },
    ],
    resultsView: 'r-overview',
  },
  'vegetation-management': {
    title: 'Vegetation management contributes to O&M',
    figures: [
      { label: 'Vegetation Annual', source: 'path', path: 'costs.oandm.vegetation_annual', format: 'currency' },
      { label: 'Vegetation PV', source: 'path', path: 'costs.oandm.vegetation_pv', format: 'currency' },
      { label: 'Total O&M PV', source: 'path', path: 'bcr.oandm_pv', format: 'currency' },
    ],
    resultsView: 'r-overview',
  },
  'delay-costs': {
    title: 'Delay costs include base and constraint delays',
    figures: [
      { label: 'Base Delay PV', source: 'path', path: 'bcr.delay_cost_pv', format: 'currency' },
      { label: 'Total Delay PV', source: 'path', path: 'summary.total_delay_pv', format: 'currency' },
    ],
    resultsView: 'r-overview',
  },

  // --- Risk ---
  'wildfire-risk': {
    title: 'Wildfire contributes to risk costs',
    figures: [
      { label: 'Expected Annual Loss', source: 'path', path: 'costs.wildfire.EAL', format: 'currency' },
      { label: 'Wildfire PV', source: 'path', path: 'bcr.wildfire_pv', format: 'currency' },
      { label: 'Total Risk PV', source: 'path', path: 'summary.total_risk_pv', format: 'currency' },
    ],
    resultsView: 'r-overview',
  },
  'outage-risk': {
    title: 'Outage contributes to risk costs',
    figures: [
      {
        label: 'Expected Annual Loss',
        source: 'path',
        path: 'costs.outage.expected_annual_loss',
        format: 'currency',
      },
      { label: 'Outage PV', source: 'path', path: 'bcr.outage_pv', format: 'currency' },
      { label: 'Total Risk PV', source: 'path', path: 'summary.total_risk_pv', format: 'currency' },
    ],
    resultsView: 'r-overview',
  },

  // --- Emissions ---
  'energy-emissions-emissions': {
    title: 'Emissions intensities affect costs and avoided emissions',
    figures: [
      {
        label: 'Emissions Cost PV',
        source: 'path',
        path: 'bcr.emissions_comp_cost_pv',
        format: 'currency',
      },
      {
        label: 'Avoided Emissions PV',
        source: 'path',
        path: 'bcr.displacement_avoided_benefit_pv',
        format: 'currency',
      },
    ],
    resultsView: 'r-overview',
  },

  // --- Energy Mix ---
  'energy-emissions-energy': {
    title: 'Energy mix drives avoided emissions benefit',
    figures: [
      {
        label: 'Avoided Emissions PV',
        source: 'path',
        path: 'bcr.displacement_avoided_benefit_pv',
        format: 'currency',
      },
      {
        label: 'Facilitated Emissions PV',
        source: 'path',
        path: 'summary.fac_emissions_project_pv',
        format: 'currency',
      },
    ],
    resultsView: 'r-overview',
  },
};

export function getStripConfig(subItemId: string): StripConfig | null {
  return STRIP_CONFIG[subItemId] ?? null;
}
