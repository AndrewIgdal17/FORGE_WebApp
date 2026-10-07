// repos/FORGE_WebApp/frontend/src/data/strip-config.ts

export interface StripFigure {
  /** Human label shown above the value */
  label: string;
  /** Dot-path into the results object (e.g. 'costs.build.total_pv') */
  path: string;
  /** How to format: 'currency' for dollars, 'number' for raw, 'percent' for %, 'ratio' for BCR */
  format: 'currency' | 'number' | 'percent' | 'ratio';
  /** Optional: for ratio format, color-code green >= 1, red < 1 */
  colorByThreshold?: boolean;
}

export interface StripConfig {
  /** Strip title: e.g. "Rights of Way contributes to capital" */
  title: string;
  /** The 3 figures to display */
  figures: [StripFigure, StripFigure, StripFigure];
  /** Which results sidebar sub-item ID to link to */
  resultsView: string;
}

export const STRIP_CONFIG: Record<string, StripConfig> = {
  // --- Project Identity ---
  technology: {
    title: 'Technology affects build cost and delivered energy',
    figures: [
      { label: 'Build Cost PV', path: 'bcr.build_cost_pv', format: 'currency' },
      { label: 'Delivered Energy PV', path: 'bcr.delivered_benefit_pv', format: 'currency' },
      { label: 'Societal BCR', path: 'bcr.bcr_societal', format: 'ratio', colorByThreshold: true },
    ],
    resultsView: 'r-capital',
  },
  timeline: {
    title: 'Timeline affects delay cost and AFUDC',
    figures: [
      { label: 'Total Delay PV', path: 'summary.total_delay_pv', format: 'currency' },
      { label: 'Capital PV (after AFUDC)', path: 'summary.total_capital_pv', format: 'currency' },
      { label: 'Societal BCR', path: 'bcr.bcr_societal', format: 'ratio', colorByThreshold: true },
    ],
    resultsView: 'r-operational',
  },

  // --- Equipment ---
  'conductor-details': {
    title: 'Conductors affect line losses',
    figures: [
      { label: 'Line-Loss Energy PV', path: 'bcr.energy_losses_pv', format: 'currency' },
      { label: 'Line-Loss Emissions PV', path: 'bcr.emissions_comp_cost_pv', format: 'currency' },
      { label: 'Conductor Loss PV', path: 'bcr.conductor_loss_pv', format: 'currency' },
    ],
    resultsView: 'r-emissions-costs',
  },
  'converter-details': {
    title: 'Converters contribute to capital',
    figures: [
      { label: 'Build Cost PV', path: 'bcr.build_cost_pv', format: 'currency' },
      { label: 'Converter Loss PV', path: 'bcr.converter_loss_pv', format: 'currency' },
      { label: 'Total Capital PV', path: 'summary.total_capital_pv', format: 'currency' },
    ],
    resultsView: 'r-capital',
  },

  // --- Routing & Terrain ---
  'terrain-mix': {
    title: 'Terrain affects mitigation and build costs',
    figures: [
      { label: 'Env. Mitigation PV', path: 'bcr.env_mitigation_pv', format: 'currency' },
      { label: 'Build Cost PV', path: 'bcr.build_cost_pv', format: 'currency' },
      { label: 'Total Capital PV', path: 'summary.total_capital_pv', format: 'currency' },
    ],
    resultsView: 'r-capital',
  },
  'rights-of-way': {
    title: 'Rights of Way contributes to capital',
    figures: [
      { label: 'ROW Capital PV', path: 'bcr.row_cost_pv', format: 'currency' },
      { label: 'ROW Rent PV', path: 'bcr.row_rent_pv', format: 'currency' },
      { label: 'Total Capital PV', path: 'summary.total_capital_pv', format: 'currency' },
    ],
    resultsView: 'r-capital',
  },

  // --- Benefits ---
  'economic-details': {
    title: 'Economic details drive loss-compensation benefits',
    figures: [
      { label: 'Delivered Energy PV', path: 'bcr.delivered_benefit_pv', format: 'currency' },
      { label: 'Capacity Value PV', path: 'bcr.capacity_value_benefit_pv', format: 'currency' },
      { label: 'Total Benefits PV', path: 'summary.total_benefits_pv', format: 'currency' },
    ],
    resultsView: 'r-loss-comp',
  },
  'system-constraints': {
    title: 'System constraints drive congestion benefits',
    figures: [
      { label: 'Congestion Benefit PV', path: 'bcr.congestion_benefit_pv', format: 'currency' },
      { label: 'Congestion Delay PV', path: 'bcr.congestion_delay_cost_pv', format: 'currency' },
      { label: 'Societal BCR', path: 'bcr.bcr_societal', format: 'ratio', colorByThreshold: true },
    ],
    resultsView: 'r-congestion',
  },

  // --- Financial ---
  rates: {
    title: 'Discount rates affect every present value',
    figures: [
      { label: 'Societal BCR', path: 'bcr.bcr_societal', format: 'ratio', colorByThreshold: true },
      { label: 'Ratepayer BCR', path: 'bcr.bcr_ratepayer', format: 'ratio', colorByThreshold: true },
      { label: 'Utility BCR', path: 'bcr.bcr_utility', format: 'ratio', colorByThreshold: true },
    ],
    resultsView: 'r-bcr',
  },
  afudc: {
    title: 'AFUDC adds to capital cost',
    figures: [
      { label: 'Build Cost PV', path: 'bcr.build_cost_pv', format: 'currency' },
      { label: 'Capital PV (after AFUDC)', path: 'summary.total_capital_pv', format: 'currency' },
      { label: 'Total Costs PV', path: 'summary.total_costs_pv', format: 'currency' },
    ],
    resultsView: 'r-capital',
  },

  // --- Capital Costs ---
  conductor: {
    title: 'Contingencies add to capital',
    figures: [
      { label: 'Build Cost PV', path: 'bcr.build_cost_pv', format: 'currency' },
      { label: 'Capital PV', path: 'summary.total_capital_pv', format: 'currency' },
      { label: 'Total Costs PV', path: 'summary.total_costs_pv', format: 'currency' },
    ],
    resultsView: 'r-capital',
  },
  'base-mitigation': {
    title: 'Mitigation contributes to capital',
    figures: [
      { label: 'Env. Mitigation PV', path: 'bcr.env_mitigation_pv', format: 'currency' },
      { label: 'Capital PV', path: 'summary.total_capital_pv', format: 'currency' },
      { label: 'Total Costs PV', path: 'summary.total_costs_pv', format: 'currency' },
    ],
    resultsView: 'r-capital',
  },
  credits: {
    title: 'Credits reduce capital cost',
    figures: [
      { label: 'Credits PV', path: 'costs.environmental.credits_pv', format: 'currency' },
      { label: 'Env. Mitigation PV', path: 'bcr.env_mitigation_pv', format: 'currency' },
      { label: 'Capital PV', path: 'summary.total_capital_pv', format: 'currency' },
    ],
    resultsView: 'r-capital',
  },

  // --- Operating Costs ---
  'operational-insurance': {
    title: 'Insurance contributes to operational costs',
    figures: [
      { label: 'Insurance PV', path: 'bcr.insurance_pv', format: 'currency' },
      { label: 'Total Operational PV', path: 'summary.total_operational_pv', format: 'currency' },
      { label: 'Total Costs PV', path: 'summary.total_costs_pv', format: 'currency' },
    ],
    resultsView: 'r-operational',
  },
  'vegetation-management': {
    title: 'Vegetation management contributes to O&M',
    figures: [
      { label: 'O&M PV', path: 'bcr.oandm_pv', format: 'currency' },
      { label: 'Total Operational PV', path: 'summary.total_operational_pv', format: 'currency' },
      { label: 'Total Costs PV', path: 'summary.total_costs_pv', format: 'currency' },
    ],
    resultsView: 'r-operational',
  },
  'delay-costs': {
    title: 'Delay costs include base and constraint delays',
    figures: [
      { label: 'Delay Cost PV', path: 'bcr.delay_cost_pv', format: 'currency' },
      { label: 'Congestion Delay PV', path: 'bcr.congestion_delay_cost_pv', format: 'currency' },
      { label: 'Total Delay PV', path: 'summary.total_delay_pv', format: 'currency' },
    ],
    resultsView: 'r-operational',
  },

  // --- Risk ---
  'wildfire-risk': {
    title: 'Wildfire contributes to risk costs',
    figures: [
      { label: 'Wildfire PV', path: 'bcr.wildfire_pv', format: 'currency' },
      { label: 'BCR excl. Wildfire', path: 'bcr.bcr_excluding_wildfire_risk', format: 'ratio', colorByThreshold: true },
      { label: 'Total Risk PV', path: 'summary.total_risk_pv', format: 'currency' },
    ],
    resultsView: 'r-risk-costs',
  },
  'outage-risk': {
    title: 'Outage contributes to risk costs',
    figures: [
      { label: 'Outage PV', path: 'bcr.outage_pv', format: 'currency' },
      { label: 'BCR excl. Wildfire+Outage', path: 'bcr.bcr_excluding_wildfire_risk_and_outage_risk', format: 'ratio', colorByThreshold: true },
      { label: 'Total Risk PV', path: 'summary.total_risk_pv', format: 'currency' },
    ],
    resultsView: 'r-risk-costs',
  },

  // --- Emissions ---
  'energy-emissions-emissions': {
    title: 'Emissions intensities affect costs and avoided emissions',
    figures: [
      { label: 'Emissions Cost PV', path: 'bcr.emissions_comp_cost_pv', format: 'currency' },
      { label: 'Avoided Emissions PV', path: 'bcr.displacement_avoided_benefit_pv', format: 'currency' },
      { label: 'Societal BCR', path: 'bcr.bcr_societal', format: 'ratio', colorByThreshold: true },
    ],
    resultsView: 'r-emissions-costs',
  },

  // --- Energy Mix ---
  'energy-emissions-energy': {
    title: 'Energy mix drives avoided emissions benefit',
    figures: [
      { label: 'Avoided Emissions PV', path: 'bcr.displacement_avoided_benefit_pv', format: 'currency' },
      { label: 'Facilitated Emissions PV', path: 'summary.fac_emissions_project_pv', format: 'currency' },
      { label: 'Total Benefits PV', path: 'summary.total_benefits_pv', format: 'currency' },
    ],
    resultsView: 'r-benefits-overview',
  },
};

export function getStripConfig(subItemId: string): StripConfig | null {
  return STRIP_CONFIG[subItemId] ?? null;
}
