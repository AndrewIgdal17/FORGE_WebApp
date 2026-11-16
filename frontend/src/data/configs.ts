import { DELAY_ROWS, DIRECT_DELAY_HELP } from '@/lib/delay-comparison';
import {
  BENEFIT_CATEGORY_LABELS,
  CATEGORY_LABELS,
  REPORTING_PATHS,
  type ReportingKey,
} from '@/lib/results-utils';

function delayRowHelp(key: (typeof DELAY_ROWS)[number]['key']): string {
  const row = DELAY_ROWS.find((item) => item.key === key);
  if (!row) throw new Error(`missing delay row ${key}`);
  return row.help;
}

export type ComparisonMetricFormat =
  | 'text'
  | 'number'
  | 'number2'
  | 'number3'
  | 'currency';

export interface ComparisonMetric {
  key: string;
  label: string;
  path: string;
  format: ComparisonMetricFormat;
  description?: string;
  /** Taxonomy id whose `applies: false` turns the cell into "Does not apply". */
  appliesId?: string;
  /** Path to a three-state value; "does_not_apply" turns the cell into "Does not apply". */
  statePath?: string;
  /** Spec 15 category total rebuilt from taxonomy when absent on stored v5 rows. */
  reportingKey?: ReportingKey;
}

export interface ComparisonMetricGroup {
  group: string;
  metrics: ComparisonMetric[];
}

export type ComparisonSupergroup =
  | 'project'
  | 'bcr'
  | 'costs'
  | 'benefits'
  | 'sensitivity';

export const COMPARISON_METRICS: ComparisonMetricGroup[] = [
  {
    group: 'Project Parameters',
    metrics: [
      {
        key: 'ac_dc',
        label: 'AC / DC',
        path: 'technical_parameters.ac_dc',
        format: 'text',
      },
      {
        key: 'congestion_spread_per_mwh',
        label: 'Congestion spread ($/MWh)',
        path: 'technical_parameters.market_measurements.congestion_spread_per_mwh',
        format: 'number2',
      },
      {
        key: 'hours_receiving_more_congested',
        label: 'Hours receiving end more congested',
        path: 'technical_parameters.market_measurements.hours_receiving_more_congested',
        format: 'number',
      },
      {
        key: 'hours_sending_more_congested',
        label: 'Hours sending end more congested',
        path: 'technical_parameters.market_measurements.hours_sending_more_congested',
        format: 'number',
      },
      {
        key: 'receiving_energy_value_per_mwh',
        label: 'Receiving-end energy value ($/MWh)',
        path: 'technical_parameters.market_measurements.receiving_energy_value_per_mwh',
        format: 'number2',
      },
      {
        key: 'capacity_mw',
        label: 'Capacity (MW)',
        path: 'technical_parameters.capacity_mw',
        format: 'number',
      },
      {
        key: 'conductor_type',
        label: 'Conductor type',
        path: 'technical_parameters.conductor_type',
        format: 'text',
      },
      {
        key: 'construction_years',
        label: 'Construction (yr)',
        path: 'technical_parameters.construction_years',
        format: 'number',
      },
      {
        key: 'construction_type',
        label: 'Construction type',
        path: 'technical_parameters.construction_type',
        format: 'text',
      },
      {
        key: 'converter_type',
        label: 'Converter type',
        path: 'technical_parameters.converter_type',
        format: 'text',
      },
      {
        key: 'delay_years',
        label: 'Delay (yr)',
        path: 'technical_parameters.delay_years',
        format: 'number',
      },
      {
        key: 'lifetime',
        label: 'Lifetime (yr)',
        path: 'technical_parameters.project_lifetime_years',
        format: 'number',
      },
      {
        key: 'line_length',
        label: 'Line length (mi)',
        path: 'technical_parameters.line_length_miles',
        format: 'number2',
      },
      {
        key: 'line_utilization',
        label: 'Line utilization',
        path: 'technical_parameters.line_utilization',
        format: 'number2',
      },
    ],
  },
  {
    group: 'BCR — Societal',
    metrics: [
      {
        key: 'bcr_societal',
        label: 'BCR Societal',
        path: 'bcr.bcr_societal',
        format: 'number3',
      },
    ],
  },
  {
    group: 'BCR — Firm',
    metrics: [
      {
        key: 'bcr_utility',
        label: 'BCR Utility',
        path: 'bcr.bcr_utility',
        format: 'number3',
      },
      {
        key: 'bcr_ratepayer',
        label: 'BCR Ratepayer',
        path: 'bcr.bcr_ratepayer',
        format: 'number3',
      },
    ],
  },
  {
    group: 'BCR — Custom',
    metrics: [
      {
        key: 'custom_bcr',
        label: 'Custom BCR',
        path: '__custom__',
        format: 'number3',
      },
    ],
  },
  {
    group: 'Costs (PV)',
    metrics: [
      {
        key: 'build_pv',
        label: 'Build Cost',
        path: 'costs.build.total_pv',
        format: 'currency',
      },
      {
        key: 'env_pv',
        label: 'Environmental Cost',
        path: 'costs.environmental.total_pv',
        format: 'currency',
        appliesId: 'env_mitigation',
      },
      {
        key: 'insurance_pv',
        label: 'Insurance Cost',
        path: 'costs.insurance.pv_total',
        format: 'currency',
      },
      {
        key: 'acquisition_pv',
        label: 'Acquisition Cost',
        path: 'costs.row.acquisition_pv',
        format: 'currency',
        appliesId: 'row_acquisition',
      },
      {
        key: 'row_rent_pv',
        label: 'ROW Rent Cost',
        path: 'costs.row.row_rent_pv',
        format: 'currency',
        appliesId: 'row_rent',
      },
      {
        key: 'total_capital_pv',
        label: 'Total Capital Cost',
        path: 'summary.total_capital_pv',
        format: 'currency',
      },
      {
        key: 'total_operational_pv',
        label: 'Total Operational Cost',
        path: 'summary.total_operational_pv',
        format: 'currency',
      },
      {
        key: 'grand_total_pv',
        label: 'Total System Cost',
        path: 'summary.total_costs_pv',
        format: 'currency',
      },
    ],
  },
  {
    group: 'Benefits',
    metrics: [
      {
        key: 'benefits_market_pv',
        label: BENEFIT_CATEGORY_LABELS.market,
        path: REPORTING_PATHS.market,
        format: 'currency',
        reportingKey: 'market',
      },
      {
        key: 'benefits_external_pv',
        label: BENEFIT_CATEGORY_LABELS.external,
        path: REPORTING_PATHS.external_benefits,
        format: 'currency',
        reportingKey: 'external_benefits',
      },
      {
        key: 'benefits_remedial_pv',
        label: 'Remedial Benefits',
        path: 'bcr.benefits_remedial_pv',
        format: 'currency',
      },
      {
        key: 'benefits_enabling_pv',
        label: 'Enabling Benefits',
        path: 'bcr.benefits_enabling_pv',
        format: 'currency',
      },
      {
        key: 'benefits_avoided_emissions_pv',
        label: 'Avoided Emissions Benefits',
        path: 'bcr.benefits_avoided_emissions_pv',
        format: 'currency',
      },
      {
        key: 'congestion_pv',
        label: 'Congestion Benefits',
        path: 'bcr.congestion_benefit_pv',
        format: 'currency',
        appliesId: 'congestion_benefit',
      },
      {
        key: 'custom_nb',
        label: 'Custom Net Benefit',
        path: '__custom__',
        format: 'currency',
      },
      {
        key: 'net_benefit_ratepayer_pv',
        label: 'Net Benefit (Ratepayer)',
        path: 'bcr.net_benefit_ratepayer_pv',
        format: 'currency',
      },
      {
        key: 'net_benefit_pv',
        label: 'Net Benefit (System)',
        path: 'bcr.net_benefit_pv',
        format: 'currency',
      },
      {
        key: 'net_benefit_utility_pv',
        label: 'Net Benefit (Utility)',
        path: 'bcr.net_benefit_utility_pv',
        format: 'currency',
      },
      {
        key: 'revenue_pv',
        label: 'Revenue',
        path: 'bcr.capital_recovery_pv',
        format: 'currency',
      },
      {
        key: 'total_benefits_pv',
        label: 'Total Benefits',
        path: 'bcr.total_benefits_pv',
        format: 'currency',
      },
    ],
  },
  {
    group: 'Cost Categories (PV)',
    metrics: [
      {
        key: 'capital_costs_pv',
        label: CATEGORY_LABELS.capital,
        path: REPORTING_PATHS.capital,
        format: 'currency',
        reportingKey: 'capital',
      },
      {
        key: 'delay_period_costs_pv',
        label: CATEGORY_LABELS.delay_period,
        path: REPORTING_PATHS.delay_period,
        format: 'currency',
        reportingKey: 'delay_period',
      },
      {
        key: 'operating_costs_pv',
        label: CATEGORY_LABELS.operating,
        path: REPORTING_PATHS.operating,
        format: 'currency',
        reportingKey: 'operating',
      },
      {
        key: 'external_costs_pv',
        label: CATEGORY_LABELS.external,
        path: REPORTING_PATHS.external,
        format: 'currency',
        reportingKey: 'external',
      },
      {
        key: 'external_risk_costs_pv',
        label: 'External costs: Risk',
        path: REPORTING_PATHS.external_risk,
        format: 'currency',
        reportingKey: 'external_risk',
      },
      {
        key: 'external_emissions_costs_pv',
        label: 'External costs: Emissions',
        path: REPORTING_PATHS.external_emissions,
        format: 'currency',
        reportingKey: 'external_emissions',
      },
    ],
  },
  {
    group: 'Risk Costs (PV)',
    metrics: [
      {
        key: 'outage_pv',
        label: 'Outage Cost',
        path: 'costs.outage.pv_cost',
        format: 'currency',
      },
      {
        key: 'outage_loadshed_per_event',
        label: 'Outage Load-Shed Cost/Event',
        path: 'costs.outage.cost_loadshed',
        format: 'currency',
      },
      {
        key: 'outage_redispatch_per_event',
        label: 'Outage Redispatch Cost/Event',
        path: 'costs.outage.cost_redispatch',
        format: 'currency',
      },
      {
        key: 'outage_rho',
        label: 'Load-Shed Fraction (\u03C1)',
        path: 'costs.outage.rho',
        format: 'number2',
      },
      {
        key: 'total_risk_pv',
        label: 'Total Risk Cost',
        path: 'summary.total_risk_pv',
        format: 'currency',
      },
      {
        key: 'wildfire_pv',
        label: 'Wildfire Cost',
        path: 'costs.wildfire.pv_cost',
        format: 'currency',
      },
    ],
  },
  {
    group: 'Delay (PV)',
    metrics: [
      {
        key: 'delay_pv',
        label: 'Direct delay cost (PV)',
        path: 'costs.delay.total_pv',
        format: 'currency',
        description: DIRECT_DELAY_HELP,
      },
      {
        key: 'delay_baseline_years',
        label: 'Baseline delay (yr)',
        path: 'delay_comparison.baseline_delay_years',
        format: 'number',
      },
      {
        key: 'delay_forgone_cong',
        statePath: 'delay_comparison.states.delay_cost_cong',
        label: 'Forgone congestion relief',
        path: 'delay_comparison.delay_cost_cong',
        format: 'currency',
        description: delayRowHelp('cong'),
      },
      {
        key: 'delay_forgone_avoid',
        statePath: 'delay_comparison.states.delay_cost_avoid',
        label: 'Forgone avoided emissions',
        path: 'delay_comparison.delay_cost_avoid',
        format: 'currency',
        description: delayRowHelp('avoid'),
      },
      {
        key: 'delay_forgone',
        statePath: 'delay_comparison.states.delay_cost_forgone',
        label: 'Forgone benefits',
        path: 'delay_comparison.delay_cost_forgone',
        format: 'currency',
        description: delayRowHelp('forgone'),
      },
      {
        key: 'delay_total',
        statePath: 'delay_comparison.states.delta_nb_delay',
        label: 'Total cost of delay',
        path: 'delay_comparison.delta_nb_delay',
        format: 'currency',
        description: delayRowHelp('total'),
      },
    ],
  },
  {
    group: 'Energy / Emissions (PV)',
    metrics: [
      {
        key: 'emissions_pv',
        label: 'Line Loss Compensation Emissions',
        path: 'costs.emissions.total_pv',
        format: 'currency',
      },
      {
        key: 'line_loss_pv',
        label: 'Line Loss Cost',
        path: 'costs.line_loss.total_pv',
        format: 'currency',
      },
      {
        key: 'total_energy_emissions_pv',
        label: 'Line Loss + Line Loss Compensation Emissions',
        path: 'summary.total_energy_emissions_pv',
        format: 'currency',
        description:
          'Sum of line loss costs and line loss compensation emissions. Does not include facilitated emissions or avoided emissions.',
      },
    ],
  },
  {
    group: 'BCR — Societal Exclusions',
    metrics: [
      {
        key: 'bcr_excl_av_em',
        label: 'BCR excl. Avoided Emissions',
        path: 'bcr.bcr_excluding_avoided_emissions',
        format: 'number3',
      },
      {
        key: 'bcr_excl_wf',
        label: 'BCR excl. Wildfire',
        path: 'bcr.bcr_excluding_wildfire_risk',
        format: 'number3',
      },
      {
        key: 'bcr_excl_wf_out',
        label: 'BCR excl. Wildfire + Outage',
        path: 'bcr.bcr_excluding_wildfire_risk_and_outage_risk',
        format: 'number3',
      },
      {
        key: 'bcr_excl_emissions',
        label: 'BCR excl. Emissions Costs',
        path: 'bcr.bcr_excluding_emissions',
        format: 'number3',
      },
      {
        key: 'bcr_excl_outage',
        label: 'BCR excl. Outage',
        path: 'bcr.bcr_excluding_outage_risk',
        format: 'number3',
      },
      {
        key: 'bcr_excl_all_emissions',
        label: 'BCR excl. All Emissions',
        path: 'bcr.bcr_excluding_avoided_emissions_and_emissions',
        format: 'number3',
      },
    ],
  },
];

/** Maps each COMPARISON_METRICS `group` to a super-group for the hierarchical add-column picker. */
export const COMPARISON_GROUP_SUPERGROUP: Record<string, ComparisonSupergroup> =
  {
    'Project Parameters': 'project',
    'BCR — Societal': 'bcr',
    'BCR — Firm': 'bcr',
    'Costs (PV)': 'costs',
    'Cost Categories (PV)': 'costs',
    Benefits: 'benefits',
    'Risk Costs (PV)': 'costs',
    'Delay (PV)': 'costs',
    'Energy / Emissions (PV)': 'costs',
    'BCR — Societal Exclusions': 'sensitivity',
  };

export const COMPARISON_SUPERGROUP_ORDER: readonly ComparisonSupergroup[] = [
  'project',
  'bcr',
  'costs',
  'benefits',
  'sensitivity',
];

export const COMPARISON_SUPERGROUP_LABEL: Record<ComparisonSupergroup, string> =
  {
    project: 'Project Information',
    bcr: 'Benefit-Cost Ratio (BCR)',
    costs: 'Costs',
    benefits: 'Benefits',
    sensitivity: 'BCR — Societal Exclusions',
  };

export const CMP_PICKER_STORAGE_KEY = 'forge-cmp-picker-details';

export const COMPARISON_METRIC_KEY_ORDER: Map<string, number> = (() => {
  const order = new Map<string, number>();
  let idx = 0;
  for (const group of COMPARISON_METRICS) {
    for (const metric of group.metrics) {
      if (!order.has(metric.key)) order.set(metric.key, idx++);
    }
  }
  return order;
})();

export const UNKNOWN_METRIC_CATALOG_INDEX = Number.MAX_SAFE_INTEGER;

export const CONDUCTOR_TYPE_BY_CONSTRUCTION: Record<string, readonly string[]> =
  {
    Overhead: [
      'Standard Aluminum Conductor',
      'Advanced Aluminum Conductor',
    ],
    'Underground Direct-Buried': ['Underground Copper Conductor'],
    'Underground Tunnel': ['Underground Copper Conductor'],
  };

export const CAPACITY_OPTIONS_BY_AC_DC: Record<'AC' | 'DC', readonly number[]> =
  {
    AC: [140, 329, 394, 460, 657, 1792, 2598, 6625],
    DC: [500, 1500, 2000, 2400, 6000],
  };
