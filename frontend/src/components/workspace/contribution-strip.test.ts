import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(), auth: { getSession: vi.fn() } },
}));

import { stripGridClass } from '@/components/workspace/contribution-strip';
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
    ...STRIP_CONFIG['economic-details'].figures.slice(0, 2),
    STRIP_CONFIG['system-constraints'].figures[1]!,
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
