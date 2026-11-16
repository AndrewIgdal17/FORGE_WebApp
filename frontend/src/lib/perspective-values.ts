import { buildResultById, rowDoesNotApply } from '@/lib/results-utils';

/**
 * Utility and ratepayer values discount at the real WACC (methodology §III.5).
 * The calculator carries each item's WACC present value as `value_pv_wacc` in
 * `taxonomy_results`; the flat `bcr.*_pv` keys hold societal values.
 *
 * Returns the sum of `value_pv_wacc` over `ids`, or null when any item or its
 * WACC value is missing. It never substitutes the societal value.
 */
export function waccValueSum(
  results: Record<string, unknown>,
  ids: readonly string[],
): number | null {
  const rows = results.taxonomy_results;
  if (!Array.isArray(rows)) return null;
  const byId = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    if (row && typeof row === 'object') {
      const record = row as Record<string, unknown>;
      if (typeof record.taxonomy_id === 'string') byId.set(record.taxonomy_id, record);
    }
  }
  let total = 0;
  for (const id of ids) {
    const value = byId.get(id)?.value_pv_wacc;
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    total += value;
  }
  return total;
}

function rowUnavailable(row: unknown): boolean {
  if (!row || typeof row !== 'object') return false;
  const record = row as Record<string, unknown>;
  if (record.available === false) return true;
  if (record.state === 'not_available') return true;
  return false;
}

/**
 * Sum WACC present values for a multi-item category row (e.g. market benefits).
 * Skips items that do not apply and items that are unavailable; null only when
 * every applying item is unavailable.
 */
export function waccApplyingValueSum(
  results: Record<string, unknown>,
  ids: readonly string[],
): number | null {
  const rows = results.taxonomy_results;
  if (!Array.isArray(rows)) return null;
  const byId = buildResultById(results);
  let sum = 0;
  let hasValue = false;
  let applying = 0;
  let unavailable = 0;
  for (const id of ids) {
    const row = byId[id];
    if (rowDoesNotApply(row)) continue;
    applying += 1;
    if (!row || rowUnavailable(row)) {
      unavailable += 1;
      continue;
    }
    const value = (row as Record<string, unknown>).value_pv_wacc;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      unavailable += 1;
      continue;
    }
    sum += value;
    hasValue = true;
  }
  if (applying === 0) return null;
  if (unavailable === applying && !hasValue) return null;
  return hasValue ? sum : null;
}
