export const COMPOSITION_COLORS: string[] = [
  '#0066cc',
  '#2563eb',
  '#3b82f6',
  '#60a5fa',
  '#93c5fd',
];

export const CATEGORY_LABELS: Record<string, string> = {
  hard: 'Hard Costs',
  soft: 'Soft Costs',
  risk: 'Risk Costs',
  emissions: 'Line Loss Compensation Emissions',
  remedial: 'Remedial Benefits',
  enabling: 'Enabling Benefits',
  avoided_emissions: 'Avoided Emissions',
  transfer: 'Revenue (Transfer)',
  reporting: 'Transfers & Reporting',
};

export const COST_CATEGORY_ORDER: string[] = ['hard', 'soft', 'risk', 'emissions'];

export function formatCompact(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1e9) return sign + '$' + (abs / 1e9).toFixed(1) + 'B';
  if (abs >= 1e6) return sign + '$' + (abs / 1e6).toFixed(0) + 'M';
  if (abs >= 1e3) return sign + '$' + (abs / 1e3).toFixed(0) + 'K';
  return sign + '$' + abs.toFixed(0);
}

export function buildResultById(
  results: Record<string, unknown>,
): Record<string, unknown> {
  const map: Record<string, unknown> = {};
  const rows = results.taxonomy_results;
  if (!Array.isArray(rows)) return map;
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const record = row as Record<string, unknown>;
    const id = record.taxonomy_id;
    if (typeof id === 'string' && id) map[id] = record;
  }
  return map;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

/** Match `value || 0`: missing, zero, and NaN become 0. */
function orZero(value: unknown): number {
  if (typeof value === 'number') return value || 0;
  return 0;
}

/** Match `value || null`: missing and zero become null. */
function orNull(value: unknown): number | null {
  if (typeof value === 'number') return value || null;
  return null;
}

function proportional(compNom: number, totalNom: number, totalPV: number): number {
  return totalNom ? (totalPV * compNom) / totalNom : 0;
}

export function deriveTaxonomyResults(
  results: Record<string, unknown>,
): unknown[] {
  const costs = asRecord(results.costs);
  const benefits = asRecord(results.benefits);
  const cc = asRecord(benefits.congestion);
  const capRec = asRecord(benefits.capital_recovery);
  const wf = asRecord(costs.wildfire);
  const out = asRecord(costs.outage);
  const em = asRecord(costs.emissions);
  const fac = asRecord(benefits.facilitated_emissions);
  const ll = asRecord(costs.line_loss);
  const build = asRecord(costs.build);
  const row = asRecord(costs.row);
  const env = asRecord(costs.environmental);
  const om = asRecord(costs.oandm);
  const ins = asRecord(costs.insurance);
  const delay = asRecord(costs.delay);
  const dispDelay = asRecord(costs.displacement_delay);
  const totalBuildNom = orZero(build.total_nominal);

  return [
    {
      taxonomy_id: 'build_conductor',
      value_pv: proportional(
        orZero(build.conductor_nominal),
        totalBuildNom,
        orZero(build.total_pv),
      ),
      value_nominal: orZero(build.conductor_nominal),
      detail: [],
    },
    {
      taxonomy_id: 'build_structure',
      value_pv: proportional(
        orZero(build.structure_nominal),
        totalBuildNom,
        orZero(build.total_pv),
      ),
      value_nominal: orZero(build.structure_nominal),
      detail: [],
    },
    {
      taxonomy_id: 'build_converter',
      value_pv: proportional(
        orZero(build.converter_nominal),
        totalBuildNom,
        orZero(build.total_pv),
      ),
      value_nominal: orZero(build.converter_nominal),
      detail: [],
    },
    {
      taxonomy_id: 'row_acquisition',
      value_pv: proportional(
        orZero(row.acquisition_nominal),
        orZero(row.acquisition_nominal_total),
        orZero(row.acquisition_pv),
      ),
      value_nominal: orZero(row.acquisition_nominal),
      detail: [],
    },
    {
      taxonomy_id: 'row_holding',
      value_pv: proportional(
        orZero(row.holding_nominal),
        orZero(row.acquisition_nominal_total),
        orZero(row.acquisition_pv),
      ),
      value_nominal: orZero(row.holding_nominal),
      detail: [],
    },
    {
      taxonomy_id: 'env_mitigation',
      value_pv: orZero(env.total_pv),
      value_nominal: orZero(env.total_nominal),
      detail: [],
    },
    {
      taxonomy_id: 'oandm',
      value_pv: orZero(om.total_pv),
      value_nominal: orZero(om.total_nominal),
      value_annual: orNull(om.total_annual),
      detail: [],
    },
    {
      taxonomy_id: 'insurance',
      value_pv: orZero(ins.pv_total),
      value_nominal: orZero(ins.nominal_lifetime_cost),
      value_annual: orNull(ins.annual_premium),
      detail: [],
    },
    {
      taxonomy_id: 'row_rent',
      value_pv: orZero(row.row_rent_pv),
      value_nominal: orZero(row.row_rent_nominal),
      detail: [],
    },
    {
      taxonomy_id: 'line_loss_conductor',
      value_pv: orZero(ll.line_cost_pv),
      value_nominal: orZero(ll.line_nominal_total),
      value_annual: orNull(ll.line_annual_cost),
      detail: [],
    },
    {
      taxonomy_id: 'line_loss_converter',
      value_pv: orZero(ll.converter_cost_pv),
      value_nominal: orZero(ll.converter_nominal_total),
      value_annual: orNull(ll.converter_annual_cost),
      detail: [],
    },
    {
      taxonomy_id: 'base_delay',
      value_pv: orZero(delay.total_pv),
      value_nominal: orZero(delay.total_nominal),
      detail: [],
    },
    {
      taxonomy_id: 'congestion_delay',
      value_pv: orZero(cc.congestion_delay_cost_pv),
      value_nominal: orZero(cc.congestion_delay_cost_nominal),
      detail: [],
    },
    {
      taxonomy_id: 'emissions_displacement_delay',
      value_pv: orZero(dispDelay.displacement_delay_cost_pv),
      value_nominal: orZero(dispDelay.displacement_delay_cost_nominal),
      detail: [],
    },
    {
      taxonomy_id: 'wildfire_eac',
      value_pv: orZero(wf.pv_cost),
      value_nominal: orZero(wf.nominal_total),
      value_annual: orNull(wf.EAL),
      detail: [],
    },
    {
      taxonomy_id: 'outage_eac',
      value_pv: orZero(out.pv_cost),
      value_nominal: orZero(out.nominal_total),
      value_annual: orNull(out.expected_annual_loss),
      detail: [
        {
          dimension: 'component',
          dimension_key: 'load_shed_per_event',
          value_pv: 0,
          value_annual: orZero(out.cost_loadshed),
        },
        {
          dimension: 'component',
          dimension_key: 'redispatch_per_event',
          value_pv: 0,
          value_annual: orZero(out.cost_redispatch),
        },
      ],
    },
    {
      taxonomy_id: 'emissions_comp',
      value_pv: orZero(em.total_pv),
      value_nominal: orZero(em.total_nominal),
      value_annual: orNull(em.annual_cost),
      detail: [],
    },
    {
      taxonomy_id: 'emissions_fac',
      value_pv: orZero(fac.fac_emissions_project_pv),
      value_nominal: orZero(fac.fac_emissions_project_nominal),
      detail: [],
    },
    {
      taxonomy_id: 'congestion_benefit',
      value_pv: orZero(cc.congestion_benefit_pv),
      value_nominal: orZero(cc.congestion_benefit_nominal),
      value_annual: orNull(cc.congestion_benefit_annual),
      detail: [],
    },
    {
      taxonomy_id: 'delivered_energy_benefit',
      value_pv: orZero(cc.delivered_benefit_pv),
      value_nominal: orZero(cc.delivered_benefit_nominal),
      value_annual: orNull(cc.delivered_benefit_annual),
      detail: [],
    },
    {
      taxonomy_id: 'capacity_value_benefit',
      value_pv: orZero(cc.capacity_value_pv),
      value_nominal: orZero(cc.capacity_value_nominal),
      value_annual: orNull(cc.capacity_value_annual),
      detail: [],
    },
    {
      taxonomy_id: 'capital_recovery',
      value_pv: orZero(capRec.capital_recovery_pv),
      value_nominal: orZero(capRec.capital_recovery_real),
      value_annual: orNull(capRec.annual_revenue),
      detail: [],
    },
    {
      taxonomy_id: 'avoided_emissions_benefit',
      value_pv: orZero(fac.displacement_avoided_benefit_pv),
      value_nominal: orZero(fac.displacement_avoided_benefit_nominal),
      detail: [],
    },
  ];
}
