import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(), auth: { getSession: vi.fn() } },
}));

import { formatDeltaChipLabel, stripGridClass } from '@/components/workspace/contribution-strip';
import { STRIP_CONFIG } from '@/data/strip-config';

describe('stripGridClass', () => {
  it('gives a one-figure strip a single column', () => {
    expect(stripGridClass(1)).toBe('grid-cols-1');
    expect(stripGridClass(STRIP_CONFIG['delay-costs'].figures.length)).toBe('grid-cols-1');
  });
  it('keeps the existing column counts', () => {
    expect(stripGridClass(2)).toBe('grid-cols-2');
    expect(stripGridClass(5)).toBe('grid-cols-5');
  });
});

import { displayFigure } from '@/components/workspace/contribution-strip';

const NOT_APPLYING = {
  bcr: { delivered_benefit_pv: 0, capacity_value_benefit_pv: 0, congestion_benefit_pv: 0 },
  taxonomy_results: [
    { taxonomy_id: 'delivered_energy_benefit', applies: false, available: true, value_pv: 0 },
    { taxonomy_id: 'capacity_value_benefit', applies: false, available: true, value_pv: 0 },
    { taxonomy_id: 'congestion_benefit', applies: false, available: true, value_pv: 0 },
  ],
};

describe('benefit strips and applies (Spec 10 rule 8)', () => {
  const figures = [
    ...STRIP_CONFIG['system-constraints'].figures.slice(0, 2),
    STRIP_CONFIG['system-constraints'].figures[3]!,
  ];
  it('a benefit that does not apply reads Does not apply', () => {
    for (const figure of figures) expect(displayFigure(figure, NOT_APPLYING)).toBe('Does not apply');
  });
  it('a stored result without applies shows its value as today', () => {
    const old = { bcr: NOT_APPLYING.bcr };
    for (const figure of figures) expect(displayFigure(figure, old)).toBe('$0');
  });
});

const AEP_LIKE = {
  costs: {
    row: { row_holding_pv: 0, acquisition_pv: 0, row_rent_pv: 2142409 },
    environmental: { base_cost_pv: 0, credits_pv: 0 },
  },
  bcr: { converter_loss_pv: 0, env_mitigation_pv: 0 },
  taxonomy_results: [
    { taxonomy_id: 'build_structure', state: 'does_not_apply', value_pv: 0 },
    { taxonomy_id: 'build_converter', state: 'does_not_apply', value_pv: 0 },
    { taxonomy_id: 'line_loss_converter', state: 'does_not_apply', value_pv: 0 },
    { taxonomy_id: 'row_acquisition', state: 'does_not_apply', value_pv: 0 },
    { taxonomy_id: 'row_holding', state: 'does_not_apply', value_pv: 0 },
    { taxonomy_id: 'row_rent', state: 'measured', value_pv: 2142409 },
    { taxonomy_id: 'env_mitigation', state: 'does_not_apply', value_pv: 0 },
  ],
};

function figureByLabel(stripKey: string, label: string) {
  const figure = STRIP_CONFIG[stripKey]!.figures.find((f) => f.label === label);
  if (!figure) throw new Error(`${stripKey}: ${label}`);
  return figure;
}

describe('cost strips and state (Spec 11)', () => {
  const off: Array<[string, string]> = [
    ['converter-details', 'Converter Build Cost PV'],
    ['converter-details', 'Converter Loss PV'],
    ['rights-of-way', 'Holding PV'],
    ['rights-of-way', 'Acquisition PV'],
    ['base-mitigation', 'Total Env. Mitigation PV'],
    ['base-mitigation', 'Base Restoration PV'],
    ['base-mitigation', 'Credits PV'],
  ];
  it('a cost that does not apply reads Does not apply (state only, no applies field)', () => {
    for (const [strip, label] of off) {
      expect(displayFigure(figureByLabel(strip, label), AEP_LIKE), `${strip} ${label}`).toBe('Does not apply');
    }
    const structure = Object.values(STRIP_CONFIG)
      .flatMap((c) => c.figures)
      .find((f) => f.label === 'Structure Cost PV')!;
    expect(displayFigure(structure, AEP_LIKE)).toBe('Does not apply');
  });
  it('a measured cost shows its value', () => {
    expect(displayFigure(figureByLabel('rights-of-way', 'Rent PV'), AEP_LIKE)).toBe('$2,142,409');
  });
});

const LINE_LOSS_NET = {
  costs: {
    line_loss: {
      line_loss_mwh_yr: -120,
      line_loss_mwh_yr_new: 80,
      line_loss_mwh_yr_old: 200,
      converter_loss_mwh_yr: 0,
      converter_loss_mwh_yr_new: 50,
      converter_loss_mwh_yr_old: 50,
    },
  },
};

const LINE_LOSS_LEGACY = {
  costs: {
    line_loss: {
      line_loss_mwh_yr: 200,
      converter_loss_mwh_yr: 10,
    },
  },
};

describe('net MWh delta chip (Spec 17)', () => {
  it('formats a net-loss comparison delta in MWh, not dollars', () => {
    const figure = figureByLabel(
      'conductor-details',
      'Net change in conductor losses (MWh/yr)',
    );
    const label = formatDeltaChipLabel(-120, 0, figure);
    expect(label).not.toBeNull();
    expect(label).not.toMatch(/\$/);
    expect(label).toContain('MWh');
  });
});

describe('net line and converter loss MWh (Task 5)', () => {
  it('labels net conductor and converter figures and shows savings for negative net', () => {
    const conductor = figureByLabel(
      'conductor-details',
      'Net change in conductor losses (MWh/yr)',
    );
    const converter = figureByLabel(
      'converter-details',
      'Net change in converter losses (MWh/yr)',
    );
    expect(displayFigure(conductor, LINE_LOSS_NET)).toBe('120 MWh/yr saved');
    expect(displayFigure(converter, LINE_LOSS_NET)).toBe('0');
  });

  it('shows new and old conductor and converter MWh figures', () => {
    expect(
      displayFigure(
        figureByLabel('conductor-details', 'Conductor losses, new line (MWh/yr)'),
        LINE_LOSS_NET,
      ),
    ).toBe('80');
    expect(
      displayFigure(
        figureByLabel('conductor-details', 'Conductor losses, replaced line (MWh/yr)'),
        LINE_LOSS_NET,
      ),
    ).toBe('200');
    expect(
      displayFigure(
        figureByLabel('converter-details', 'Converter losses, new line (MWh/yr)'),
        LINE_LOSS_NET,
      ),
    ).toBe('50');
    expect(
      displayFigure(
        figureByLabel('converter-details', 'Converter losses, replaced line (MWh/yr)'),
        LINE_LOSS_NET,
      ),
    ).toBe('50');
  });

  it('reads Not available when new/old keys are missing on a stored result', () => {
    for (const label of [
      'Conductor losses, new line (MWh/yr)',
      'Conductor losses, replaced line (MWh/yr)',
    ]) {
      expect(
        displayFigure(figureByLabel('conductor-details', label), LINE_LOSS_LEGACY),
        label,
      ).toBe('Not available');
    }
    for (const label of [
      'Converter losses, new line (MWh/yr)',
      'Converter losses, replaced line (MWh/yr)',
    ]) {
      expect(
        displayFigure(figureByLabel('converter-details', label), LINE_LOSS_LEGACY),
        label,
      ).toBe('Not available');
    }
  });
});

describe('outage strip redispatch (Spec 18)', () => {
  const nullRedispatch = {
    bcr: { outage_load_shed_pv: 100, outage_redispatch_pv: null, outage_pv: 100 },
  };

  it('shows Not available on Redispatch PV when the spread is missing', () => {
    const figure = STRIP_CONFIG['outage-risk']!.figures.find((f) => f.label === 'Redispatch PV')!;
    expect(displayFigure(figure, nullRedispatch)).toBe('Not available');
  });
});

describe('vegetation strip and oandm_line (Task 8)', () => {
  const reconductoring = {
    costs: {
      oandm: { vegetation_annual: 1_200, vegetation_pv: 9_876 },
    },
    bcr: { oandm_pv: 9_876 },
    taxonomy_results: [{ taxonomy_id: 'oandm_line', state: 'does_not_apply', value_pv: null }],
  };

  it('reads Does not apply on vegetation figures when line O&M does not apply', () => {
    for (const label of ['Vegetation Annual', 'Vegetation PV']) {
      expect(displayFigure(figureByLabel('vegetation-management', label), reconductoring)).toBe(
        'Does not apply',
      );
    }
  });
});

describe('outage redispatch on a dedicated line (pre-v6 tidy-up)', () => {
  const dedicated = {
    bcr: { outage_load_shed_pv: 12_000, outage_redispatch_pv: null },
    taxonomy_results: [
      { taxonomy_id: 'outage_load_shed', state: 'measured', value_pv: 12_000 },
      { taxonomy_id: 'outage_redispatch', state: 'does_not_apply', value_pv: null },
    ],
  };
  const missingSpread = {
    bcr: { outage_load_shed_pv: 12_000, outage_redispatch_pv: null },
    taxonomy_results: [
      { taxonomy_id: 'outage_load_shed', state: 'measured', value_pv: 12_000 },
      { taxonomy_id: 'outage_redispatch', state: 'not_available', available: false, value_pv: null },
    ],
  };
  it('reads Does not apply on a dedicated line and Not available when the spread is missing', () => {
    const figure = figureByLabel('outage-risk', 'Redispatch PV');
    expect(displayFigure(figure, dedicated)).toBe('Does not apply');
    expect(displayFigure(figure, missingSpread)).not.toBe('Does not apply');
  });
});
