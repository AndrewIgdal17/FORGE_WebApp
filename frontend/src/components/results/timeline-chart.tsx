import { useEffect, useRef, useState, type MouseEvent, type ReactElement } from 'react';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { localPoint } from '@visx/event';
import { Group } from '@visx/group';
import { ParentSize } from '@visx/responsive';
import { scaleLinear } from '@visx/scale';
import { AreaClosed, LinePath } from '@visx/shape';
import { useTooltip } from '@visx/tooltip';
import type { PerspectiveKey } from '@/components/results/perspective-toggle';
import { formatCurrency } from '@/lib/format';

export interface TimelineChartProps {
  results: Record<string, unknown>;
  perspective: PerspectiveKey;
}

type Phase = 'delay' | 'construction' | 'operation';

type ChartMode = 'bcr' | 'npv';

interface TimelinePoint {
  year: number;
  phase: Phase;
  npv: number | null;
}

const NPV_FIELD: Record<PerspectiveKey, string> = {
  societal: 'npv_societal',
  ratepayer: 'npv_ratepayer',
  utility: 'npv_utility',
};

const BCR_FIELD: Record<PerspectiveKey, string> = {
  societal: 'bcr_societal',
  ratepayer: 'bcr_ratepayer',
  utility: 'bcr_utility',
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

function fieldFor(mode: ChartMode, perspective: PerspectiveKey): string {
  return (mode === 'bcr' ? BCR_FIELD : NPV_FIELD)[perspective];
}

function readTrajectory(
  results: Record<string, unknown>,
  perspective: PerspectiveKey,
  mode: ChartMode,
): TimelinePoint[] {
  const raw = results.trajectory;
  if (!Array.isArray(raw)) return [];
  const field = fieldFor(mode, perspective);
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

function bcrDomain(points: readonly TimelinePoint[]): [number, number] {
  let min = 1;
  let max = 1;
  for (const point of points) {
    if (point.npv == null) continue;
    min = Math.min(min, point.npv);
    max = Math.max(max, point.npv);
  }
  if (min === 1 && max === 1) return [0, 2];
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

function formatRatio(value: number): string {
  if (!Number.isFinite(value)) return '';
  return value.toFixed(2);
}

interface PlottedPoint {
  year: number;
  phase: Phase;
  npv: number;
}

interface PhaseBand {
  phase: Phase;
  firstYear: number;
  lastYear: number;
}

const MARGIN = { top: 16, right: 60, bottom: 32, left: 72 };

const AXIS_LABEL = {
  fill: '#64748b',
  fontSize: 12,
  fontFamily: 'inherit',
};

const MODE_BUTTON = 'px-2.5 py-1 text-xs font-medium';

const TOOLTIP_CLASS =
  'pointer-events-none absolute z-10 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm';

function plottedSeries(points: readonly TimelinePoint[]): PlottedPoint[] {
  const series: PlottedPoint[] = [];
  for (const point of points) {
    if (point.npv == null) continue;
    series.push({ year: point.year, phase: point.phase, npv: point.npv });
  }
  return series;
}

function phaseBands(points: readonly TimelinePoint[]): PhaseBand[] {
  const bounds = new Map<Phase, PhaseBand>();
  for (const point of points) {
    const band = bounds.get(point.phase);
    if (band == null) {
      bounds.set(point.phase, {
        phase: point.phase,
        firstYear: point.year,
        lastYear: point.year,
      });
      continue;
    }
    band.firstYear = Math.min(band.firstYear, point.year);
    band.lastYear = Math.max(band.lastYear, point.year);
  }
  return PHASES.flatMap((item) => {
    const band = bounds.get(item.phase);
    return band == null ? [] : [band];
  });
}

function nearestPoint(
  points: readonly TimelinePoint[],
  year: number,
): TimelinePoint | null {
  let best: TimelinePoint | null = null;
  let bestDistance = Infinity;
  for (const point of points) {
    const distance = Math.abs(point.year - year);
    if (distance < bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }
  return best;
}

function tooltipValue(point: TimelinePoint, mode: ChartMode): string {
  if (point.npv == null) return 'N/A';
  if (mode === 'bcr') return `BCR: ${point.npv.toFixed(3)}`;
  return formatCurrency(point.npv, 0);
}

export function TimelineChart({
  results,
  perspective,
}: TimelineChartProps): ReactElement {
  const [mode, setMode] = useState<ChartMode>('bcr');
  const svgRef = useRef<SVGSVGElement>(null);
  const {
    tooltipOpen,
    tooltipLeft,
    tooltipTop,
    tooltipData,
    showTooltip,
    hideTooltip,
  } = useTooltip<TimelinePoint>();
  useEffect(() => {
    hideTooltip();
  }, [mode, perspective, hideTooltip]);
  const points = readTrajectory(results, perspective, mode);
  if (points.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        No trajectory data for this result.
      </p>
    );
  }

  const ending = finalNpv(points);
  const threshold = mode === 'bcr' ? 1 : 0;
  const below =
    ending != null && (mode === 'bcr' ? ending < 1 : ending < 0);
  const counts = countPhases(points);
  const heading = mode === 'bcr' ? 'BCR Trajectory' : 'Cumulative NPV';
  const series = plottedSeries(points);
  const bands = phaseBands(points);
  const ticks = yearTicks(points);
  const yDomain = mode === 'bcr' ? bcrDomain(points) : npvDomain(points);
  const referenceLabel = mode === 'bcr' ? 'BCR = 1' : 'Breakeven';

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{heading}</h2>
        <div className="inline-flex overflow-hidden rounded-md" role="group" aria-label="Chart metric">
          <button
            type="button"
            className={`${MODE_BUTTON} ${mode === 'bcr' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}
            aria-pressed={mode === 'bcr'}
            onClick={() => setMode('bcr')}
          >
            BCR
          </button>
          <button
            type="button"
            className={`${MODE_BUTTON} ${mode === 'npv' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}
            aria-pressed={mode === 'npv'}
            onClick={() => setMode('npv')}
          >
            NPV
          </button>
        </div>
      </div>
      <div className="relative h-[300px] w-full min-w-0">
        <ParentSize>
          {({ width, height }) => {
            const innerWidth = width - MARGIN.left - MARGIN.right;
            const innerHeight = height - MARGIN.top - MARGIN.bottom;
            if (innerWidth <= 0 || innerHeight <= 0) return null;

            const firstYear = points[0]?.year ?? 0;
            const lastYear = points[points.length - 1]?.year ?? firstYear;
            const xDomain: [number, number] =
              firstYear === lastYear
                ? [firstYear - 0.5, lastYear + 0.5]
                : [firstYear, lastYear];
            const xScale = scaleLinear<number>({
              domain: xDomain,
              range: [0, innerWidth],
            });
            const yScale = scaleLinear<number>({
              domain: yDomain,
              range: [innerHeight, 0],
            });
            const thresholdY = yScale(threshold);
            const aboveHeight = Math.max(0, Math.min(innerHeight, thresholdY));
            const belowHeight = Math.max(0, innerHeight - aboveHeight);

            function handleMove(event: MouseEvent<SVGRectElement>): void {
              const svgNode = svgRef.current ?? event.currentTarget.ownerSVGElement;
              if (svgNode == null) return;
              const coords = localPoint(svgNode, event);
              if (coords == null) return;
              const year = Math.round(xScale.invert(coords.x - MARGIN.left));
              if (!Number.isFinite(year)) return;
              const point = nearestPoint(points, year);
              if (point == null || point.npv == null) {
                hideTooltip();
                return;
              }
              const curveY = yScale(point.npv);
              const distanceFromCurve = Math.abs((coords.y - MARGIN.top) - curveY);
              if (distanceFromCurve > 16) {
                hideTooltip();
                return;
              }
              showTooltip({
                tooltipData: point,
                tooltipLeft: xScale(point.year) + MARGIN.left,
                tooltipTop: curveY + MARGIN.top,
              });
            }

            return (
              <svg
                ref={svgRef}
                width={width}
                height={height}
                role="img"
                aria-label={
                  ending == null
                    ? heading
                    : `${heading}, ending ${below ? 'below' : 'above'} the threshold`
                }
              >
                <Group top={MARGIN.top} left={MARGIN.left}>
                  <defs>
                    <pattern
                      id="pattern-delay"
                      width={6}
                      height={6}
                      patternUnits="userSpaceOnUse"
                    >
                      <line
                        x1={0.5}
                        y1={0}
                        x2={0.5}
                        y2={6}
                        stroke="#eab308"
                        strokeOpacity={0.4}
                        strokeWidth={1}
                      />
                    </pattern>
                    <pattern
                      id="pattern-construction"
                      width={8}
                      height={8}
                      patternUnits="userSpaceOnUse"
                    >
                      <path
                        d="M0 8 L8 0 M-2 2 L2 -2 M6 10 L10 6"
                        fill="none"
                        stroke="#3b82f6"
                        strokeOpacity={0.4}
                        strokeWidth={1}
                      />
                      <path
                        d="M0 0 L8 8 M-2 6 L2 10 M6 -2 L10 2"
                        fill="none"
                        stroke="#3b82f6"
                        strokeOpacity={0.4}
                        strokeWidth={1}
                      />
                    </pattern>
                    <clipPath id="clip-above">
                      <rect x={0} y={0} width={innerWidth} height={aboveHeight} />
                    </clipPath>
                    <clipPath id="clip-below">
                      <rect
                        x={0}
                        y={aboveHeight}
                        width={innerWidth}
                        height={belowHeight}
                      />
                    </clipPath>
                  </defs>
                  {bands.map((band) => {
                    if (band.phase === 'operation') return null;
                    const x = Math.max(0, xScale(band.firstYear - 0.5));
                    const end = Math.min(innerWidth, xScale(band.lastYear + 0.5));
                    const bandWidth = Math.max(end - x, 0);
                    if (bandWidth <= 0) return null;
                    const patternId =
                      band.phase === 'delay' ? 'pattern-delay' : 'pattern-construction';
                    return (
                      <rect
                        key={band.phase}
                        x={x}
                        y={0}
                        width={bandWidth}
                        height={innerHeight}
                        fill={`url(#${patternId})`}
                        pointerEvents="none"
                      />
                    );
                  })}
                  <AreaClosed
                    data={series}
                    x={(d) => xScale(d.year)}
                    y={(d) => yScale(d.npv)}
                    y0={thresholdY}
                    yScale={yScale}
                    fill={POSITIVE_COLOR}
                    fillOpacity={0.2}
                    stroke="none"
                    clipPath="url(#clip-above)"
                  />
                  <AreaClosed
                    data={series}
                    x={(d) => xScale(d.year)}
                    y={(d) => yScale(d.npv)}
                    y0={thresholdY}
                    yScale={yScale}
                    fill={NEGATIVE_COLOR}
                    fillOpacity={0.2}
                    stroke="none"
                    clipPath="url(#clip-below)"
                  />
                  <LinePath
                    data={series}
                    x={(d) => xScale(d.year)}
                    y={(d) => yScale(d.npv)}
                    stroke={POSITIVE_COLOR}
                    strokeWidth={2}
                    clipPath="url(#clip-above)"
                  />
                  <LinePath
                    data={series}
                    x={(d) => xScale(d.year)}
                    y={(d) => yScale(d.npv)}
                    stroke={NEGATIVE_COLOR}
                    strokeWidth={2}
                    clipPath="url(#clip-below)"
                  />
                  <line
                    x1={0}
                    x2={innerWidth}
                    y1={thresholdY}
                    y2={thresholdY}
                    stroke="#94a3b8"
                    strokeDasharray="4 3"
                  />
                  <text
                    x={innerWidth}
                    y={thresholdY}
                    dy="-0.45em"
                    textAnchor="end"
                    fill="#64748b"
                    fontSize={12}
                  >
                    {referenceLabel}
                  </text>
                  <AxisBottom
                    top={innerHeight}
                    scale={xScale}
                    tickValues={ticks}
                    stroke="#64748b"
                    tickStroke="#64748b"
                    tickLabelProps={{
                      ...AXIS_LABEL,
                      textAnchor: 'middle',
                    }}
                  />
                  <AxisLeft
                    scale={yScale}
                    stroke="#64748b"
                    tickStroke="#64748b"
                    tickFormat={(value) =>
                      mode === 'bcr'
                        ? formatRatio(Number(value))
                        : formatCompact(Number(value))
                    }
                    tickLabelProps={{
                      ...AXIS_LABEL,
                      textAnchor: 'end',
                      dx: '-0.25em',
                      dy: '0.25em',
                    }}
                  />
                  <rect
                    x={0}
                    y={0}
                    width={innerWidth}
                    height={innerHeight}
                    fill="transparent"
                    onMouseMove={handleMove}
                    onMouseLeave={hideTooltip}
                  />
                  {tooltipOpen && tooltipData != null && tooltipData.npv != null ? (
                    <circle
                      cx={xScale(tooltipData.year)}
                      cy={yScale(tooltipData.npv)}
                      r={4}
                      fill="white"
                      stroke="#334155"
                      strokeWidth={2}
                      pointerEvents="none"
                    />
                  ) : null}
                </Group>
              </svg>
            );
          }}
        </ParentSize>
        {tooltipOpen && tooltipData != null ? (
          <div
            className={TOOLTIP_CLASS}
            style={{ left: (tooltipLeft ?? 0) + 12, top: (tooltipTop ?? 0) + 12 }}
          >
            <p className="font-medium">Year {tooltipData.year}</p>
            <p className="capitalize text-slate-600">{tooltipData.phase} phase</p>
            <p className="tabular-nums">{tooltipValue(tooltipData, mode)}</p>
          </div>
        ) : null}
      </div>
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
