import type { ReactElement, ReactNode } from 'react';
import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CustomBCRPanel } from '@/components/results/custom-bcr-panel';
import {
  PERSPECTIVE_DEFINITIONS,
  type PerspectiveKey,
} from '@/components/results/perspective-toggle';
import { formatNumber, formatSignedNumberValue } from '@/lib/format';
import { getValueAtPath } from '@/lib/path';

export interface SensitivityViewProps {
  results: Record<string, unknown>;
  taxonomy?: Record<string, unknown>;
  perspective: PerspectiveKey;
}

interface ExclusionSpec {
  key: string;
  label: string;
  phrase: string;
}

interface TornadoRow {
  key: string;
  label: string;
  phrase: string;
  exclusionBcr: number;
  delta: number;
}

const EXCLUSIONS: readonly ExclusionSpec[] = [
  {
    key: 'bcr_excluding_avoided_emissions',
    label: 'Excl. Avoided Emissions',
    phrase: 'avoided emissions',
  },
  {
    key: 'bcr_excluding_wildfire_risk',
    label: 'Excl. Wildfire',
    phrase: 'wildfire',
  },
  {
    key: 'bcr_excluding_wildfire_risk_and_outage_risk',
    label: 'Excl. Wildfire + Outage',
    phrase: 'wildfire + outage',
  },
  {
    key: 'bcr_excluding_outage_risk',
    label: 'Excl. Outage',
    phrase: 'outage',
  },
  {
    key: 'bcr_excluding_emissions',
    label: 'Excl. Emissions Costs',
    phrase: 'emissions costs',
  },
];

const POSITIVE_BAR = '#059669';
const NEGATIVE_BAR = '#dc2626';

function readNumber(results: Record<string, unknown>, path: string): number | null {
  const value = getValueAtPath(results, path);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

function tornadoRows(
  results: Record<string, unknown>,
  baseline: number,
): TornadoRow[] {
  const rows: TornadoRow[] = [];
  for (const spec of EXCLUSIONS) {
    const exclusionBcr = readNumber(results, `bcr.${spec.key}`);
    if (exclusionBcr == null) continue;
    rows.push({
      key: spec.key,
      label: spec.label,
      phrase: spec.phrase,
      exclusionBcr,
      delta: exclusionBcr - baseline,
    });
  }
  rows.sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta));
  return rows;
}

function deltaDomain(rows: readonly TornadoRow[]): [number, number] {
  let min = 0;
  let max = 0;
  for (const row of rows) {
    min = Math.min(min, row.delta);
    max = Math.max(max, row.delta);
  }
  if (min === 0 && max === 0) return [-0.1, 0.1];
  const pad = Math.max(0.05, (max - min) * 0.12);
  return [min - pad, max + pad];
}

function interpretation(rows: readonly TornadoRow[], baseline: number): string {
  if (rows.length === 0) {
    return 'No exclusion variants are available for this result.';
  }

  const pushes = rows.filter((row) => baseline < 1 && row.exclusionBcr >= 1);
  const dropsBelow = rows.filter((row) => baseline >= 1 && row.exclusionBcr < 1);
  const sentences: string[] = [];

  for (const row of pushes) {
    sentences.push(`Excluding ${row.phrase} pushes BCR above 1.0.`);
  }
  for (const row of dropsBelow) {
    sentences.push(
      `Excluding ${row.phrase} drops it to ${formatNumber(row.exclusionBcr, 2)}.`,
    );
  }

  if (baseline < 1) {
    const worst = rows.find((row) => row.delta < 0 && row.exclusionBcr < 1);
    if (worst) {
      sentences.push(
        `Excluding ${worst.phrase} drops it to ${formatNumber(worst.exclusionBcr, 2)}.`,
      );
    }
  }

  if (pushes.length > 0 || dropsBelow.length > 0) {
    sentences.push('These assumptions define whether the project clears the threshold.');
  } else if (baseline >= 1) {
    sentences.push('None of these exclusions drop BCR below 1.0.');
  } else if (!rows.some((row) => row.exclusionBcr >= 1)) {
    sentences.push('None of these exclusions push BCR above 1.0.');
  }

  return sentences.join(' ');
}

function TornadoTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: TornadoRow }>;
}): ReactElement | null {
  if (!active || payload == null || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (row == null) return null;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm">
      <p className="font-medium">{row.label}</p>
      <p className="tabular-nums">BCR {formatNumber(row.exclusionBcr, 3)}</p>
      <p className="tabular-nums">ΔBCR {formatSignedNumberValue(row.delta, 3)}</p>
    </div>
  );
}

function renderTooltip(props: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: TornadoRow }>;
}): ReactNode {
  return <TornadoTooltip active={props.active} payload={props.payload} />;
}

function formatDeltaTick(value: number): string {
  return formatSignedNumberValue(value, 2);
}

export function SensitivityView({
  results,
  taxonomy,
  perspective,
}: SensitivityViewProps): ReactElement {
  const baseline = readNumber(results, PERSPECTIVE_DEFINITIONS[perspective].bcrPath);
  const rows = baseline == null ? [] : tornadoRows(results, baseline);
  const chartHeight = Math.max(220, rows.length * 52);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Exclusion impact</h2>
        {baseline == null || rows.length === 0 ? (
          <p className="text-sm text-slate-500">
            {baseline == null
              ? 'No baseline BCR for this perspective.'
              : 'No exclusion variants are available for this result.'}
          </p>
        ) : (
          <>
            <div className="w-full min-w-0" style={{ height: chartHeight }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={rows}
                  layout="vertical"
                  margin={{ top: 16, right: 24, left: 8, bottom: 4 }}
                >
                  <XAxis
                    type="number"
                    domain={deltaDomain(rows)}
                    tickFormatter={formatDeltaTick}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={168}
                    interval={0}
                    reversed
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip content={renderTooltip} />
                  <ReferenceLine
                    x={0}
                    stroke="#94a3b8"
                    strokeDasharray="3 3"
                    label={{
                      value: `Baseline ${formatNumber(baseline, 2)}`,
                      position: 'insideTopRight',
                      fill: '#64748b',
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="delta" name="ΔBCR" radius={[0, 4, 4, 0]}>
                    {rows.map((row) => (
                      <Cell
                        key={row.key}
                        fill={row.delta >= 0 ? POSITIVE_BAR : NEGATIVE_BAR}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-slate-500">
              Positive deltas mean removing that cost improved the ratio. Negative deltas mean
              removing that benefit hurt the ratio.
            </p>
            <p className="text-sm leading-relaxed text-slate-700">
              {interpretation(rows, baseline)}
            </p>
          </>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Build Your Own Exclusion</h2>
        <CustomBCRPanel results={results} taxonomy={taxonomy} />
      </section>
    </div>
  );
}
