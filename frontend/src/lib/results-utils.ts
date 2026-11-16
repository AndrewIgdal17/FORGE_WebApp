export const COMPOSITION_COLORS: string[] = [
  '#0066cc',
  '#2563eb',
  '#3b82f6',
  '#60a5fa',
  '#93c5fd',
];

export const CATEGORY_LABELS: Record<string, string> = {
  capital: 'Capital costs',
  delay_period: 'Delay-period costs',
  operating: 'Operating costs',
  external: 'External costs',
  risk: 'Risk',
  emissions: 'Emissions',
  transfer: 'Revenue (Transfer)',
  reporting: 'Transfers & Reporting',
};

export const COST_CATEGORY_ORDER: string[] = [
  'capital',
  'delay_period',
  'operating',
  'external',
];

export const BENEFIT_CATEGORY_LABELS: Record<string, string> = {
  market: 'Market benefits',
  external: 'External benefits',
};

export const BENEFIT_CATEGORY_ORDER: string[] = ['market', 'external'];

export type ReportingKey =
  | 'capital'
  | 'delay_period'
  | 'operating'
  | 'external'
  | 'external_risk'
  | 'external_emissions'
  | 'market'
  | 'external_benefits';

export const REPORTING_PATHS: Record<ReportingKey, string> = {
  capital: 'bcr.capital_costs_pv',
  delay_period: 'bcr.delay_period_costs_pv',
  operating: 'bcr.operating_costs_pv',
  external: 'bcr.external_costs_pv',
  external_risk: 'bcr.external_risk_costs_pv',
  external_emissions: 'bcr.external_emissions_costs_pv',
  market: 'bcr.benefits_market_pv',
  external_benefits: 'bcr.benefits_external_pv',
};

type ResultCategoryMeta = {
  side: 'cost' | 'benefit';
  category: 'capital' | 'delay_period' | 'operating' | 'external' | 'market';
  subgroup: 'risk' | 'emissions' | null;
};

export const RESULT_CATEGORY: Record<string, ResultCategoryMeta> = {
  build_conductor: { side: 'cost', category: 'capital', subgroup: null },
  build_structure: { side: 'cost', category: 'capital', subgroup: null },
  build_converter: { side: 'cost', category: 'capital', subgroup: null },
  row_acquisition: { side: 'cost', category: 'capital', subgroup: null },
  env_mitigation: { side: 'cost', category: 'capital', subgroup: null },
  base_delay: { side: 'cost', category: 'delay_period', subgroup: null },
  row_holding: { side: 'cost', category: 'delay_period', subgroup: null },
  oandm: { side: 'cost', category: 'operating', subgroup: null },
  insurance: { side: 'cost', category: 'operating', subgroup: null },
  row_rent: { side: 'cost', category: 'operating', subgroup: null },
  line_loss_conductor: { side: 'cost', category: 'operating', subgroup: null },
  line_loss_converter: { side: 'cost', category: 'operating', subgroup: null },
  wildfire_eac: { side: 'cost', category: 'external', subgroup: 'risk' },
  outage_eac: { side: 'cost', category: 'external', subgroup: 'risk' },
  emissions_comp: { side: 'cost', category: 'external', subgroup: 'emissions' },
  congestion_benefit: { side: 'benefit', category: 'market', subgroup: null },
  delivered_energy_benefit: { side: 'benefit', category: 'market', subgroup: null },
  capacity_value_benefit: { side: 'benefit', category: 'market', subgroup: null },
  avoided_emissions_benefit: {
    side: 'benefit',
    category: 'external',
    subgroup: null,
  },
};

function readPath(results: Record<string, unknown>, path: string): unknown {
  let node: unknown = results;
  for (const part of path.split('.')) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

function usesStoredCategoryTotals(results: Record<string, unknown>): boolean {
  const bcr = results.bcr;
  if (!bcr || typeof bcr !== 'object' || Array.isArray(bcr)) return false;
  return Object.prototype.hasOwnProperty.call(bcr, 'delay_period_costs_pv');
}

function rowUnavailable(row: unknown): boolean {
  if (!row || typeof row !== 'object') return false;
  const record = row as Record<string, unknown>;
  if (record.available === false) return true;
  if (record.state === 'not_available') return true;
  return false;
}

function matchesReportingKey(
  meta: ResultCategoryMeta,
  key: ReportingKey,
): boolean {
  switch (key) {
    case 'capital':
      return meta.side === 'cost' && meta.category === 'capital';
    case 'delay_period':
      return meta.side === 'cost' && meta.category === 'delay_period';
    case 'operating':
      return meta.side === 'cost' && meta.category === 'operating';
    case 'external':
      return meta.side === 'cost' && meta.category === 'external';
    case 'external_risk':
      return (
        meta.side === 'cost'
        && meta.category === 'external'
        && meta.subgroup === 'risk'
      );
    case 'external_emissions':
      return (
        meta.side === 'cost'
        && meta.category === 'external'
        && meta.subgroup === 'emissions'
      );
    case 'market':
      return meta.side === 'benefit' && meta.category === 'market';
    case 'external_benefits':
      return meta.side === 'benefit' && meta.category === 'external';
    default:
      return false;
  }
}

function taxonomyIdsForKey(key: ReportingKey): string[] {
  return Object.entries(RESULT_CATEGORY)
    .filter(([, meta]) => matchesReportingKey(meta, key))
    .map(([id]) => id);
}

function resolveResultById(results: Record<string, unknown>): Record<string, unknown> {
  const existing = results.taxonomy_results;
  if (Array.isArray(existing) && existing.length > 0) return buildResultById(results);
  return buildResultById({ taxonomy_results: deriveTaxonomyResults(results) });
}

function legacyCategoryTotal(
  results: Record<string, unknown>,
  key: ReportingKey,
): number | null {
  const bcr = results.bcr;
  if (!bcr || typeof bcr !== 'object' || Array.isArray(bcr)) return null;
  const record = bcr as Record<string, unknown>;
  const part = (field: string): number | null => {
    if (!Object.prototype.hasOwnProperty.call(record, field)) return null;
    return readNumber(record[field]); // legacy stored-result key
  };
  if (key === 'market') {
    const remedial = part('benefits_remedial_pv'); // legacy stored-result key
    const enabling = part('benefits_enabling_pv'); // legacy stored-result key
    if (remedial === null || enabling === null) return null;
    return remedial + enabling;
  }
  if (key === 'external_risk') {
    return part('risk_costs_pv'); // legacy stored-result key
  }
  if (key === 'external_emissions') {
    return part('emissions_costs_pv'); // legacy stored-result key
  }
  if (key === 'external') {
    const risk = part('risk_costs_pv'); // legacy stored-result key
    const emissions = part('emissions_costs_pv'); // legacy stored-result key
    if (risk === null || emissions === null) return null;
    return risk + emissions;
  }
  if (key === 'external_benefits') {
    return part('benefits_avoided_emissions_pv'); // legacy stored-result key
  }
  return null;
}

export function readCategoryTotal(
  results: Record<string, unknown>,
  key: ReportingKey,
): number | null {
  if (usesStoredCategoryTotals(results)) {
    const path = REPORTING_PATHS[key];
    const raw = readPath(results, path);
    if (raw === undefined || raw === null) return null;
    return readNumber(raw);
  }

  const resultById = resolveResultById(results);
  const ids = taxonomyIdsForKey(key);
  let sum = 0;
  let hasValue = false;
  let applying = 0;
  let unavailable = 0;
  let incomplete = false;

  for (const id of ids) {
    const row = resultById[id];
    if (rowDoesNotApply(row)) continue;
    applying += 1;
    if (!row) {
      incomplete = true;
      continue;
    }
    if (rowUnavailable(row)) {
      unavailable += 1;
      continue;
    }
    const pv = readNumber((row as Record<string, unknown>).value_pv);
    if (pv === null) {
      incomplete = true;
      continue;
    }
    sum += pv;
    hasValue = true;
  }

  if (applying > 0 && unavailable === applying && !hasValue) return null;
  if (!incomplete) return hasValue ? sum : null;

  const fallbackKeys: ReportingKey[] = [
    'market',
    'external_risk',
    'external_emissions',
    'external',
    'external_benefits',
  ];
  if (fallbackKeys.includes(key)) return legacyCategoryTotal(results, key);
  return null;
}

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

export const DOES_NOT_APPLY = 'Does not apply';

/** True when the value at a state path (e.g. `delay_comparison.states.delay_cost_cong`) is
 * "does_not_apply" (Spec 12). */
export function stateDoesNotApply(
  results: Record<string, unknown> | null | undefined,
  statePath: string,
): boolean {
  if (!results) return false;
  let node: unknown = results;
  for (const part of statePath.split('.')) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return false;
    node = (node as Record<string, unknown>)[part];
  }
  return node === 'does_not_apply';
}

/** A taxonomy result's state is "does not apply" (Spec 11): `state` when present,
 * else `applies: false` (Spec 10 rows), else it applies. */
export function rowDoesNotApply(row: unknown): boolean {
  if (!row || typeof row !== 'object') return false;
  const record = row as Record<string, unknown>;
  if (typeof record.state === 'string') return record.state === 'does_not_apply';
  return record.applies === false;
}

/** True only when results record the item as not applying. */
export function itemDoesNotApply(
  results: Record<string, unknown> | null | undefined,
  taxonomyId: string,
): boolean {
  if (!results) return false;
  return rowDoesNotApply(buildResultById(results)[taxonomyId]);
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
  delivered_energy_benefit: 'Delivered energy',
  line_loss_converter: 'Converter losses',
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
