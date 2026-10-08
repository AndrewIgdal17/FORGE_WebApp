import type { ReactElement, ReactNode } from 'react';
import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { PerspectiveKey } from '@/components/results/perspective-toggle';
import { formatCurrency } from '@/lib/format';

export interface TimelineChartProps {
  results: Record<string, unknown>;
  perspective: PerspectiveKey;
}

type Phase = 'delay' | 'construction' | 'operation';

interface TimelinePoint {
  year: number;
  phase: Phase;
  npv: number | null;
}

interface Breakeven {
  year: number;
  phase: Phase;
}

const NPV_FIELD: Record<PerspectiveKey, string> = {
  societal: 'npv_societal',
  ratepayer: 'npv_ratepayer',
  utility: 'npv_utility',
};

const POSITIVE_COLOR = '#059669';
const NEGATIVE_COLOR = '#dc2626';

const PHASES: readonly {
  phase: Phase;
  label: string;
  color: string;
}[] = [
  { phase: 'delay', label: 'Delay', color: '#eab308' },
  { phase: 'construction', label: 'Construction', color: '#3b82f6' },
  { phase: 'operation', label: 'Operation', color: '#16a34a' },
];

function isPhase(value: unknown): value is Phase {
  return value === 'delay' || value === 'construction' || value === 'operation';
}

function readNpv(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

function readTrajectory(
  results: Record<string, unknown>,
  perspective: PerspectiveKey,
): TimelinePoint[] {
  const raw = results.trajectory;
  if (!Array.isArray(raw)) return [];
  const field = NPV_FIELD[perspective];
  const points: TimelinePoint[] = [];
  for (const item of raw) {
    if (item == null || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    if (typeof row.year !== 'number' || !Number.isFinite(row.year)) continue;
    if (!isPhase(row.phase)) continue;
    points.push({
      year: row.year,
      phase: row.phase,
      npv: readNpv(row[field]),
    });
  }
  return points;
}

function finalNpv(points: readonly TimelinePoint[]): number | null {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const value = points[index]?.npv;
    if (value != null) return value;
  }
  return null;
}

function findBreakeven(points: readonly TimelinePoint[]): Breakeven | null {
  let previous: number | null = null;
  for (const point of points) {
    if (point.npv == null) continue;
    if (previous != null) {
      const crossedUp = previous < 0 && point.npv >= 0;
      const crossedDown = previous > 0 && point.npv <= 0;
      if (crossedUp || crossedDown) {
        return { year: point.year, phase: point.phase };
      }
    }
    previous = point.npv;
  }
  return null;
}

function breakevenSentence(crossing: Breakeven | null): string {
  if (crossing == null) {
    return 'Net benefit never crosses zero — the project does not break even under this perspective.';
  }
  return `Breakeven: Year ${crossing.year} (${crossing.phase} phase)`;
}

function countPhases(points: readonly TimelinePoint[]): Record<Phase, number> {
  const counts: Record<Phase, number> = { delay: 0, construction: 0, operation: 0 };
  for (const point of points) {
    counts[point.phase] += 1;
  }
  return counts;
}

function npvDomain(points: readonly TimelinePoint[]): [number, number] {
  let min = 0;
  let max = 0;
  for (const point of points) {
    if (point.npv == null) continue;
    min = Math.min(min, point.npv);
    max = Math.max(max, point.npv);
  }
  if (min === 0 && max === 0) return [-1, 1];
  const pad = (max - min) * 0.08;
  return [min - pad, max + pad];
}

function yearTicks(points: readonly TimelinePoint[]): number[] {
  if (points.length === 0) return [];
  const first = points[0]?.year ?? 0;
  const last = points[points.length - 1]?.year ?? first;
  const ticks: number[] = [];
  for (let year = first; year <= last; year += 10) {
    ticks.push(year);
  }
  if (ticks[ticks.length - 1] !== last) ticks.push(last);
  return ticks;
}

function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return '';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(0)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return formatCurrency(value, 0);
}

function TimelineTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: TimelinePoint }>;
}): ReactElement | null {
  if (!active || payload == null || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (point == null) return null;
  const dollars = point.npv == null ? 'N/A' : formatCurrency(point.npv, 0);
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm">
      <p className="font-medium">Year {point.year}</p>
      <p className="capitalize text-slate-600">{point.phase} phase</p>
      <p className="tabular-nums">{dollars}</p>
    </div>
  );
}

function renderTooltip(props: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: TimelinePoint }>;
}): ReactNode {
  return <TimelineTooltip active={props.active} payload={props.payload} />;
}

export function TimelineChart({
  results,
  perspective,
}: TimelineChartProps): ReactElement {
  const points = readTrajectory(results, perspective);
  if (points.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        No trajectory data for this result.
      </p>
    );
  }

  const ending = finalNpv(points);
  const color = ending != null && ending < 0 ? NEGATIVE_COLOR : POSITIVE_COLOR;
  const crossing = findBreakeven(points);
  const counts = countPhases(points);

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold">Cumulative NPV</h2>
      <div className="h-[300px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 16, right: 16, left: 8, bottom: 0 }}>
            <XAxis
              dataKey="year"
              ticks={yearTicks(points)}
              tick={{ fontSize: 12 }}
            />
            <YAxis
              width={72}
              domain={npvDomain(points)}
              tickFormatter={formatCompact}
              tick={{ fontSize: 12 }}
            />
            <ReferenceLine
              y={0}
              stroke="#94a3b8"
              strokeDasharray="3 3"
              label={{
                value: 'Breakeven',
                position: 'insideTopRight',
                fill: '#64748b',
                fontSize: 12,
              }}
            />
            <Area
              type="linear"
              dataKey="npv"
              name="Cumulative NPV"
              stroke={color}
              fill={color}
              fillOpacity={0.15}
              connectNulls
              dot={false}
            />
            <Tooltip content={renderTooltip} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="text-sm text-slate-700">{breakevenSentence(crossing)}</p>
      <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600" aria-label="Project phases">
        {PHASES.map((item) => (
          <li key={item.phase} className="flex items-center gap-2">
            <span
              className="inline-block size-2.5 rounded-full"
              style={{ backgroundColor: item.color }}
              aria-hidden
            />
            {item.label} ({counts[item.phase]} yr)
          </li>
        ))}
      </ul>
    </section>
  );
}
