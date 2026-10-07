import type { ReactElement } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatNumber } from '@/lib/format';

export interface EmissionsChartsProps {
  results: Record<string, unknown>;
}

const FORGE_BLUE = '#0066cc';

const POLLUTANTS = [
  { id: 'co2', title: 'CO₂ Emissions', unit: 'kt' },
  { id: 'sox', title: 'SOx Emissions', unit: 't' },
  { id: 'nox', title: 'NOx Emissions', unit: 't' },
] as const;

type PollutantId = (typeof POLLUTANTS)[number]['id'];

interface EmissionsPoint {
  year: number;
  amount: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asNumberArray(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const series: number[] = [];
  for (const item of value) {
    if (typeof item !== 'number' || !Number.isFinite(item)) return null;
    series.push(item);
  }
  return series;
}

function seriesFromYearRows(value: unknown, pollutant: PollutantId): number[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const series: number[] = [];
  for (const row of value) {
    const record = asRecord(row);
    if (!record) return null;
    const amount = record[pollutant];
    if (typeof amount !== 'number' || !Number.isFinite(amount)) return null;
    series.push(amount);
  }
  return series;
}

function seriesFromRecord(record: Record<string, unknown> | null, pollutant: PollutantId): number[] | null {
  if (!record) return null;
  const keys = [
    pollutant,
    `${pollutant}_annual_values`,
    `${pollutant}_emissions_annual`,
    `${pollutant}_emissions_annual_values`,
    `emissions_${pollutant}_annual_values`,
  ];
  for (const key of keys) {
    const series = asNumberArray(record[key]);
    if (series) return series;
  }
  return (
    seriesFromYearRows(record.yearly_emissions, pollutant) ??
    seriesFromYearRows(record.annual_values, pollutant) ??
    seriesFromYearRows(record.emissions_comp_annual_values, pollutant)
  );
}

/**
 * Year-by-year physical emissions for one pollutant.
 *
 * `emissions_comp_annual_values` on a calculated scenario is a single dollar
 * series (nominal compensation cost). That array is not plotted. A pollutant
 * series is used when that key — or a similar annual array — is a map or a
 * list of `{co2, sox, nox}` year rows, or when a pollutant-specific array is
 * present on `results` or `costs.emissions`.
 */
function readPollutantSeries(
  results: Record<string, unknown>,
  pollutant: PollutantId,
): number[] | null {
  const costs = asRecord(results.costs);
  const emissions = asRecord(results.emissions) ?? asRecord(costs?.emissions);
  const comp = results.emissions_comp_annual_values ?? emissions?.emissions_comp_annual_values;

  return (
    seriesFromRecord(results, pollutant) ??
    seriesFromRecord(asRecord(comp), pollutant) ??
    seriesFromRecord(emissions, pollutant) ??
    seriesFromYearRows(comp, pollutant) ??
    seriesFromYearRows(results.yearly_emissions, pollutant)
  );
}

function formatAmount(value: unknown): string {
  const numeric = typeof value === 'number' ? value : Number(value);
  return formatNumber(Number.isFinite(numeric) ? numeric : 0, 1);
}

export function EmissionsCharts({ results }: EmissionsChartsProps): ReactElement | null {
  const charts = POLLUTANTS.flatMap((pollutant) => {
    const values = readPollutantSeries(results, pollutant.id);
    if (!values) return [];
    const data: EmissionsPoint[] = values.map((amount, year) => ({ year, amount }));
    return [{ pollutant, data }];
  });

  if (charts.length === 0) return null;

  return (
    <div className="flex flex-col gap-6">
      {charts.map(({ pollutant, data }) => (
        <section key={pollutant.id}>
          <h3 className="mb-2 text-sm font-semibold">{pollutant.title}</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="year"
                type="number"
                domain={[0, 'dataMax']}
                allowDecimals={false}
                label={{ value: 'Year', position: 'insideBottom', offset: -4 }}
              />
              <YAxis
                tickFormatter={(value: number) => formatAmount(value)}
                width={64}
                label={{
                  value: pollutant.unit,
                  angle: -90,
                  position: 'insideLeft',
                }}
              />
              <Tooltip
                formatter={(value) => [formatAmount(value), pollutant.unit]}
                labelFormatter={(label) => `Year ${label}`}
              />
              <Line
                type="monotone"
                dataKey="amount"
                name={pollutant.title}
                stroke={FORGE_BLUE}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </section>
      ))}
    </div>
  );
}
