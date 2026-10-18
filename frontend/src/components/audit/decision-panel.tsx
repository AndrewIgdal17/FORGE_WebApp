import type { ReactElement } from 'react';
import type { AuditDecisionKind, AuditMismatch, AuditPredictions } from '@/lib/api';

const MIN_DECISIONS = 30;

const MODEL_ROWS = [
  { key: 'logistic_regression', label: 'LR' },
  { key: 'random_forest', label: 'RF' },
  { key: 'xgboost', label: 'XGBoost' },
  { key: 'adaboost', label: 'AdaBoost' },
] as const;

const ACTION_BUTTON =
  'h-10 w-full cursor-pointer rounded-md text-sm font-semibold text-white transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forge-primary disabled:cursor-not-allowed disabled:opacity-50';

export interface DecisionPanelProps {
  mismatch: AuditMismatch | null;
  done: boolean;
  loading: boolean;
  deciding: boolean;
  reviewed: number;
  error: string | null;
  onDecide: (decision: AuditDecisionKind) => void;
}

function displayName(value: string | null): string {
  const text = value?.trim();
  return text ? text : '—';
}

function formatMeters(value: number): string {
  return `${Math.round(value).toLocaleString('en-US')} m`;
}

function formatMiles(value: number): string {
  return `${value.toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} miles`;
}

function formatKv(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const text = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${text} kV`;
}

function formatTier(tier: number): string {
  if (tier === 1) return '1 (inside)';
  if (tier === 2) return '2 (proximity)';
  return String(tier);
}

function decisionLabel(value: string): string {
  if (value === 'accept') return 'Accept';
  if (value === 'keep') return 'Keep';
  if (value === 'skip') return 'Skip';
  return value;
}

function formatConfidence(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const percent = value <= 1 ? value * 100 : value;
  return `${percent.toFixed(1)}%`;
}

function Field({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <dt className="shrink-0 text-black/50">{label}</dt>
      <dd className="text-right font-medium text-black/85">{value}</dd>
    </div>
  );
}

function Predictions({
  predictions,
  reviewed,
}: {
  predictions: AuditPredictions | null;
  reviewed: number;
}): ReactElement {
  if (!predictions) {
    return (
      <p className="text-sm text-black/60">
        Collecting training data... {reviewed}/{MIN_DECISIONS}
      </p>
    );
  }

  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="text-xs tracking-wide text-black/45 uppercase">
          <th className="py-1 font-medium">Model</th>
          <th className="py-1 font-medium">Prediction</th>
          <th className="py-1 text-right font-medium">Confidence</th>
        </tr>
      </thead>
      <tbody>
        {MODEL_ROWS.map((row) => {
          const model = predictions.models[row.key];
          return (
            <tr key={row.key} className="border-t border-black/[0.06]">
              <td className="py-1.5">{row.label}</td>
              <td className="py-1.5">{decisionLabel(model.prediction)}</td>
              <td className="py-1.5 text-right tabular-nums">{formatConfidence(model.confidence)}</td>
            </tr>
          );
        })}
        <tr className="border-t border-forge-primary/20 bg-forge-primary-light font-semibold text-forge-primary">
          <td className="rounded-bl-md py-1.5 pl-1">Ensemble</td>
          <td className="py-1.5">{decisionLabel(predictions.ensemble.prediction)}</td>
          <td className="rounded-br-md py-1.5 pr-1 text-right tabular-nums">
            {predictions.ensemble.agreement} agree
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export function DecisionPanel({
  mismatch,
  done,
  loading,
  deciding,
  reviewed,
  error,
  onDecide,
}: DecisionPanelProps): ReactElement {
  return (
    <section className="flex h-full flex-col bg-white">
      <header className="border-b border-black/[0.08] px-4 py-3">
        <h1 className="text-base font-bold text-forge-primary">Name Audit</h1>
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading && !mismatch ? (
          <p className="text-sm text-black/60">Loading…</p>
        ) : null}
        {!loading && done ? (
          <p className="text-sm font-medium text-black/80">All done! No more mismatches.</p>
        ) : null}
        {!loading && !done && !mismatch && error ? (
          <p className="text-sm text-forge-danger" role="alert">
            {error}
          </p>
        ) : null}
        {mismatch ? (
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-xs font-medium tracking-wide text-black/45 uppercase">HIFLD Name</p>
              <p className="text-lg leading-snug font-semibold">{displayName(mismatch.hifld_name)}</p>
            </div>
            <div>
              <p className="text-xs font-medium tracking-wide text-black/45 uppercase">
                Matched Substation
              </p>
              <p className="text-lg leading-snug font-semibold">{displayName(mismatch.matched_name)}</p>
            </div>
            <dl className="flex flex-col gap-1.5 border-t border-black/[0.08] pt-3">
              <Field label="Distance" value={formatMeters(mismatch.distance_m)} />
              <Field
                label="Voltage"
                value={`${formatKv(mismatch.voltage_kv)} / ${formatKv(mismatch.sub_voltage_kv)}`}
              />
              <Field label="Match Tier" value={formatTier(mismatch.match_tier)} />
              <Field label="Corridor Length" value={formatMiles(mismatch.corridor_miles)} />
              <Field label="Corridor Source" value={displayName(mismatch.source)} />
              <Field label="Endpoint" value={mismatch.endpoint.toUpperCase()} />
            </dl>
            <div className="border-t border-black/[0.08] pt-3">
              <h2 className="mb-2 text-xs font-medium tracking-wide text-black/45 uppercase">
                Model predictions
              </h2>
              <Predictions
                predictions={
                  mismatch.predictions && mismatch.predictions.ready !== false
                    ? mismatch.predictions
                    : null
                }
                reviewed={reviewed}
              />
            </div>
          </div>
        ) : null}
      </div>
      {mismatch ? (
        <footer className="flex flex-col gap-2 border-t border-black/[0.08] p-4">
          {error ? (
            <p className="text-sm text-forge-danger" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            className={`${ACTION_BUTTON} bg-emerald-600 hover:bg-emerald-700`}
            disabled={deciding}
            onClick={() => {
              onDecide('accept');
            }}
          >
            Accept
          </button>
          <button
            type="button"
            className={`${ACTION_BUTTON} bg-forge-primary hover:bg-forge-primary-hover`}
            disabled={deciding}
            onClick={() => {
              onDecide('keep');
            }}
          >
            Keep HIFLD
          </button>
          <button
            type="button"
            className={`${ACTION_BUTTON} bg-neutral-500 hover:bg-neutral-600`}
            disabled={deciding}
            onClick={() => {
              onDecide('skip');
            }}
          >
            Skip
          </button>
        </footer>
      ) : null}
    </section>
  );
}
