import type { TaxonomyDetailRow } from '@/components/results/taxonomy-card';
import { humanizeLabel } from '@/lib/format';
import {
  BENEFIT_CATEGORY_LABELS,
  CATEGORY_LABELS,
  LEGACY_TAXONOMY_ITEMS,
  buildResultById,
  deriveTaxonomyResults,
  readNumber,
  resolvedTaxonomyCategory,
  rowDoesNotApply,
} from '@/lib/results-utils';

export interface TaxonomyItemView {
  id: string;
  label: string;
  category: string;
  subgroup: string | null;
  displayOrder: number;
}

export interface TaxonomyCardValues {
  annualValue?: number;
  nominalValue?: number;
  pvValue: number | null;
  detailRows: TaxonomyDetailRow[];
  missingHover: string;
  doesNotApply: boolean;
}

export { DOES_NOT_APPLY } from '@/lib/results-utils';

const MISSING_INPUT_LABELS: Record<string, string> = {
  congestion_spread_per_mwh: 'Congestion spread (route)',
  hours_receiving_more_congested: 'Hours receiving end is more congested (route)',
  hours_sending_more_congested: 'Hours sending end is more congested (route)',
  receiving_energy_value_per_mwh: 'Receiving-end energy value (route)',
};

export function missingInputsHover(paths: unknown): string {
  if (!Array.isArray(paths)) return '';
  const lines: string[] = [];
  for (const path of paths) {
    if (typeof path !== 'string' || path.length === 0) continue;
    const segment = path.split('.').pop() ?? path;
    const label = MISSING_INPUT_LABELS[segment] ?? path;
    lines.push(`${label}: not measured`);
  }
  return lines.join('\n');
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return undefined;
}

function presentValue(row: Record<string, unknown> | null): number | null {
  if (!row) return null;
  return readNumber(row.value_pv);
}

export function resolveResultById(
  results: Record<string, unknown>,
): Record<string, unknown> {
  const existing = results.taxonomy_results;
  if (Array.isArray(existing) && existing.length > 0) return buildResultById(results);
  return buildResultById({ taxonomy_results: deriveTaxonomyResults(results) });
}

export function withLegacyItems(
  items: TaxonomyItemView[],
  resultById: Record<string, unknown>,
): TaxonomyItemView[] {
  const existing = new Set(items.map((item) => item.id));
  const appended = LEGACY_TAXONOMY_ITEMS.filter(
    (legacy) => legacy.id in resultById && !existing.has(legacy.id),
  );
  return appended.length === 0 ? items : [...items, ...appended];
}

export function readTaxonomyItems(
  taxonomy: Record<string, unknown> | undefined,
): TaxonomyItemView[] {
  const raw = taxonomy?.items;
  if (!Array.isArray(raw)) return [];
  const items: TaxonomyItemView[] = [];
  for (const entry of raw) {
    const record = asRecord(entry);
    if (!record || typeof record.id !== 'string' || !record.id) continue;
    const label = typeof record.label === 'string' && record.label ? record.label : record.id;
    items.push({
      id: record.id,
      label,
      category: typeof record.category === 'string' ? record.category : '',
      subgroup: typeof record.subgroup === 'string' ? record.subgroup : null,
      displayOrder: typeof record.display_order === 'number' ? record.display_order : 0,
    });
  }
  return items;
}

export function itemPresentValue(
  resultById: Record<string, unknown>,
  id: string,
): number | null {
  return presentValue(asRecord(resultById[id]));
}

export function itemsInCategory(
  items: TaxonomyItemView[],
  category: string,
): TaxonomyItemView[] {
  return items
    .filter(
      (item) => resolvedTaxonomyCategory(item.id, item.category) === category,
    )
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

export function sumPresentValue(
  items: TaxonomyItemView[],
  resultById: Record<string, unknown>,
): number {
  return items.reduce((sum, item) => {
    const value = itemPresentValue(resultById, item.id);
    return value === null ? sum : sum + value;
  }, 0);
}

function detailLabel(record: Record<string, unknown>): string {
  if (typeof record.label === 'string' && record.label) return record.label;
  const key = typeof record.key === 'string' && record.key
    ? record.key
    : typeof record.dimension_key === 'string'
      ? record.dimension_key
      : '';
  return key ? humanizeLabel(key) : 'Component';
}

function detailRows(row: Record<string, unknown> | null): TaxonomyDetailRow[] {
  if (!row) return [];
  const raw = row.detail_rows ?? row.detail;
  if (!Array.isArray(raw)) return [];
  const rows: TaxonomyDetailRow[] = [];
  for (const entry of raw) {
    const record = asRecord(entry);
    if (!record) continue;
    const nominal = finiteNumber(record.value_nominal);
    let pv = finiteNumber(record.value_pv);
    if (pv == null) pv = finiteNumber(record.value);
    rows.push({
      label: detailLabel(record),
      nominal,
      pv,
    });
  }
  return rows;
}

export function cardValues(
  resultById: Record<string, unknown>,
  id: string,
): TaxonomyCardValues {
  const row = asRecord(resultById[id]);
  const annual = finiteNumber(row?.value_annual);
  return {
    annualValue: annual,
    nominalValue: finiteNumber(row?.value_nominal),
    pvValue: presentValue(row),
    detailRows: detailRows(row),
    missingHover: missingInputsHover(row?.missing_inputs),
    doesNotApply: rowDoesNotApply(row),
  };
}

export function positiveItems(
  items: TaxonomyItemView[],
  resultById: Record<string, unknown>,
  sortByValue: boolean,
): TaxonomyItemView[] {
  const visible = items.filter((item) => itemPresentValue(resultById, item.id) !== null);
  if (sortByValue) {
    visible.sort((a, b) => {
      const left = itemPresentValue(resultById, a.id);
      const right = itemPresentValue(resultById, b.id);
      if (left === null || right === null) return 0;
      return right - left;
    });
  }
  return visible;
}

export function compositionSegments(
  items: TaxonomyItemView[],
  resultById: Record<string, unknown>,
  sortByValue: boolean,
): Array<{ label: string; value: number }> {
  const segments = items.flatMap((item) => {
    const value = itemPresentValue(resultById, item.id);
    if (value === null || value <= 0) return [];
    return [{ label: item.label, value }];
  });
  if (sortByValue) segments.sort((a, b) => b.value - a.value);
  return segments;
}

export function pvHeading(key: string, noun: 'Costs' | 'Benefits'): string {
  const labels = noun === 'Benefits' ? BENEFIT_CATEGORY_LABELS : CATEGORY_LABELS;
  const mapped = labels[key];
  const label = mapped ?? humanizeLabel(key || noun);
  if (/\b(costs|benefits)\b/i.test(label)) return `${label} (PV)`;
  return `${label} ${noun} (PV)`;
}
