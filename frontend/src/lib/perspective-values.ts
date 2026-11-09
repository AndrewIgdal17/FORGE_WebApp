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
