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
import { DelayComparisonCard } from '@/components/results/delay-comparison';
import { TaxonomyCard } from '@/components/results/taxonomy-card';
import {
  cardValues,
  itemPresentValue,
  positiveItems,
  readTaxonomyItems,
  resolveResultById,
  type TaxonomyItemView,
} from '@/components/results/taxonomy-view';
import { DELAY_OTHER_VIEW_NOTE, DIRECT_DELAY_LABEL } from '@/lib/delay-comparison';
import { formatCurrency, formatNumber } from '@/lib/format';
import {
  BENEFIT_CATEGORY_LABELS,
  CATEGORY_LABELS,
  DOES_NOT_APPLY,
  REPORTING_PATHS,
  excludesNote,
  itemDoesNotApply,
  readCategoryTotal,
  type ReportingKey,
} from '@/lib/results-utils';
import { getValueAtPath } from '@/lib/path';
import { waccValueSum } from '@/lib/perspective-values';
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
  /** Utility and ratepayer items: the taxonomy items whose WACC present values sum to this row. */
  waccIds?: readonly string[];
  /** Societal category rows resolved via `readCategoryTotal` (Spec 15). */
  reportingKey?: ReportingKey;
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
      {
        key: 'capital',
        label: CATEGORY_LABELS.capital,
        path: REPORTING_PATHS.capital,
        reportingKey: 'capital',
      },
      {
        key: 'delay_period',
        label: CATEGORY_LABELS.delay_period,
        path: REPORTING_PATHS.delay_period,
        reportingKey: 'delay_period',
      },
      {
        key: 'operating',
        label: CATEGORY_LABELS.operating,
        path: REPORTING_PATHS.operating,
        reportingKey: 'operating',
      },
      {
        key: 'external',
        label: CATEGORY_LABELS.external,
        path: REPORTING_PATHS.external,
        reportingKey: 'external',
      },
    ],
    benefits: [
      {
        key: 'market',
        label: BENEFIT_CATEGORY_LABELS.market,
        path: REPORTING_PATHS.market,
        reportingKey: 'market',
      },
      {
        key: 'external',
        label: BENEFIT_CATEGORY_LABELS.external,
        path: REPORTING_PATHS.external_benefits,
        reportingKey: 'external_benefits',
      },
    ],
  },
  ratepayer: {
    costs: [
      { key: 'capital_recovery', label: 'Capital Recovery', path: 'bcr.capital_recovery_pv', waccIds: ['capital_recovery'] },
      { key: 'oandm', label: 'O&M', path: 'bcr.oandm_pv', waccIds: ['oandm'] },
      { key: 'insurance', label: 'Insurance', path: 'bcr.insurance_pv', waccIds: ['insurance'] },
      { key: 'row_rent', label: 'ROW Rent', path: 'bcr.row_rent_pv', waccIds: ['row_rent'] },
      { key: 'conductor_loss', label: 'Conductor Losses', path: 'bcr.conductor_loss_pv', waccIds: ['line_loss_conductor'] },
      { key: 'converter_loss', label: 'Converter Losses', path: 'bcr.converter_loss_pv', waccIds: ['line_loss_converter'] },
    ],
    benefits: [
      {
        key: 'market',
        label: BENEFIT_CATEGORY_LABELS.market,
        path: REPORTING_PATHS.market,
        waccIds: ['congestion_benefit', 'delivered_energy_benefit', 'capacity_value_benefit'],
      },
    ],
  },
  utility: {
    costs: [
      { key: 'capital_recovery', label: 'Capital Recovery', path: 'bcr.capital_recovery_pv', waccIds: ['capital_recovery'] },
      { key: 'oandm', label: 'O&M', path: 'bcr.oandm_pv', waccIds: ['oandm'] },
      { key: 'insurance', label: 'Insurance', path: 'bcr.insurance_pv', waccIds: ['insurance'] },
      { key: 'row_rent', label: 'ROW Rent', path: 'bcr.row_rent_pv', waccIds: ['row_rent'] },
      { key: 'delay', label: DIRECT_DELAY_LABEL, path: 'bcr.delay_cost_pv', waccIds: ['base_delay'] },
      { key: 'holding', label: 'ROW Holding Cost', path: 'bcr.holding_pv', waccIds: ['row_holding'] },
    ],
    benefits: [
      { key: 'capital_recovery', label: 'Capital Recovery', path: 'bcr.capital_recovery_pv', waccIds: ['capital_recovery'] },
      { key: 'oandm', label: 'O&M', path: 'bcr.oandm_pv', waccIds: ['oandm'] },
      { key: 'insurance', label: 'Insurance', path: 'bcr.insurance_pv', waccIds: ['insurance'] },
      { key: 'row_rent', label: 'ROW Rent', path: 'bcr.row_rent_pv', waccIds: ['row_rent'] },
    ],
  },
};

const COST_BAR = '#dc2626';
const BENEFIT_BAR = '#059669';

export interface CategoryAmount {
  key: string;
  label: string;
  value: number | null;
  /** A single-item row whose item the method switches off (Spec 11). */
  doesNotApply?: boolean;
}

/** The row's value text: "Does not apply", else its currency. */
export function categoryValueText(row: CategoryAmount): string {
  return row.doesNotApply ? DOES_NOT_APPLY : formatCurrency(row.value, 0);
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
  if (value == null) return 'Not available';
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
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Not available';
  return formatCurrency(value, 0);
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

function magnitude(value: number | null): number {
  return value === null ? -1 : Math.abs(value);
}

export function loadCategories(
  results: Record<string, unknown>,
  items: PerspectiveCategoryItem[],
): CategoryAmount[] {
  return items
    .map((item) => ({
      key: item.key,
      label: item.label,
      value: item.reportingKey
        ? readCategoryTotal(results, item.reportingKey)
        : item.waccIds
          ? waccValueSum(results, item.waccIds)
          : readNumber(results, item.path),
      doesNotApply:
        item.waccIds?.length === 1 && itemDoesNotApply(results, item.waccIds[0]!),
    }))
    .sort((left, right) => magnitude(right.value) - magnitude(left.value));
}

function sortByMagnitude(items: CategoryAmount[]): CategoryAmount[] {
  return [...items].sort((left, right) => magnitude(right.value) - magnitude(left.value));
}

function measuredCategories(
  items: CategoryAmount[],
): Array<CategoryAmount & { value: number }> {
  return sortByMagnitude(items).filter(
    (item): item is CategoryAmount & { value: number } =>
      item.value !== null && !item.doesNotApply,
  );
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

export const WATERFALL_NOT_AVAILABLE = 'Cost and benefit waterfall: Not available.';

function buildWaterfallBars(
  costs: CategoryAmount[],
  benefits: CategoryAmount[],
  netBenefit: number | null,
): WaterfallBar[] {
  const bars: WaterfallBar[] = [];
  let cursor = 0;

  for (const benefit of measuredCategories(benefits)) {
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

  for (const cost of measuredCategories(costs)) {
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
 * Keys in ITEM_ID_BY_KEY resolve to a single taxonomy item by id, skipping
 * the side filter (required because capital_recovery is side "transfer" and
 * ATRR items appear on both the cost and benefit sides of the utility
 * perspective). All other keys match taxonomy category + side.
 */
const ITEM_ID_BY_KEY: Record<string, string> = {
  delay:            'base_delay',
  holding:          'row_holding',
  capital_recovery: 'capital_recovery',
  oandm:            'oandm',
  insurance:        'insurance',
  row_rent:         'row_rent',
  conductor_loss:   'line_loss_conductor',
  converter_loss:   'line_loss_converter',
};

function itemsForCategory(
  items: TaxonomyItemView[],
  sides: Map<string, string>,
  side: LedgerSide,
  key: string,
): TaxonomyItemView[] {
  const itemId = ITEM_ID_BY_KEY[key];
  if (itemId) return items.filter((item) => item.id === itemId);
  const category = key;
  return items
    .filter((item) => item.category === category && sides.get(item.id) === side)
    .sort((left, right) => left.displayOrder - right.displayOrder);
}

export function externalAccordionSubgroupHeadings(
  matched: TaxonomyItemView[],
): string[] {
  const headings: string[] = [];
  if (matched.some((item) => item.subgroup === 'risk')) headings.push(CATEGORY_LABELS.risk);
  if (matched.some((item) => item.subgroup === 'emissions')) {
    headings.push(CATEGORY_LABELS.emissions);
  }
  return headings;
}

function subgroupSections(
  matched: TaxonomyItemView[],
): Array<{ heading: string | null; items: TaxonomyItemView[] }> {
  const risk = matched.filter((item) => item.subgroup === 'risk');
  const emissions = matched.filter((item) => item.subgroup === 'emissions');
  const rest = matched.filter(
    (item) => item.subgroup !== 'risk' && item.subgroup !== 'emissions',
  );
  const sections: Array<{ heading: string | null; items: TaxonomyItemView[] }> = [];
  if (risk.length > 0) sections.push({ heading: CATEGORY_LABELS.risk, items: risk });
  if (emissions.length > 0) {
    sections.push({ heading: CATEGORY_LABELS.emissions, items: emissions });
  }
  if (rest.length > 0) sections.push({ heading: null, items: rest });
  return sections;
}

function sumValues(rows: CategoryAmount[]): number {
  return rows.reduce((total, row) => (row.value === null ? total : total + row.value), 0);
}

/** The stored total, or the category sum when the key is absent or not a number.
 * Only a stored null stays null: nothing that applies was available. */
export function readTotal(
  results: Record<string, unknown>,
  path: string,
  rows: CategoryAmount[],
): number | null {
  const value = getValueAtPath(results, path);
  if (value === null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return sumValues(rows);
}

export function adjustedRatio(benefits: number | null, costs: number | null): number | null {
  if (benefits === null || costs === null || !(costs > 0)) return null;
  return benefits / costs;
}

function omittedIds(results: Record<string, unknown>, bcrPath: string): string[] {
  const key = bcrPath.slice(bcrPath.lastIndexOf('.') + 1);
  const bcr = results.bcr;
  if (!bcr || typeof bcr !== 'object' || Array.isArray(bcr)) return [];
  const omitted = (bcr as Record<string, unknown>).omitted;
  if (!omitted || typeof omitted !== 'object' || Array.isArray(omitted)) return [];
  const ids = (omitted as Record<string, unknown>)[key];
  if (!Array.isArray(ids)) return [];
  return ids.filter((id): id is string => typeof id === 'string' && id.length > 0);
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
  grandTotal: number | null;
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
        const share =
          row.value === null || grandTotal === null || row.doesNotApply
            ? null
            : grandTotal !== 0
              ? (row.value / grandTotal) * 100
              : 0;
        const matched = itemsForCategory(taxonomyItems, sides, side, row.key);
        const taxonomyCards = (items: TaxonomyItemView[]): TaxonomyItemView[] => [
          ...positiveItems(items, resultById, true),
          ...items.filter((item) => itemPresentValue(resultById, item.id) === null),
        ];
        const cards = taxonomyCards(matched);
        const sections =
          side === 'cost' && row.key === 'external'
            ? subgroupSections(matched).map((section) => ({
                heading: section.heading,
                items: taxonomyCards(section.items),
              }))
            : [{ heading: null as string | null, items: cards }];
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
                <span
                  className={cn(
                    'shrink-0 text-sm font-semibold tabular-nums',
                    row.doesNotApply && 'text-slate-500',
                  )}
                >
                  {categoryValueText(row)}
                </span>
                <span className="w-14 shrink-0 text-right text-xs tabular-nums text-slate-500">
                  {share === null ? '' : `${formatNumber(share, 1)}%`}
                </span>
              </button>
            </div>
            {isOpen ? (
              <div className="space-y-2 border-t border-slate-200 px-3 py-3">
                {cards.length > 0 ? (
                  sections.map((section, sectionIndex) => (
                    <div key={section.heading ?? `section-${sectionIndex}`} className="space-y-2">
                      {section.heading ? (
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {section.heading}
                        </h3>
                      ) : null}
                      {section.items.map((item, index) => {
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
                            parentTotal={row.value === null ? undefined : row.value}
                            title={values.missingHover}
                            doesNotApply={values.doesNotApply}
                          />
                        );
                      })}
                    </div>
                  ))
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

  function hasLineItems(side: LedgerSide, key: string): boolean {
    return itemsForCategory(taxonomyItems, sideMap, side, key).length > 0;
  }

  const visibleCosts =
    perspective === 'societal'
      ? costs
      : costs.filter((row) => hasLineItems('cost', row.key));
  const visibleBenefits =
    perspective === 'societal'
      ? benefits
      : benefits.filter((row) => hasLineItems('benefit', row.key));

  const costTotal = readTotal(results, TOTAL_PATHS[perspective].costs, costs);
  const benefitTotal = readTotal(results, TOTAL_PATHS[perspective].benefits, benefits);

  const excludedCostPV = sumValues(
    costs.filter((row) => excluded.has(`cost:${row.key}`)),
  );
  const excludedBenefitPV = sumValues(
    benefits.filter((row) => excluded.has(`benefit:${row.key}`)),
  );
  const hasExclusions = excluded.size > 0;
  const adjustedCosts = costTotal === null ? null : costTotal - excludedCostPV;
  const adjustedBenefits = benefitTotal === null ? null : benefitTotal - excludedBenefitPV;
  const adjustedBcr = adjustedRatio(adjustedBenefits, adjustedCosts);
  const adjustedNet =
    adjustedBenefits === null || adjustedCosts === null
      ? null
      : adjustedBenefits - adjustedCosts;

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
  const omitted = omittedIds(results, definition.bcrPath);
  const omittedNote =
    omitted.length > 0 && displayBcr !== null ? excludesNote(omitted) : null;

  // A stored null total or net benefit means nothing that applies was
  // available; a waterfall built from the costs alone would read as measured.
  const waterfallAvailable =
    benefitTotal !== null &&
    costTotal !== null &&
    (hasExclusions || getValueAtPath(results, definition.netBenefitPath) !== null);
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
            {exclusionNote ? (
              <p className="max-w-md flex-1 text-sm italic text-slate-600">
                {exclusionNote}
              </p>
            ) : null}
            {omittedNote ? (
              <p className="max-w-md flex-1 text-sm italic text-slate-600">
                {omittedNote}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
      {perspective === 'societal' ? (
        <DelayComparisonCard results={results} />
      ) : (
        <p className="text-sm italic text-slate-600">{DELAY_OTHER_VIEW_NOTE}</p>
      )}

      {waterfallAvailable ? (
        <CostBenefitWaterfall
          costs={waterfallCosts}
          benefits={waterfallBenefits}
          netBenefit={displayNet}
        />
      ) : (
        <p className="text-sm italic text-slate-600">{WATERFALL_NOT_AVAILABLE}</p>
      )}

      <CategoryAccordions
        title="Costs"
        rows={visibleCosts}
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
        rows={visibleBenefits}
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
