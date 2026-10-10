import { useState, type MouseEvent, type ReactElement } from 'react';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { localPoint } from '@visx/event';
import { Group } from '@visx/group';
import { ParentSize } from '@visx/responsive';
import { scaleBand, scaleLinear } from '@visx/scale';
import { useTooltip } from '@visx/tooltip';
import { ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  PERSPECTIVE_DEFINITIONS,
  type PerspectiveKey,
} from '@/components/results/perspective-toggle';
import { TaxonomyCard } from '@/components/results/taxonomy-card';
import {
  cardValues,
  positiveItems,
  readTaxonomyItems,
  resolveResultById,
  type TaxonomyItemView,
} from '@/components/results/taxonomy-view';
import { formatCurrency, formatNumber } from '@/lib/format';
import { getValueAtPath } from '@/lib/path';
import { cn } from '@/lib/utils';

export interface ResultsOverviewProps {
  results: Record<string, unknown>;
  perspective: PerspectiveKey;
  taxonomy?: Record<string, unknown>;
}

export interface PerspectiveCategoryItem {
  key: string;
  label: string;
  path: string;
}

export const PERSPECTIVE_CATEGORIES: Record<
  PerspectiveKey,
  {
    costs: PerspectiveCategoryItem[];
    benefits: PerspectiveCategoryItem[];
  }
> = {
  societal: {
    costs: [
      { key: 'risk', label: 'Risk Costs', path: 'summary.reporting_category_risk_pv' },
      { key: 'soft', label: 'Soft Costs', path: 'summary.reporting_category_soft_pv' },
      { key: 'emissions', label: 'Emissions', path: 'summary.reporting_category_emissions_pv' },
      { key: 'hard', label: 'Hard Costs', path: 'summary.reporting_category_hard_pv' },
    ],
    benefits: [
      { key: 'avoided', label: 'Avoided Emissions', path: 'bcr.displacement_avoided_benefit_pv' },
      { key: 'enabling', label: 'Enabling', path: 'bcr.benefits_enabling_pv' },
      { key: 'remedial', label: 'Remedial', path: 'bcr.benefits_remedial_pv' },
    ],
  },
  ratepayer: {
    costs: [
      { key: 'capital_recovery', label: 'Capital Recovery', path: 'bcr.capital_recovery_pv' },
      { key: 'oandm', label: 'O&M', path: 'bcr.oandm_pv' },
      { key: 'insurance', label: 'Insurance', path: 'bcr.insurance_pv' },
      { key: 'row_rent', label: 'ROW Rent', path: 'bcr.row_rent_pv' },
      { key: 'conductor_loss', label: 'Conductor Losses', path: 'bcr.conductor_loss_pv' },
      { key: 'converter_loss', label: 'Converter Losses', path: 'bcr.converter_loss_pv' },
    ],
    benefits: [
      { key: 'enabling', label: 'Enabling', path: 'bcr.benefits_enabling_pv' },
      { key: 'remedial', label: 'Remedial', path: 'bcr.benefits_remedial_pv' },
    ],
  },
  utility: {
    costs: [
      { key: 'revenue', label: 'Revenue Requirement', path: 'bcr.capital_recovery_pv' },
      { key: 'delay', label: 'Base Delay', path: 'bcr.delay_cost_pv' },
    ],
    benefits: [
      { key: 'revenue', label: 'Allowed Revenue', path: 'bcr.capital_recovery_pv' },
    ],
  },
};

const COST_BAR = '#dc2626';
const BENEFIT_BAR = '#059669';

export interface CategoryAmount {
  key: string;
  label: string;
  value: number;
}

interface WaterfallBar {
  key: string;
  label: string;
  /** Signed step. Positive for benefits, negative for costs. */
  value: number;
  /** Running total before this bar. */
  start: number;
  /** Running total after this bar. */
  end: number;
  type: 'positive' | 'negative' | 'subtotal' | 'total';
}

interface WaterfallTooltipData {
  label: string;
  value: number;
  typeLabel: string;
}

const WATERFALL_MARGIN = { top: 24, right: 16, bottom: 72, left: 80 };
const SUBTOTAL_BAR = '#1e293b';
const CONNECTOR_STROKE = '#94a3b8';
const AXIS_STROKE = '#cbd5e1';
const LABEL_FILL = '#334155';

function readNumber(results: Record<string, unknown>, path: string): number | null {
  const value = getValueAtPath(results, path);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

function formatNetBenefit(value: number | null): string {
  if (value == null) return 'N/A';
  const sign = value > 0 ? '+' : value < 0 ? '\u2212' : '';
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(0)}M`;
  return `${sign}${formatCurrency(abs, 0)}`;
}

function formatAxisCurrency(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  return formatCurrency(value, 0);
}

function formatTooltipCurrency(value: unknown): string {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return '';
  return formatCurrency(numeric, 0);
}

function formatCompactCurrency(value: number): string {
  if (!Number.isFinite(value)) return '';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(0)}M`;
  return `${sign}${formatCurrency(abs, 0)}`;
}

function ratioClass(value: number | null): string {
  if (value == null) return 'text-slate-400';
  return value >= 1 ? 'text-green-600' : 'text-red-600';
}

function netClass(value: number | null): string {
  if (value == null) return 'text-slate-400';
  return value >= 0 ? 'text-green-600' : 'text-red-600';
}

function loadCategories(
  results: Record<string, unknown>,
  items: PerspectiveCategoryItem[],
): CategoryAmount[] {
  return items
    .map((item) => ({
      key: item.key,
      label: item.label,
      value: readNumber(results, item.path) ?? 0,
    }))
    .sort((left, right) => Math.abs(right.value) - Math.abs(left.value));
}

function sortByMagnitude(items: CategoryAmount[]): CategoryAmount[] {
  return [...items].sort((left, right) => Math.abs(right.value) - Math.abs(left.value));
}

function waterfallTypeLabel(type: WaterfallBar['type']): string {
  switch (type) {
    case 'positive':
      return 'Benefit';
    case 'negative':
      return 'Cost';
    case 'subtotal':
      return 'Total Benefits';
    case 'total':
      return 'Net Benefit';
  }
}

function barFill(bar: WaterfallBar): string {
  if (bar.type === 'subtotal') return SUBTOTAL_BAR;
  if (bar.type === 'total') return bar.value >= 0 ? BENEFIT_BAR : COST_BAR;
  return bar.type === 'positive' ? BENEFIT_BAR : COST_BAR;
}

function buildWaterfallBars(
  costs: CategoryAmount[],
  benefits: CategoryAmount[],
  netBenefit: number | null,
): WaterfallBar[] {
  const bars: WaterfallBar[] = [];
  let cursor = 0;

  for (const benefit of sortByMagnitude(benefits)) {
    const start = cursor;
    const end = cursor + benefit.value;
    bars.push({
      key: `benefit-${benefit.key}`,
      label: benefit.label,
      value: benefit.value,
      start,
      end,
      type: 'positive',
    });
    cursor = end;
  }

  const benefitsTotal = cursor;
  bars.push({
    key: 'total-benefits',
    label: 'Total Benefits',
    value: benefitsTotal,
    start: 0,
    end: benefitsTotal,
    type: 'subtotal',
  });

  for (const cost of sortByMagnitude(costs)) {
    const delta = -Math.abs(cost.value);
    const start = cursor;
    const end = cursor + delta;
    bars.push({
      key: `cost-${cost.key}`,
      label: cost.label,
      value: delta,
      start,
      end,
      type: 'negative',
    });
    cursor = end;
  }

  const net = netBenefit ?? cursor;
  bars.push({
    key: 'net-benefit',
    label: 'Net Benefit',
    value: net,
    start: 0,
    end: net,
    type: 'total',
  });

  return bars;
}

function chartDomain(bars: WaterfallBar[]): [number, number] {
  const samples = [0, ...bars.flatMap((bar) => [bar.start, bar.end])];
  let min = Math.min(...samples);
  let max = Math.max(...samples);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  return [min - span * 0.12, max + span * 0.16];
}

function scaled(scale: (value: number) => number | undefined, value: number): number {
  const next = scale(value);
  return typeof next === 'number' ? next : 0;
}

function CostBenefitWaterfall({
  costs,
  benefits,
  netBenefit,
}: {
  costs: CategoryAmount[];
  benefits: CategoryAmount[];
  netBenefit: number | null;
}): ReactElement {
  const bars = buildWaterfallBars(costs, benefits, netBenefit);
  const {
    tooltipOpen,
    tooltipLeft,
    tooltipTop,
    tooltipData,
    showTooltip,
    hideTooltip,
  } = useTooltip<WaterfallTooltipData>();

  function showBarTooltip(event: MouseEvent<SVGRectElement>, bar: WaterfallBar): void {
    const point = localPoint(event);
    if (!point) return;
    showTooltip({
      tooltipData: {
        label: bar.label,
        value: bar.value,
        typeLabel: waterfallTypeLabel(bar.type),
      },
      tooltipLeft: point.x,
      tooltipTop: point.y,
    });
  }

  return (
    <div className="relative h-[360px] w-full min-w-0">
      <ParentSize>
        {({ width, height }) => {
          const innerWidth = width - WATERFALL_MARGIN.left - WATERFALL_MARGIN.right;
          const innerHeight = height - WATERFALL_MARGIN.top - WATERFALL_MARGIN.bottom;
          if (innerWidth <= 0 || innerHeight <= 0) return null;

          const xScale = scaleBand<string>({
            domain: bars.map((bar) => bar.key),
            range: [0, innerWidth],
            padding: 0.3,
          });
          const yScale = scaleLinear<number>({
            domain: chartDomain(bars),
            range: [innerHeight, 0],
            nice: true,
          });
          const bandwidth = xScale.bandwidth();
          const angleLabels = bars.some((bar) => bar.label.length * 6.5 > bandwidth);
          const zeroY = scaled(yScale, 0);

          return (
            <svg width={width} height={height} className="overflow-visible font-sans">
                <Group left={WATERFALL_MARGIN.left} top={WATERFALL_MARGIN.top}>
                  <line
                    x1={0}
                    x2={innerWidth}
                    y1={zeroY}
                    y2={zeroY}
                    stroke={AXIS_STROKE}
                    strokeWidth={1}
                  />
                  {bars.slice(0, -1).map((bar, index) => {
                    const next = bars[index + 1];
                    if (!next || next.type === 'subtotal' || next.type === 'total') return null;
                    const x1 = (xScale(bar.key) ?? 0) + bandwidth;
                    const x2 = xScale(next.key) ?? 0;
                    return (
                      <line
                        key={`connector-${bar.key}`}
                        x1={x1}
                        x2={x2}
                        y1={scaled(yScale, bar.end)}
                        y2={scaled(yScale, next.start)}
                        stroke={CONNECTOR_STROKE}
                        strokeWidth={1}
                        strokeDasharray="3 2"
                        pointerEvents="none"
                      />
                    );
                  })}
                  {bars.map((bar) => {
                    const x = xScale(bar.key) ?? 0;
                    const y = scaled(yScale, Math.max(bar.start, bar.end));
                    const barHeight = Math.abs(
                      scaled(yScale, bar.start) - scaled(yScale, bar.end),
                    );
                    const hangsBelow = bar.end < bar.start;
                    const labelY = hangsBelow
                      ? scaled(yScale, Math.min(bar.start, bar.end)) + 4
                      : y - 4;
                    const radius = barHeight >= 4 && bandwidth >= 4 ? 2 : 0;
                    const fill = barFill(bar);
                    return (
                      <g key={bar.key}>
                        <rect
                          x={x}
                          y={y}
                          width={bandwidth}
                          height={barHeight}
                          rx={radius}
                          ry={radius}
                          fill={fill}
                          className="cursor-pointer"
                          onMouseMove={(event) => showBarTooltip(event, bar)}
                          onMouseLeave={hideTooltip}
                        />
                        {radius > 0 ? (
                          <rect
                            x={x}
                            y={y + radius}
                            width={bandwidth}
                            height={barHeight - radius}
                            fill={fill}
                            pointerEvents="none"
                          />
                        ) : null}
                        <text
                          x={x + bandwidth / 2}
                          y={labelY}
                          fontSize={11}
                          fill={LABEL_FILL}
                          textAnchor="middle"
                          dominantBaseline={hangsBelow ? 'hanging' : 'auto'}
                          pointerEvents="none"
                        >
                          {formatCompactCurrency(bar.value)}
                        </text>
                      </g>
                    );
                  })}
                  <AxisLeft
                    scale={yScale}
                    stroke={AXIS_STROKE}
                    tickStroke={AXIS_STROKE}
                    numTicks={5}
                    tickFormat={(value) => formatAxisCurrency(Number(value))}
                    tickLabelProps={{
                      fill: '#64748b',
                      fontSize: 11,
                      textAnchor: 'end',
                      dx: '-0.25em',
                      dy: '0.25em',
                    }}
                  />
                  <AxisBottom
                    top={innerHeight}
                    scale={xScale}
                    stroke={AXIS_STROKE}
                    tickStroke={AXIS_STROKE}
                    tickValues={bars.map((bar) => bar.key)}
                    tickFormat={(value) =>
                      bars.find((bar) => bar.key === String(value))?.label ?? String(value)
                    }
                    tickLabelProps={() =>
                      angleLabels
                        ? {
                            angle: -35,
                            textAnchor: 'end' as const,
                            fill: LABEL_FILL,
                            fontSize: 11,
                            dx: '-0.2em',
                            dy: '0.2em',
                          }
                        : {
                            textAnchor: 'middle' as const,
                            fill: LABEL_FILL,
                            fontSize: 11,
                            dy: '0.25em',
                          }
                    }
                  />
                </Group>
            </svg>
          );
        }}
      </ParentSize>
      {tooltipOpen && tooltipData ? (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
          style={{
            left: (tooltipLeft ?? 0) + 12,
            top: (tooltipTop ?? 0) + 12,
          }}
        >
          <p className="font-medium text-slate-900">{tooltipData.label}</p>
          <p className="tabular-nums text-slate-700">
            {formatTooltipCurrency(tooltipData.value)}
          </p>
          <p className="text-slate-500">{tooltipData.typeLabel}</p>
        </div>
      ) : null}
    </div>
  );
}

type LedgerSide = 'cost' | 'benefit';

const TOTAL_PATHS: Record<PerspectiveKey, { costs: string; benefits: string }> = {
  societal: {
    costs: 'summary.total_costs_pv',
    benefits: 'summary.total_benefits_pv',
  },
  ratepayer: {
    costs: 'bcr.ratepayer_costs_pv',
    benefits: 'bcr.ratepayer_benefits_pv',
  },
  utility: {
    costs: 'bcr.utility_costs_pv',
    benefits: 'bcr.utility_benefits_pv',
  },
};

function sideById(taxonomy: Record<string, unknown> | undefined): Map<string, string> {
  const map = new Map<string, string>();
  const raw = taxonomy?.items;
  if (!Array.isArray(raw)) return map;
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.id === 'string' && typeof record.side === 'string') {
      map.set(record.id, record.side);
    }
  }
  return map;
}

/**
 * Perspective keys mostly match taxonomy categories. Three keys do not:
 * `avoided` is taxonomy category `avoided_emissions`, utility `revenue` is
 * the transfer item `capital_recovery`, and utility `delay` is `base_delay`.
 */
function itemsForCategory(
  items: TaxonomyItemView[],
  sides: Map<string, string>,
  side: LedgerSide,
  key: string,
): TaxonomyItemView[] {
  if (key === 'delay') return items.filter((item) => item.id === 'base_delay');
  if (key === 'revenue') return items.filter((item) => item.id === 'capital_recovery');
  const category = key === 'avoided' ? 'avoided_emissions' : key;
  return items
    .filter((item) => item.category === category && sides.get(item.id) === side)
    .sort((left, right) => left.displayOrder - right.displayOrder);
}

function sumValues(rows: CategoryAmount[]): number {
  return rows.reduce((total, row) => total + row.value, 0);
}

function joinLabels(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? '';
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}

function CategoryAccordions({
  title,
  rows,
  side,
  grandTotal,
  taxonomyItems,
  sides,
  resultById,
  open,
  onToggle,
  excluded,
  onToggleExcluded,
}: {
  title: string;
  rows: CategoryAmount[];
  side: LedgerSide;
  grandTotal: number;
  taxonomyItems: TaxonomyItemView[];
  sides: Map<string, string>;
  resultById: Record<string, unknown>;
  open: Set<string>;
  onToggle: (key: string) => void;
  excluded: Set<string>;
  onToggleExcluded: (key: string, include: boolean) => void;
}): ReactElement {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      {rows.map((row) => {
        const openKey = `${side}:${row.key}`;
        const excludeKey = `${side}:${row.key}`;
        const isOpen = open.has(openKey);
        const isExcluded = excluded.has(excludeKey);
        const share = grandTotal !== 0 ? (row.value / grandTotal) * 100 : 0;
        const matched = itemsForCategory(taxonomyItems, sides, side, row.key);
        const cards = positiveItems(matched, resultById, true);
        return (
          <div
            key={openKey}
            className={cn(
              'rounded-lg border border-slate-200',
              isExcluded && 'opacity-50',
            )}
          >
            <div className="flex items-center gap-3 px-3 py-3">
              <Checkbox
                checked={!isExcluded}
                aria-label={`Include ${row.label}`}
                onCheckedChange={(checked) => {
                  onToggleExcluded(excludeKey, !!checked);
                }}
              />
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                aria-expanded={isOpen}
                onClick={() => {
                  onToggle(openKey);
                }}
              >
                <ChevronRight
                  className={cn(
                    'size-4 shrink-0 text-muted-foreground transition-transform',
                    isOpen && 'rotate-90 text-primary',
                  )}
                  aria-hidden
                />
                <span
                  className={cn(
                    'min-w-0 flex-1 text-sm font-semibold',
                    isExcluded && 'line-through',
                  )}
                >
                  {row.label}
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {formatCurrency(row.value, 0)}
                </span>
                <span className="w-14 shrink-0 text-right text-xs tabular-nums text-slate-500">
                  {formatNumber(share, 1)}%
                </span>
              </button>
            </div>
            {isOpen ? (
              <div className="space-y-2 border-t border-slate-200 px-3 py-3">
                {cards.length > 0 ? (
                  cards.map((item, index) => {
                    const values = cardValues(resultById, item.id);
                    return (
                      <TaxonomyCard
                        key={item.id}
                        label={item.label}
                        annualValue={values.annualValue}
                        nominalValue={values.nominalValue}
                        pvValue={values.pvValue}
                        detailRows={values.detailRows}
                        colorIndex={index}
                        parentTotal={row.value}
                      />
                    );
                  })
                ) : (
                  <p className="text-sm text-slate-500">No line items in this category.</p>
                )}
              </div>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}

export function ResultsOverview({
  results,
  perspective,
  taxonomy,
}: ResultsOverviewProps): ReactElement {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
  const definition = PERSPECTIVE_DEFINITIONS[perspective];
  const categories = PERSPECTIVE_CATEGORIES[perspective];
  const costs = loadCategories(results, categories.costs);
  const benefits = loadCategories(results, categories.benefits);
  const resultById = resolveResultById(results);
  const taxonomyItems = readTaxonomyItems(taxonomy);
  const sideMap = sideById(taxonomy);
  const costTotal = readNumber(results, TOTAL_PATHS[perspective].costs) ?? sumValues(costs);
  const benefitTotal =
    readNumber(results, TOTAL_PATHS[perspective].benefits) ?? sumValues(benefits);

  const excludedCostPV = sumValues(
    costs.filter((row) => excluded.has(`cost:${row.key}`)),
  );
  const excludedBenefitPV = sumValues(
    benefits.filter((row) => excluded.has(`benefit:${row.key}`)),
  );
  const hasExclusions = excluded.size > 0;
  const adjustedCosts = costTotal - excludedCostPV;
  const adjustedBenefits = benefitTotal - excludedBenefitPV;
  const adjustedBcr =
    adjustedCosts > 0 && Number.isFinite(adjustedBenefits)
      ? adjustedBenefits / adjustedCosts
      : null;
  const adjustedNet =
    Number.isFinite(adjustedBenefits) && Number.isFinite(adjustedCosts)
      ? adjustedBenefits - adjustedCosts
      : null;

  const displayBcr = hasExclusions ? adjustedBcr : readNumber(results, definition.bcrPath);
  const displayNet = hasExclusions
    ? adjustedNet
    : readNumber(results, definition.netBenefitPath);

  const excludedLabels = [
    ...costs.filter((r) => excluded.has(`cost:${r.key}`)).map((r) => r.label),
    ...benefits.filter((r) => excluded.has(`benefit:${r.key}`)).map((r) => r.label),
  ];
  const exclusionNote = hasExclusions
    ? `Excluding ${joinLabels(excludedLabels)}.`
    : null;

  const waterfallCosts = costs.filter((row) => !excluded.has(`cost:${row.key}`));
  const waterfallBenefits = benefits.filter(
    (row) => !excluded.has(`benefit:${row.key}`),
  );

  function toggleOpen(key: string): void {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleExcluded(key: string, include: boolean): void {
    setExcluded((current) => {
      const next = new Set(current);
      if (include) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent>
          <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {definition.label} {hasExclusions ? 'Adjusted BCR' : 'BCR'}
              </p>
              <p className={cn('text-4xl font-bold tabular-nums', ratioClass(displayBcr))}>
                {formatNumber(displayBcr, 3)}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Net Benefit
              </p>
              <p className={cn('text-3xl font-bold tabular-nums', netClass(displayNet))}>
                {formatNetBenefit(displayNet)}
              </p>
            </div>
            <p className="max-w-md flex-1 text-sm italic text-slate-600">
              {exclusionNote ?? definition.definition}
            </p>
          </div>
        </CardContent>
      </Card>

      <CostBenefitWaterfall
        costs={waterfallCosts}
        benefits={waterfallBenefits}
        netBenefit={displayNet}
      />

      <CategoryAccordions
        title="Costs"
        rows={costs}
        side="cost"
        grandTotal={costTotal}
        taxonomyItems={taxonomyItems}
        sides={sideMap}
        resultById={resultById}
        open={open}
        onToggle={toggleOpen}
        excluded={excluded}
        onToggleExcluded={toggleExcluded}
      />
      <CategoryAccordions
        title="Benefits"
        rows={benefits}
        side="benefit"
        grandTotal={benefitTotal}
        taxonomyItems={taxonomyItems}
        sides={sideMap}
        resultById={resultById}
        open={open}
        onToggle={toggleOpen}
        excluded={excluded}
        onToggleExcluded={toggleExcluded}
      />
    </div>
  );
}
