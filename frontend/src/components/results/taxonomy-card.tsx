import { useState, type ReactElement } from 'react';
import { ChevronRight } from 'lucide-react';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { formatCurrency } from '@/lib/format';
import { COMPOSITION_COLORS } from '@/lib/results-utils';
import { cn } from '@/lib/utils';

export interface TaxonomyDetailRow {
  label: string;
  nominal?: number;
  pv?: number;
}

export interface TaxonomyCardProps {
  label: string;
  annualValue?: number;
  nominalValue?: number;
  pvValue?: number;
  detailRows?: Array<TaxonomyDetailRow>;
  colorIndex?: number;
  parentTotal?: number;
}

function currencyClass(value: number): string | undefined {
  return value < 0 ? 'text-red-600' : undefined;
}

function CurrencyText({ value }: { value: number }): ReactElement {
  return <span className={currencyClass(value)}>{formatCurrency(value, 0)}</span>;
}

function accentColor(colorIndex: number): string {
  const last = COMPOSITION_COLORS.length - 1;
  return COMPOSITION_COLORS[Math.min(Math.max(colorIndex, 0), last)] ?? COMPOSITION_COLORS[0] ?? '#0066cc';
}

export function TaxonomyCard({
  label,
  annualValue,
  nominalValue,
  pvValue,
  detailRows,
  colorIndex = 0,
  parentTotal,
}: TaxonomyCardProps): ReactElement {
  const [expanded, setExpanded] = useState(false);
  const rows = detailRows ?? [];
  const expandable = rows.length > 0;
  const share = pvValue ?? nominalValue ?? annualValue;
  const showShare = parentTotal != null && parentTotal > 0 && share != null;
  const sharePct = showShare ? (share / parentTotal) * 100 : 0;
  const color = accentColor(colorIndex);

  return (
    <Card
      size="sm"
      className="border-l-[3px] py-0"
      style={{ borderLeftColor: color }}
    >
      <CardContent className="px-4 py-3">
        <button
          type="button"
          className={cn(
            'flex w-full items-center justify-between gap-3 text-left',
            expandable ? 'cursor-pointer' : 'cursor-default',
          )}
          aria-expanded={expandable ? expanded : undefined}
          onClick={() => {
            if (expandable) setExpanded((open) => !open);
          }}
        >
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{label}</div>
            {showShare ? (
              <div className="mt-0.5 text-xs text-muted-foreground">
                {sharePct.toFixed(0)}% of category
                {expandable ? ` · ${rows.length} components` : ''}
              </div>
            ) : null}
            {annualValue != null || nominalValue != null ? (
              <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                {annualValue != null ? (
                  <span>
                    Annual <CurrencyText value={annualValue} />
                  </span>
                ) : null}
                {nominalValue != null ? (
                  <span>
                    Nominal <CurrencyText value={nominalValue} />
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {pvValue != null ? (
              <div className={cn('text-lg font-bold tabular-nums', currencyClass(pvValue))}>
                {formatCurrency(pvValue, 0)}
              </div>
            ) : null}
            {expandable ? (
              <ChevronRight
                className={cn(
                  'size-4 text-muted-foreground transition-transform',
                  expanded && 'rotate-90 text-primary',
                )}
                aria-hidden
              />
            ) : null}
          </div>
        </button>
        {showShare ? (
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
            role="meter"
            aria-label={`${label} share of category`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(Math.min(Math.abs(sharePct), 100))}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(Math.abs(sharePct), 100)}%`,
                background: color,
              }}
            />
          </div>
        ) : null}
        {expanded && expandable ? (
          <div className="mt-2 space-y-1 border-t pt-2">
            {rows.map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between gap-3 text-xs text-muted-foreground"
              >
                <span className="min-w-0 truncate">{row.label}</span>
                <span className="flex shrink-0 gap-3 tabular-nums">
                  {row.nominal != null ? (
                    <span>
                      Nominal <CurrencyText value={row.nominal} />
                    </span>
                  ) : null}
                  {row.pv != null ? (
                    <span>
                      PV <CurrencyText value={row.pv} />
                    </span>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
