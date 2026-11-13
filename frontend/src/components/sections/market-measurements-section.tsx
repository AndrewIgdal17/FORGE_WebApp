import type { ReactElement } from 'react';
import { formatCurrency } from '@/lib/format';
import { useFormStore, type RouteAnalysisMemory } from '@/stores/form-store';

const SPREAD = '01_project_technical_details.market_measurements.congestion_spread_per_mwh';
const HOURS_RECEIVING =
  '01_project_technical_details.market_measurements.hours_receiving_more_congested';
const HOURS_SENDING =
  '01_project_technical_details.market_measurements.hours_sending_more_congested';
const ENERGY = '01_project_technical_details.market_measurements.receiving_energy_value_per_mwh';

type StatusKey = keyof RouteAnalysisMemory['marketStatus'];

const ROWS: Array<{
  path: string;
  label: string;
  kind: 'money' | 'count';
  statusKey: StatusKey;
}> = [
  {
    path: SPREAD,
    label: 'Congestion spread ($/MWh)',
    kind: 'money',
    statusKey: 'spread',
  },
  {
    path: HOURS_RECEIVING,
    label: 'Hours receiving end more congested',
    kind: 'count',
    statusKey: 'spread',
  },
  {
    path: HOURS_SENDING,
    label: 'Hours sending end more congested',
    kind: 'count',
    statusKey: 'spread',
  },
  {
    path: ENERGY,
    label: 'Receiving-end energy value ($/MWh)',
    kind: 'money',
    statusKey: 'receiving_energy_value',
  },
];

function shown(kind: 'money' | 'count', value: unknown, reason: string | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return reason ? `Not available — ${reason}` : 'Not available';
  }
  return kind === 'money' ? formatCurrency(value, 2) : String(Math.trunc(value));
}

function Measurement({
  path,
  label,
  kind,
  statusKey,
}: {
  path: string;
  label: string;
  kind: 'money' | 'count';
  statusKey: StatusKey;
}): ReactElement {
  const value = useFormStore((state) => state.getFieldValue(path));
  // getFieldValue reads the live store. The status read does the same: a
  // server render snapshot is the store's initial state, not later analysis.
  const reason = useFormStore(
    () => useFormStore.getState().routeAnalysis?.marketStatus[statusKey]?.reason,
  );
  return (
    <div>
      <dt className="text-sm font-medium text-slate-800">{label}</dt>
      <dd className="text-sm text-slate-700">{shown(kind, value, reason)}</dd>
    </div>
  );
}

export function MarketMeasurementsSection(): ReactElement {
  return (
    <section id="market-measurements" className="grid max-w-xl gap-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Market measurements</h2>
        <p className="text-sm text-slate-600">Drawing a route fills these measurements.</p>
      </div>
      <dl className="grid gap-3">
        {ROWS.map((row) => (
          <Measurement key={row.path} {...row} />
        ))}
      </dl>
    </section>
  );
}
