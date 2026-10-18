import type { ReactElement, ReactNode } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AuditAccuracyPoint, AuditStats } from '@/lib/api';

interface AccuracySeries {
  key: 'lr' | 'rf' | 'xgb' | 'ada' | 'ensemble' | 'ensemble_weighted';
  label: string;
  color: string;
  width: number;
  dash?: string;
}

const SERIES: readonly AccuracySeries[] = [
  { key: 'lr', label: 'LR', color: '#2563eb', width: 1.75 },
  { key: 'rf', label: 'RF', color: '#f97316', width: 1.75 },
  { key: 'xgb', label: 'XGBoost', color: '#059669', width: 1.75 },
  { key: 'ada', label: 'AdaBoost', color: '#a855f7', width: 1.75 },
  { key: 'ensemble', label: 'Ensemble (majority)', color: '#0066cc', width: 2.5 },
  {
    key: 'ensemble_weighted',
    label: 'Ensemble (weighted)',
    color: '#be123c',
    width: 2.5,
    dash: '6 4',
  },
];

interface ChartRow {
  n: number;
  lr: number;
  rf: number;
  xgb: number;
  ada: number;
  ensemble: number;
  ensemble_weighted: number;
}

export interface StatsPanelProps {
  stats: AuditStats | null;
  loading: boolean;
  error: string | null;
}

function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}

function accuracyPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value <= 1 ? value * 100 : value;
}

function formatAccuracy(value: number): string {
  return `${accuracyPercent(value).toFixed(1)}%`;
}

function formatTooltipValue(value: unknown): string {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return `${numeric.toFixed(1)}%`;
}

function chartRows(history: readonly AuditAccuracyPoint[]): ChartRow[] {
  return history.map((point) => ({
    n: point.n,
    lr: accuracyPercent(point.lr),
    rf: accuracyPercent(point.rf),
    xgb: accuracyPercent(point.xgb),
    ada: accuracyPercent(point.ada),
    ensemble: accuracyPercent(point.ensemble),
    ensemble_weighted: accuracyPercent(point.ensemble_weighted),
  }));
}

function AccuracyTable({ point }: { point: AuditAccuracyPoint }): ReactElement {
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="text-xs tracking-wide text-black/45 uppercase">
          <th className="py-1 font-medium">Model</th>
          <th className="py-1 text-right font-medium">Accuracy</th>
        </tr>
      </thead>
      <tbody>
        {SERIES.map((series) => {
          const highlighted = series.key === 'ensemble' || series.key === 'ensemble_weighted';
          return (
            <tr
              key={series.key}
              className={
                highlighted
                  ? 'border-t border-forge-primary/20 bg-forge-primary-light font-semibold text-forge-primary'
                  : 'border-t border-black/[0.06]'
              }
            >
              <td className="py-1.5">{series.label}</td>
              <td className="py-1.5 text-right tabular-nums">
                {formatAccuracy(point[series.key])}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ConvergenceChart({ rows }: { rows: ChartRow[] }): ReactElement {
  return (
    <div className="h-60 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
          <XAxis dataKey="n" tick={{ fontSize: 11 }} minTickGap={24} />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            width={40}
            tick={{ fontSize: 11 }}
            tickFormatter={(value: number) => `${value}%`}
          />
          <Tooltip
            formatter={(value, name) => [formatTooltipValue(value), name ?? '']}
            labelFormatter={(label) => `${label} decisions`}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {SERIES.map((series) => (
            <Line
              key={series.key}
              type="monotone"
              dataKey={series.key}
              name={series.label}
              stroke={series.color}
              strokeWidth={series.width}
              strokeDasharray={series.dash}
              dot={{ r: 2 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function StatsPanel({ stats, loading, error }: StatsPanelProps): ReactElement {
  const reviewed = stats?.n_decisions ?? 0;
  const remaining = stats?.remaining ?? 0;
  const total = reviewed + remaining;
  const counts = stats?.decision_counts;
  const history = stats?.accuracy_history ?? [];
  const latest = stats?.accuracy ?? history.at(-1) ?? null;
  const rows = chartRows(history);
  let accuracyBody: ReactNode;

  if (loading && !stats) {
    accuracyBody = <p className="text-sm text-black/60">Loading…</p>;
  } else if (stats?.ready && latest) {
    accuracyBody = (
      <>
        <div>
          <h2 className="mb-2 text-xs font-medium tracking-wide text-black/45 uppercase">Accuracy</h2>
          <AccuracyTable point={latest} />
          <p className="mt-1 text-xs text-black/45">
            Ensemble accuracies are measured on the training decisions. Model accuracies are
            3-fold cross-validation.
          </p>
        </div>
        {rows.length > 0 ? (
          <div>
            <h2 className="mb-2 text-xs font-medium tracking-wide text-black/45 uppercase">
              Convergence
            </h2>
            <ConvergenceChart rows={rows} />
            <p className="mt-1 text-center text-xs text-black/45">Decisions</p>
          </div>
        ) : null}
      </>
    );
  } else if (error) {
    accuracyBody = (
      <p className="text-sm text-forge-danger" role="alert">
        {error}
      </p>
    );
  } else {
    accuracyBody = (
      <p className="text-sm text-black/60">Accuracy appears after 30 decisions.</p>
    );
  }

  return (
    <section className="flex h-full flex-col gap-4 overflow-y-auto bg-white p-4">
      <h1 className="text-base font-bold text-forge-primary">Stats</h1>
      <div>
        <p className="text-sm">
          Reviewed:{' '}
          <span className="font-semibold tabular-nums">
            {stats ? `${formatCount(reviewed)} / ${formatCount(total)}` : '—'}
          </span>
        </p>
        <p className="mt-1 text-sm text-black/70 tabular-nums">
          Same Facility: {formatCount(counts?.same_facility ?? 0)} | Different Facilities:{' '}
          {formatCount(counts?.different_facility ?? 0)}
        </p>
      </div>
      {accuracyBody}
    </section>
  );
}
