import type { ReactElement } from 'react';
import { formatCurrency } from '@/lib/format';
import { getValueAtPath } from '@/lib/path';

export interface LiveCostPanelsProps {
  results: Record<string, unknown> | null;
}

interface Line {
  label: string;
  value: string;
}

const PLACEHOLDER = '---';

function readNumber(results: Record<string, unknown>, path: string): number | null {
  const value = getValueAtPath(results, path);
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function money(results: Record<string, unknown> | null, path: string): string {
  if (!results) return PLACEHOLDER;
  const value = readNumber(results, path);
  return value === null ? PLACEHOLDER : formatCurrency(value);
}

function moneySum(results: Record<string, unknown> | null, paths: string[]): string {
  if (!results) return PLACEHOLDER;
  let total = 0;
  for (const path of paths) {
    const value = readNumber(results, path);
    if (value === null) return PLACEHOLDER;
    total += value;
  }
  return formatCurrency(total);
}

function delayAnnual(results: Record<string, unknown> | null): string {
  if (!results) return PLACEHOLDER;
  const direct = readNumber(results, 'costs.delay.annual_cost');
  if (direct !== null) return formatCurrency(direct);
  const nominal = readNumber(results, 'costs.delay.total_nominal');
  const years = readNumber(results, 'technical_parameters.delay_years');
  if (nominal === null || years === null) return PLACEHOLDER;
  if (years <= 0) return formatCurrency(0);
  return formatCurrency(nominal / years);
}

function Panel({ title, lines }: { title: string; lines: Line[] }): ReactElement {
  return (
    <section className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{title}</h3>
      <dl className="mt-1.5 grid gap-1">
        {lines.map((line) => (
          <div key={line.label} className="flex items-baseline justify-between gap-3 text-sm">
            <dt className="text-slate-600">{line.label}</dt>
            <dd className="font-medium text-slate-900 tabular-nums">{line.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function LiveCostPanels({ results }: LiveCostPanelsProps): ReactElement {
  return (
    <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Panel
        title="ROW Cost"
        lines={[
          { label: 'Holding', value: money(results, 'costs.row.row_holding_pv') },
          { label: 'Acquisition', value: money(results, 'costs.row.row_capital_pv') },
          { label: 'Rent', value: money(results, 'costs.row.row_rent_pv') },
          {
            label: 'Capital PV',
            value: moneySum(results, ['costs.row.row_holding_pv', 'costs.row.row_capital_pv']),
          },
        ]}
      />
      <Panel
        title="Delay Cost"
        lines={[
          { label: 'Annual', value: delayAnnual(results) },
          { label: 'Total PV', value: money(results, 'costs.delay.total_pv') },
        ]}
      />
      <Panel
        title="Energy Impact"
        lines={[
          { label: 'Line loss cost', value: money(results, 'costs.line_loss.total_pv') },
          {
            label: 'Delivered energy',
            value: money(results, 'benefits.congestion.delivered_benefit_pv'),
          },
        ]}
      />
      <Panel
        title="Emissions Impact"
        lines={[
          { label: 'CO₂', value: money(results, 'costs.emissions.co2_cost_pv') },
          { label: 'SOx', value: money(results, 'costs.emissions.sox_cost_pv') },
          { label: 'NOx', value: money(results, 'costs.emissions.nox_cost_pv') },
        ]}
      />
    </div>
  );
}
