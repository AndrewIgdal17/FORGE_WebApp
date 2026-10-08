import type { TaxonomyDetailRow } from '@/components/results/taxonomy-card';
import { humanizeLabel } from '@/lib/format';
import {
  CATEGORY_LABELS,
  buildResultById,
  deriveTaxonomyResults,
} from '@/lib/results-utils';

export interface TaxonomyItemView {
  id: string;
  label: string;
  category: string;
  subgroup: string;
  displayOrder: number;
}

export interface TaxonomyCardValues {
  annualValue?: number;
  nominalValue?: number;
  pvValue: number;
  detailRows: TaxonomyDetailRow[];
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

/** Match `value_pv || 0`: missing, zero, and NaN become 0. */
function presentValue(row: Record<string, unknown> | null): number {
  if (!row) return 0;
  const value = row.value_pv;
  if (typeof value === 'number') return value || 0;
  return 0;
}

export function resolveResultById(
  results: Record<string, unknown>,
): Record<string, unknown> {
  const existing = results.taxonomy_results;
  if (Array.isArray(existing) && existing.length > 0) return buildResultById(results);
  return buildResultById({ taxonomy_results: deriveTaxonomyResults(results) });
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
      subgroup: typeof record.subgroup === 'string' ? record.subgroup : '',
      displayOrder: typeof record.display_order === 'number' ? record.display_order : 0,
    });
  }
  return items;
}

export function itemPresentValue(
  resultById: Record<string, unknown>,
  id: string,
): number {
  return presentValue(asRecord(resultById[id]));
}

export function itemsInCategory(
  items: TaxonomyItemView[],
  category: string,
): TaxonomyItemView[] {
  return items
    .filter((item) => item.category === category)
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

export function sumPresentValue(
  items: TaxonomyItemView[],
  resultById: Record<string, unknown>,
): number {
  return items.reduce((sum, item) => sum + itemPresentValue(resultById, item.id), 0);
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
    annualValue: annual ? annual : undefined,
    nominalValue: finiteNumber(row?.value_nominal),
    pvValue: presentValue(row),
    detailRows: detailRows(row),
  };
}

export function positiveItems(
  items: TaxonomyItemView[],
  resultById: Record<string, unknown>,
  sortByValue: boolean,
): TaxonomyItemView[] {
  const visible = items.filter((item) => itemPresentValue(resultById, item.id) > 0);
  if (sortByValue) {
    visible.sort(
      (a, b) => itemPresentValue(resultById, b.id) - itemPresentValue(resultById, a.id),
    );
  }
  return visible;
}

export function compositionSegments(
  items: TaxonomyItemView[],
  resultById: Record<string, unknown>,
  sortByValue: boolean,
): Array<{ label: string; value: number }> {
  const segments = items
    .map((item) => ({
      label: item.label,
      value: itemPresentValue(resultById, item.id),
    }))
    .filter((segment) => segment.value > 0);
  if (sortByValue) segments.sort((a, b) => b.value - a.value);
  return segments;
}

export function pvHeading(key: string, noun: 'Costs' | 'Benefits'): string {
  const mapped = CATEGORY_LABELS[key];
  const label = mapped ?? humanizeLabel(key || noun);
  if (/\b(costs|benefits)\b/i.test(label)) return `${label} (PV)`;
  return `${label} ${noun} (PV)`;
}
