import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(), auth: { getSession: vi.fn() } },
}));

import { ComparisonTable } from '@/components/comparison/comparison-table';
import { formatComparisonValue } from '@/components/comparison/delta-display';
import { CMP_PICKER_STORAGE_KEY, COMPARISON_METRICS } from '@/data/configs';
import { exportAsCsv, type Scenario } from '@/stores/scenario-store';

const METRIC_KEYS = [
  'congestion_spread_per_mwh',
  'hours_receiving_more_congested',
  'hours_sending_more_congested',
  'receiving_energy_value_per_mwh',
] as const;

const METRIC_PATHS: Record<(typeof METRIC_KEYS)[number], string> = {
  congestion_spread_per_mwh: 'technical_parameters.market_measurements.congestion_spread_per_mwh',
  hours_receiving_more_congested:
    'technical_parameters.market_measurements.hours_receiving_more_congested',
  hours_sending_more_congested:
    'technical_parameters.market_measurements.hours_sending_more_congested',
  receiving_energy_value_per_mwh:
    'technical_parameters.market_measurements.receiving_energy_value_per_mwh',
};

const OMITTED = [
  'avoided_emissions_benefit',
  'congestion_benefit',
  'emissions_comp',
  'line_loss_conductor',
];

function metric(key: string) {
  for (const group of COMPARISON_METRICS) {
    const found = group.metrics.find((item) => item.key === key);
    if (found) return found;
  }
  return undefined;
}

function scenario(id: string, name: string, results: Record<string, unknown>): Scenario {
  return {
    id,
    name,
    source: 'user',
    defaults_id: 'defaults',
    changes: {},
    results,
    calculator: null,
    inputs_id: null,
    computed_at: null,
    calc_error: null,
    revision: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    user_id: 'user',
    route: null,
    route_geojson: null,
    segments: null,
  };
}

function measurements(
  values: Record<string, number | null> | null,
  decoys: Record<string, number>,
): Record<string, unknown> {
  const technical: Record<string, unknown> = { ...decoys };
  if (values) technical.market_measurements = values;
  return { technical_parameters: technical };
}

function renderRows(scenarios: Scenario[]): string {
  const store = new Map<string, string>([
    [CMP_PICKER_STORAGE_KEY, JSON.stringify([...METRIC_KEYS])],
  ]);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  });
  return renderToStaticMarkup(
    createElement(ComparisonTable, {
      scenarios,
      baselineId: scenarios[0]?.id ?? '',
      showDelta: false,
      showPercentDelta: false,
    }),
  );
}

async function captureCsv(row: Scenario): Promise<string> {
  const blobs: Blob[] = [];
  vi.stubGlobal('document', {
    createElement: () => ({
      href: '',
      download: '',
      click() {},
    }),
    body: {
      appendChild() {},
      removeChild() {},
    },
  });
  vi.stubGlobal('URL', {
    createObjectURL(blob: Blob) {
      blobs.push(blob);
      return 'blob:csv';
    },
    revokeObjectURL() {},
  });
  exportAsCsv(row, {});
  return blobs[0]?.text() ?? '';
}

describe('comparison market measurements', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('test_acceptance_comparison_rows_and_csv_omitted', async () => {
    expect(metric('baseline_price_mwh')).toBeUndefined();
    for (const key of METRIC_KEYS) {
      const row = metric(key);
      expect(row?.path).toBe(METRIC_PATHS[key]);
      expect(row !== undefined && 'zeroIfMissing' in row).toBe(false);
    }
    expect(formatComparisonValue(null, 'number2')).toBe('Not available');
    expect(formatComparisonValue(undefined, 'number')).toBe('Not available');

    const decoyLoad = 'value_of_' + 'load_per_mwh';
    const decoySpread = 'average_' + 'congestion_price';
    const measured = measurements(
      {
        congestion_spread_per_mwh: 12.5,
        hours_receiving_more_congested: 100,
        hours_sending_more_congested: 40,
        receiving_energy_value_per_mwh: 33.25,
      },
      { [decoyLoad]: 7777.77, [decoySpread]: 8888.88 },
    );
    const unavailable = measurements(
      {
        congestion_spread_per_mwh: null,
        hours_receiving_more_congested: null,
        hours_sending_more_congested: null,
        receiving_energy_value_per_mwh: null,
      },
      { [decoyLoad]: 50, [decoySpread]: 40 },
    );
    const html = renderRows([
      scenario('measured', 'Measured', measured),
      scenario('unavailable', 'Unavailable', unavailable),
    ]);
    expect(html).toContain('12.50');
    expect(html).toContain('100');
    expect(html).toContain('40');
    expect(html).toContain('33.25');
    expect(html).toContain('Not available');
    expect(html).not.toContain('7777.77');
    expect(html).not.toContain('8888.88');
    expect(html).not.toContain('>50<');

    const schema1 = renderRows([
      scenario(
        'schema1',
        'Schema 1',
        measurements(null, { [decoyLoad]: 50, [decoySpread]: 40 }),
      ),
    ]);
    expect(schema1).toContain('Not available');
    expect(schema1).not.toContain('0.00');
    expect(schema1).not.toContain('>50<');
    expect(schema1).not.toContain('>40<');

    const csv = await captureCsv(
      scenario('csv', 'Csv', {
        bcr: {
          bcr_societal: null,
          omitted: { bcr_societal: OMITTED },
        },
      }),
    );
    expect(csv).toContain('key,value,omitted\n');
    expect(csv).toContain(
      'bcr_societal,not available,avoided_emissions_benefit;congestion_benefit;emissions_comp;line_loss_conductor\n',
    );
    expect(csv).toContain('delay_pv,not available,\n');
  });
});
