import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: vi.fn() } },
}));

import { SIDEBAR_SECTIONS } from '@/data/sidebar-sections';
import { formatCurrency } from '@/lib/format';
import { useFormStore } from '@/stores/form-store';

const PRICE_PATHS = ['average_congestion_' + 'price', 'value_of_load_' + 'per_mwh'];
const SOURCES = import.meta.glob('../../**/*.{ts,tsx,css}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function textOf(suffix: string): string {
  const match = Object.entries(SOURCES).find(([file]) => file.endsWith(suffix));
  if (!match) throw new Error(`missing source ${suffix}`);
  return match[1];
}

const SPREAD = '01_project_technical_details.market_measurements.congestion_spread_per_mwh';
const HOURS_RECEIVING =
  '01_project_technical_details.market_measurements.hours_receiving_more_congested';
const HOURS_SENDING =
  '01_project_technical_details.market_measurements.hours_sending_more_congested';
const ENERGY =
  '01_project_technical_details.market_measurements.receiving_energy_value_per_mwh';
const FLOW =
  '17_congestion_reductions.greenfield_congestion_reductions.constraints.flow_factor';

const SPREAD_REASON = 'Both ends are in SPP.';
const ENERGY_REASON = 'Receiving end is in SPS.';

interface RouteMemory {
  marketStatus: {
    spread: { status: string; reason: string };
    receiving_energy_value: { status: string; reason: string };
  };
  sendingIso: string | null;
  sendingPriceZone: string | null;
  receivingIso: string | null;
  receivingPriceZone: string | null;
}

function memory(): RouteMemory {
  return {
    marketStatus: {
      spread: { status: 'measured', reason: SPREAD_REASON },
      receiving_energy_value: { status: 'measured', reason: ENERGY_REASON },
    },
    sendingIso: 'SPP',
    sendingPriceZone: 'SPS',
    receivingIso: 'SPP',
    receivingPriceZone: 'OKGE',
  };
}

function readMemory(): RouteMemory | null {
  const state = useFormStore.getState() as { routeAnalysis?: RouteMemory | null };
  return state.routeAnalysis ?? null;
}

describe('typed price paths', () => {
  it('are absent under frontend/src except configs.ts', () => {
    const hits: string[] = [];
    for (const [file, text] of Object.entries(SOURCES)) {
      if (file.endsWith('data/configs.ts')) continue;
      for (const needle of PRICE_PATHS) {
        if (text.includes(needle)) hits.push(`${file}: ${needle}`);
      }
    }
    expect(hits).toEqual([]);
  });
});

describe('sectionForRequiredPath', () => {
  it('sends flow share and exceedance to system constraints', () => {
    const source = textOf('pages/workspace.tsx');
    const start = source.indexOf('function sectionForRequiredPath');
    const end = source.indexOf('function BeforeCalculationPanel');
    const fn = source.slice(start, end);
    expect(fn).toContain("path.includes('flow_factor')");
    expect(fn).toContain("path.includes('average_exceedance')");
    expect(fn).toContain("subItemId: 'system-constraints'");
    expect(fn).not.toContain('congestion_reductions');
    expect(fn).not.toContain(PRICE_PATHS[1]);
  });
});

describe('market measurements sidebar', () => {
  it('is under routing, after terminals', () => {
    const routing = SIDEBAR_SECTIONS.inputs.find((section) => section.id === 'routing');
    const ids = routing?.subItems.map((item) => item.id) ?? [];
    const terminals = ids.indexOf('terminals');
    expect(ids[terminals + 1]).toBe('market-measurements');
    expect(routing?.subItems[terminals + 1]?.label).toBe('Market measurements');
  });
});

describe('setFieldValue route paths', () => {
  it('refuses the four measurement paths and any source route row', () => {
    useFormStore.setState({
      data: {},
      inputMetadata: [
        {
          yaml_section: '01_project_technical_details.terminals',
          field_path: 'sending.gea',
          source: 'route',
        },
      ],
    });
    const { setFieldValue, getFieldValue } = useFormStore.getState();
    setFieldValue(SPREAD, 12.5);
    setFieldValue(HOURS_RECEIVING, 10);
    setFieldValue(HOURS_SENDING, 20);
    setFieldValue(ENERGY, 40);
    setFieldValue('01_project_technical_details.terminals.sending.gea', 'TYPED');
    setFieldValue(FLOW, 0.5);
    expect(getFieldValue(SPREAD)).toBeUndefined();
    expect(getFieldValue(HOURS_RECEIVING)).toBeUndefined();
    expect(getFieldValue(HOURS_SENDING)).toBeUndefined();
    expect(getFieldValue(ENERGY)).toBeUndefined();
    expect(getFieldValue('01_project_technical_details.terminals.sending.gea')).toBeUndefined();
    expect(getFieldValue(FLOW)).toBe(0.5);
  });

  it('still writes measurements through applyChanges and loadScenarioChanges', () => {
    useFormStore.setState({
      defaults: {},
      data: {},
      routeAnalysis: memory(),
    } as unknown as ReturnType<typeof useFormStore.getState>);
    useFormStore.getState().applyChanges({ [SPREAD]: null, [HOURS_RECEIVING]: 3 });
    expect(useFormStore.getState().getFieldValue(SPREAD)).toBeNull();
    expect(useFormStore.getState().getFieldValue(HOURS_RECEIVING)).toBe(3);

    useFormStore.getState().loadScenarioChanges({ [ENERGY]: 12.5 });
    expect(useFormStore.getState().getFieldValue(ENERGY)).toBe(12.5);
    expect(readMemory()).toBeNull();
  });
});

describe('recordAnalysis', () => {
  it('stores market status and the iso and zone fields, then applies changes', () => {
    useFormStore.setState({ data: {}, defaults: {}, routeAnalysis: null } as unknown as ReturnType<
      typeof useFormStore.getState
    >);
    const actions = useFormStore.getState() as ReturnType<typeof useFormStore.getState> & {
      recordAnalysis?: (body: {
        changes: Record<string, unknown>;
        market_status: RouteMemory['marketStatus'];
        sending_iso: string | null;
        sending_price_zone: string | null;
        receiving_iso: string | null;
        receiving_price_zone: string | null;
      }) => void;
    };
    expect(typeof actions.recordAnalysis).toBe('function');
    actions.recordAnalysis?.({
      changes: { [SPREAD]: null, [ENERGY]: 18.25, [HOURS_RECEIVING]: 100, [HOURS_SENDING]: 40 },
      market_status: memory().marketStatus,
      sending_iso: 'SPP',
      sending_price_zone: 'SPS',
      receiving_iso: 'SPP',
      receiving_price_zone: 'OKGE',
    });
    expect(readMemory()).toEqual(memory());
    expect(useFormStore.getState().getFieldValue(SPREAD)).toBeNull();
    expect(useFormStore.getState().getFieldValue(ENERGY)).toBe(18.25);
  });
});

describe('MapPanel', () => {
  it('records the analyze body', () => {
    const source = textOf('map/MapPanel.tsx');
    expect(source).toContain('recordAnalysis(');
    expect(source).not.toContain('applyChanges(changesAfterAnalyze');
  });
});

describe('endpointLine', () => {
  it('appends the ISO code and the price zone beside the region', async () => {
    const mod = await import('../map/endpoint-line');
    const line = mod.endpointLine;
    expect(line('Sending', 'SPSO', 'SPP_South', 'TX', null, 'SPP', 'SPS')).toBe(
      'Sending: SPSO / SPP_South / TX · SPP · SPS',
    );
    expect(
      line(
        'Receiving',
        'SPSO',
        'SPP_South',
        'TX',
        { gid: 1, name: 'Austin', voltage_kv: '345' },
        'SPP',
        'OKGE',
      ),
    ).toBe('Receiving: Austin (345 kV) — SPSO / SPP_South / TX · SPP · OKGE');
    expect(line('Sending', 'SPSO', 'SPP_South', 'TX', null, null, null)).toBe(
      'Sending: SPSO / SPP_South / TX',
    );
  });
});

describe('MarketMeasurementsSection', () => {
  it('shows Not available and the matching reason when a value is null', async () => {
    useFormStore.setState({
      data: {},
      routeAnalysis: memory(),
    } as unknown as ReturnType<typeof useFormStore.getState>);
    useFormStore.getState().applyChanges({
      [SPREAD]: null,
      [HOURS_RECEIVING]: null,
      [HOURS_SENDING]: null,
      [ENERGY]: null,
    });
    const mod = (await import('./market-measurements-section')) as {
      MarketMeasurementsSection?: () => ReturnType<typeof createElement>;
    };
    expect(typeof mod.MarketMeasurementsSection).toBe('function');
    const html = renderToStaticMarkup(createElement(mod.MarketMeasurementsSection!));
    expect(html).toContain('Not available');
    expect(html).toContain(SPREAD_REASON);
    expect(html).toContain(ENERGY_REASON);
    expect(html).not.toContain('<input');
  });

  it('formats money and shows hour counts as plain integers', async () => {
    useFormStore.setState({
      data: {},
      routeAnalysis: memory(),
    } as unknown as ReturnType<typeof useFormStore.getState>);
    useFormStore.getState().applyChanges({
      [SPREAD]: 12.5,
      [HOURS_RECEIVING]: 100,
      [HOURS_SENDING]: 40,
      [ENERGY]: 0,
    });
    const mod = (await import('./market-measurements-section')) as {
      MarketMeasurementsSection?: () => ReturnType<typeof createElement>;
    };
    expect(typeof mod.MarketMeasurementsSection).toBe('function');
    const html = renderToStaticMarkup(createElement(mod.MarketMeasurementsSection!));
    expect(html).toContain(formatCurrency(12.5, 2));
    expect(html).toContain(formatCurrency(0, 2));
    expect(html).toContain('>100<');
    expect(html).toContain('>40<');
    expect(html).not.toContain('Not available');
    expect(html).not.toContain(SPREAD_REASON);
    expect(html).not.toContain('<input');
  });
});

describe('SectionDispatcher', () => {
  it('mounts market measurements', async () => {
    const mod = await import('./section-dispatcher');
    const html = renderToStaticMarkup(
      createElement(mod.SectionDispatcher, { subItemId: 'market-measurements' }),
    );
    expect(html).not.toContain('Section not found');
    expect(html).toContain('Market measurements');
  });
});
