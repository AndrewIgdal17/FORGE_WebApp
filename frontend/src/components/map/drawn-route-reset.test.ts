import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: vi.fn() } },
}));

import { useFormStore } from '@/stores/form-store';
import { applyDrawnRouteReset } from './drawn-route-reset';
import mapPanelSource from './MapPanel.tsx?raw';

const SPREAD = '01_project_technical_details.market_measurements.congestion_spread_per_mwh';
const HOURS_RECEIVING =
  '01_project_technical_details.market_measurements.hours_receiving_more_congested';
const HOURS_SENDING =
  '01_project_technical_details.market_measurements.hours_sending_more_congested';
const ENERGY =
  '01_project_technical_details.market_measurements.receiving_energy_value_per_mwh';

function memory() {
  return {
    marketStatus: {
      spread: { status: 'measured', reason: 'Both ends are in SPP.' },
      receiving_energy_value: { status: 'measured', reason: 'Receiving end is in SPS.' },
    },
    sendingIso: 'SPP',
    sendingPriceZone: 'SPS',
    receivingIso: 'SPP',
    receivingPriceZone: 'OKGE',
  };
}

describe('applyDrawnRouteReset', () => {
  it('clears the four market measurements and the stored analysis', () => {
    useFormStore.setState({
      defaults: {
        '01_project_technical_details': {
          market_measurements: {
            congestion_spread_per_mwh: null,
            hours_receiving_more_congested: null,
            hours_sending_more_congested: null,
            receiving_energy_value_per_mwh: null,
          },
        },
      },
      data: {
        '01_project_technical_details': {
          market_measurements: {
            congestion_spread_per_mwh: 12.5,
            hours_receiving_more_congested: 100,
            hours_sending_more_congested: 40,
            receiving_energy_value_per_mwh: 18.25,
          },
        },
      },
      routeAnalysis: memory(),
    } as unknown as ReturnType<typeof useFormStore.getState>);

    const before = useFormStore.getState().getChanges();
    expect(before[SPREAD]).toBe(12.5);
    expect(before[HOURS_RECEIVING]).toBe(100);
    expect(before[HOURS_SENDING]).toBe(40);
    expect(before[ENERGY]).toBe(18.25);

    applyDrawnRouteReset();

    const state = useFormStore.getState();
    expect(state.getFieldValue(SPREAD)).toBeNull();
    expect(state.getFieldValue(HOURS_RECEIVING)).toBeNull();
    expect(state.getFieldValue(HOURS_SENDING)).toBeNull();
    expect(state.getFieldValue(ENERGY)).toBeNull();
    expect(state.routeAnalysis).toBeNull();
    const after = state.getChanges();
    expect(after[SPREAD]).toBeUndefined();
    expect(after[HOURS_RECEIVING]).toBeUndefined();
    expect(after[HOURS_SENDING]).toBeUndefined();
    expect(after[ENERGY]).toBeUndefined();

    const source = mapPanelSource;
    const start = source.indexOf('function handleReset');
    const reset = source.slice(start, source.indexOf('return (', start));
    expect(reset).toContain('applyDrawnRouteReset()');
  });
});
