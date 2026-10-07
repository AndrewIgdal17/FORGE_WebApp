import type { ReactElement } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatNumber } from '@/lib/format';

export interface FuelMixChartProps {
  shares: Record<string, number>;
  labels?: Record<string, string>;
}

const FUEL_SOURCES = [
  'coal',
  'oil',
  'natural_gas',
  'solar',
  'wind',
  'hydro',
  'nuclear',
  'other',
] as const;

type FuelSource = (typeof FUEL_SOURCES)[number];

const DEFAULT_LABELS: Record<FuelSource, string> = {
  coal: 'Coal',
  oil: 'Oil',
  natural_gas: 'Natural Gas',
  solar: 'Solar',
  wind: 'Wind',
  hydro: 'Hydro',
  nuclear: 'Nuclear',
  other: 'Other',
};

/** Same palette as the vanilla fuel-mix chart in input-renderer.js. */
const FUEL_COLORS: Record<FuelSource, string> = {
  coal: '#4a4a4a',
  oil: '#8b6914',
  natural_gas: '#3b82f6',
  solar: '#facc15',
  wind: '#14b8a6',
  hydro: '#06b6d4',
  nuclear: '#a855f7',
  other: '#9ca3af',
};

interface FuelMixPoint {
  key: FuelSource;
  label: string;
  share: number;
}

function sharePercent(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return value;
}

function formatShare(value: unknown): string {
  const numeric = typeof value === 'number' ? value : Number(value);
  const formatted = formatNumber(Number.isFinite(numeric) ? numeric : 0, 1);
  return `${formatted}%`;
}

export function FuelMixChart({ shares, labels }: FuelMixChartProps): ReactElement {
  const data: FuelMixPoint[] = FUEL_SOURCES.map((key) => ({
    key,
    label: labels?.[key] ?? DEFAULT_LABELS[key],
    share: sharePercent(shares[key]),
  }));

  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold">Energy Source Mix</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" interval={0} tick={{ fontSize: 12 }} />
          <YAxis
            domain={[0, 100]}
            width={48}
            tickFormatter={(value: number) => `${formatNumber(value, 0)}%`}
            label={{ value: 'Share (%)', angle: -90, position: 'insideLeft' }}
          />
          <Tooltip formatter={(value) => formatShare(value)} />
          <Bar dataKey="share" name="Share" radius={[4, 4, 0, 0]}>
            {data.map((entry) => (
              <Cell key={entry.key} fill={FUEL_COLORS[entry.key]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </section>
  );
}
