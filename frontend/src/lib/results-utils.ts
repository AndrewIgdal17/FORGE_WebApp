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

export function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

const OMITTED_LABELS: Record<string, string> = {
  avoided_emissions_benefit: 'Avoided emissions',
  congestion_benefit: 'Congestion relief',
  emissions_comp: 'Loss-compensation emissions',
  line_loss_conductor: 'Conductor losses',
};

export function excludesNote(ids: string[]): string {
  const labels = ids.map((id) => OMITTED_LABELS[id] ?? id);
  return `Excludes: ${labels.join(', ')}.`;
}

function proportional(
  compNom: number | null,
  totalNom: number | null,
  totalPV: number | null,
): number | null {
  if (compNom === null || totalNom === null || totalPV === null) return null;
  if (totalNom === 0) return 0;
  return (totalPV * compNom) / totalNom;
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
  const avoided = asRecord(benefits.avoided_emissions);
  const ll = asRecord(costs.line_loss);
  const build = asRecord(costs.build);
  const row = asRecord(costs.row);
  const env = asRecord(costs.environmental);
  const om = asRecord(costs.oandm);
  const ins = asRecord(costs.insurance);
  const delay = asRecord(costs.delay);
  const totalBuildNom = readNumber(build.total_nominal);

  return [
    {
      taxonomy_id: 'build_conductor',
      value_pv: proportional(
        readNumber(build.conductor_nominal),
        totalBuildNom,
        readNumber(build.total_pv),
      ),
      value_nominal: readNumber(build.conductor_nominal),
      detail: [],
    },
    {
      taxonomy_id: 'build_structure',
      value_pv: proportional(
        readNumber(build.structure_nominal),
        totalBuildNom,
        readNumber(build.total_pv),
      ),
      value_nominal: readNumber(build.structure_nominal),
      detail: [],
    },
    {
      taxonomy_id: 'build_converter',
      value_pv: proportional(
        readNumber(build.converter_nominal),
        totalBuildNom,
        readNumber(build.total_pv),
      ),
      value_nominal: readNumber(build.converter_nominal),
      detail: [],
    },
    {
      taxonomy_id: 'row_acquisition',
      value_pv: proportional(
        readNumber(row.acquisition_nominal),
        readNumber(row.acquisition_nominal_total),
        readNumber(row.acquisition_pv),
      ),
      value_nominal: readNumber(row.acquisition_nominal),
      detail: [],
    },
    {
      taxonomy_id: 'row_holding',
      value_pv: proportional(
        readNumber(row.holding_nominal),
        readNumber(row.acquisition_nominal_total),
        readNumber(row.acquisition_pv),
      ),
      value_nominal: readNumber(row.holding_nominal),
      detail: [],
    },
    {
      taxonomy_id: 'env_mitigation',
      value_pv: readNumber(env.total_pv),
      value_nominal: readNumber(env.total_nominal),
      detail: [],
    },
    {
      taxonomy_id: 'oandm',
      value_pv: readNumber(om.total_pv),
      value_nominal: readNumber(om.total_nominal),
      value_annual: readNumber(om.total_annual),
      detail: [],
    },
    {
      taxonomy_id: 'insurance',
      value_pv: readNumber(ins.pv_total),
      value_nominal: readNumber(ins.nominal_lifetime_cost),
      value_annual: readNumber(ins.annual_premium),
      detail: [],
    },
    {
      taxonomy_id: 'row_rent',
      value_pv: readNumber(row.row_rent_pv),
      value_nominal: readNumber(row.row_rent_nominal),
      detail: [],
    },
    {
      taxonomy_id: 'line_loss_conductor',
      value_pv: readNumber(ll.line_cost_pv),
      value_nominal: readNumber(ll.line_nominal_total),
      value_annual: readNumber(ll.line_annual_cost),
      detail: [],
    },
    {
      taxonomy_id: 'line_loss_converter',
      value_pv: readNumber(ll.converter_cost_pv),
      value_nominal: readNumber(ll.converter_nominal_total),
      value_annual: readNumber(ll.converter_annual_cost),
      detail: [],
    },
    {
      taxonomy_id: 'base_delay',
      value_pv: readNumber(delay.total_pv),
      value_nominal: readNumber(delay.total_nominal),
      detail: [],
    },
    {
      taxonomy_id: 'wildfire_eac',
      value_pv: readNumber(wf.pv_cost),
      value_nominal: readNumber(wf.nominal_total),
      value_annual: readNumber(wf.EAL),
      detail: [],
    },
    {
      taxonomy_id: 'outage_eac',
      value_pv: readNumber(out.pv_cost),
      value_nominal: readNumber(out.nominal_total),
      value_annual: readNumber(out.expected_annual_loss),
      detail: [
        {
          dimension: 'component',
          dimension_key: 'load_shed_per_event',
          value_pv: 0,
          value_annual: readNumber(out.cost_loadshed),
        },
        {
          dimension: 'component',
          dimension_key: 'redispatch_per_event',
          value_pv: 0,
          value_annual: readNumber(out.cost_redispatch),
        },
      ],
    },
    {
      taxonomy_id: 'emissions_comp',
      value_pv: readNumber(em.total_pv),
      value_nominal: readNumber(em.total_nominal),
      value_annual: readNumber(em.annual_cost),
      detail: [],
    },
    {
      taxonomy_id: 'congestion_benefit',
      value_pv: readNumber(cc.congestion_benefit_pv),
      value_nominal: readNumber(cc.congestion_benefit_nominal),
      value_annual: readNumber(cc.congestion_benefit_annual),
      detail: [],
    },
    {
      taxonomy_id: 'delivered_energy_benefit',
      value_pv: readNumber(cc.delivered_benefit_pv),
      value_nominal: readNumber(cc.delivered_benefit_nominal),
      value_annual: readNumber(cc.delivered_benefit_annual),
      detail: [],
    },
    {
      taxonomy_id: 'capacity_value_benefit',
      value_pv: readNumber(cc.capacity_value_pv),
      value_nominal: readNumber(cc.capacity_value_nominal),
      value_annual: readNumber(cc.capacity_value_annual),
      detail: [],
    },
    {
      taxonomy_id: 'capital_recovery',
      value_pv: readNumber(capRec.capital_recovery_pv),
      value_nominal: readNumber(capRec.capital_recovery_real),
      value_annual: readNumber(capRec.annual_revenue),
      detail: [],
    },
    {
      taxonomy_id: 'avoided_emissions_benefit',
      value_pv: readNumber(avoided.avoided_emissions_pv),
      value_nominal: readNumber(avoided.avoided_emissions_nominal),
      detail: [],
    },
  ];
}
