import { useMemo, useState, type ReactElement } from 'react';
import { ComparisonColumnPicker, readStoredComparisonKeys, writeStoredComparisonKeys } from '@/components/comparison/comparison-column-picker';
import { ComparisonHeader } from '@/components/comparison/comparison-header';
import { DeltaDisplay, formatComparisonValue } from '@/components/comparison/delta-display';
import { Card } from '@/components/ui/card';
import {
  COMPARISON_GROUP_SUPERGROUP,
  COMPARISON_METRIC_KEY_ORDER,
  COMPARISON_METRICS,
  UNKNOWN_METRIC_CATALOG_INDEX,
  type ComparisonMetric,
} from '@/data/configs';
import { getValueAtPath } from '@/lib/path';
import type { Scenario } from '@/stores/scenario-store';

export interface ComparisonTableProps {
  scenarios: Scenario[];
  baselineId: string;
  showDelta: boolean;
  showPercentDelta: boolean;
}

interface CatalogEntry {
  metric: ComparisonMetric;
  group: string;
}

const METRIC_CATALOG: Map<string, CatalogEntry> = new Map();
for (const group of COMPARISON_METRICS) {
  for (const metric of group.metrics) {
    if (!METRIC_CATALOG.has(metric.key)) {
      METRIC_CATALOG.set(metric.key, { metric, group: group.group });
    }
  }
}

function isAvoidedCostMetric(key: string): boolean {
  const entry = METRIC_CATALOG.get(key);
  if (!entry) return false;
  return COMPARISON_GROUP_SUPERGROUP[entry.group] === 'costs';
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return null;
}

function computeCustomMetric(results: Record<string, unknown>, key: string): number {
  const bcr = results.bcr;
  const record =
    bcr && typeof bcr === 'object' && !Array.isArray(bcr)
      ? (bcr as Record<string, unknown>)
      : {};
  const benefits = finiteNumber(record.total_benefits_pv) ?? 0;
  const costs = finiteNumber(record.total_costs_pv) ?? 0;
  if (key === 'custom_bcr') return costs > 0 ? benefits / costs : 0;
  return benefits - costs;
}

function readMetricValue(scenario: Scenario, metric: ComparisonMetric): unknown {
  if (!scenario.results) return undefined;
  if (metric.key === 'custom_bcr' || metric.key === 'custom_nb') {
    return computeCustomMetric(scenario.results, metric.key);
  }
  const raw = getValueAtPath(scenario.results, metric.path);
  if ((raw === undefined || raw === null) && metric.zeroIfMissing) return 0;
  return raw;
}

function sortMetricKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const ia = COMPARISON_METRIC_KEY_ORDER.get(a) ?? UNKNOWN_METRIC_CATALOG_INDEX;
    const ib = COMPARISON_METRIC_KEY_ORDER.get(b) ?? UNKNOWN_METRIC_CATALOG_INDEX;
    if (ia !== ib) return ia - ib;
    return a.localeCompare(b);
  });
}

interface BodyRow {
  kind: 'group' | 'metric';
  group: string;
  metric?: ComparisonMetric;
}

function buildBodyRows(activeKeys: string[]): BodyRow[] {
  const rows: BodyRow[] = [];
  let lastGroup: string | null = null;
  for (const key of sortMetricKeys(activeKeys)) {
    const entry = METRIC_CATALOG.get(key);
    if (!entry) continue;
    if (entry.group !== lastGroup) {
      rows.push({ kind: 'group', group: entry.group });
      lastGroup = entry.group;
    }
    rows.push({ kind: 'metric', group: entry.group, metric: entry.metric });
  }
  return rows;
}

function MetricCell({
  scenario,
  metric,
  baseline,
  showDelta,
  showPercentDelta,
}: {
  scenario: Scenario;
  metric: ComparisonMetric;
  baseline: Scenario | undefined;
  showDelta: boolean;
  showPercentDelta: boolean;
}): ReactElement {
  const raw = readMetricValue(scenario, metric);
  const isBaseline = baseline !== undefined && scenario.id === baseline.id;
  const deltaMode = (showDelta || showPercentDelta) && !isBaseline && metric.format !== 'text';
  const value = finiteNumber(raw);
  const baselineValue = baseline ? finiteNumber(readMetricValue(baseline, metric)) : null;

  if (deltaMode && value !== null && baselineValue !== null) {
    return (
      <DeltaDisplay
        value={value}
        baselineValue={baselineValue}
        format={metric.format}
        showDelta={showDelta}
        showPercentDelta={showPercentDelta}
        invertDelta={isAvoidedCostMetric(metric.key)}
      />
    );
  }

  return (
    <div className="text-right tabular-nums">{formatComparisonValue(raw, metric.format)}</div>
  );
}

export function ComparisonTable({
  scenarios,
  baselineId,
  showDelta,
  showPercentDelta,
}: ComparisonTableProps): ReactElement {
  const [activeKeys, setActiveKeys] = useState<string[]>(readStoredComparisonKeys);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());

  const visibleScenarios = useMemo(
    () => scenarios.filter((scenario) => !hiddenIds.has(scenario.id)),
    [scenarios, hiddenIds],
  );
  const baseline = visibleScenarios.find((scenario) => scenario.id === baselineId);
  const rows = useMemo(() => buildBodyRows(activeKeys), [activeKeys]);
  const columnCount = 1 + visibleScenarios.length;

  function toggleKey(key: string): void {
    setActiveKeys((current) => {
      const next = current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key];
      writeStoredComparisonKeys(next);
      return next;
    });
  }

  function removeScenario(id: string): void {
    setHiddenIds((current) => {
      const next = new Set(current);
      next.add(id);
      return next;
    });
  }

  return (
    <Card className="overflow-hidden py-0">
      <div className="overflow-x-auto">
        <table className="w-max min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="sticky left-0 z-10 bg-muted/40 p-2 text-left align-bottom">
                <ComparisonColumnPicker activeKeys={activeKeys} onToggle={toggleKey} />
              </th>
              {visibleScenarios.map((scenario) => (
                <th key={scenario.id} className="p-2 text-left align-bottom font-normal">
                  <ComparisonHeader
                    scenario={scenario}
                    isBaseline={scenario.id === baselineId}
                    onRemove={() => removeScenario(scenario.id)}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleScenarios.length === 0 ? (
              <tr>
                <td colSpan={columnCount} className="p-6 text-center text-muted-foreground">
                  Select scenarios to compare.
                </td>
              </tr>
            ) : null}
            {rows.map((row) =>
              row.kind === 'group' ? (
                <tr key={`group:${row.group}`} className="border-b bg-muted/30">
                  <th
                    colSpan={columnCount}
                    className="sticky left-0 px-3 py-1.5 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                  >
                    {row.group}
                  </th>
                </tr>
              ) : (
                <tr key={row.metric?.key} className="border-b last:border-b-0">
                  <th
                    className="sticky left-0 z-10 bg-card px-3 py-2 text-left text-xs font-medium whitespace-nowrap"
                    title={row.metric?.description}
                  >
                    {row.metric?.label}
                  </th>
                  {visibleScenarios.map((scenario) => (
                    <td key={scenario.id} className="px-3 py-2 align-top">
                      {row.metric ? (
                        <MetricCell
                          scenario={scenario}
                          metric={row.metric}
                          baseline={baseline}
                          showDelta={showDelta}
                          showPercentDelta={showPercentDelta}
                        />
                      ) : null}
                    </td>
                  ))}
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
