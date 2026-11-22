import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(), auth: { getSession: vi.fn() } },
}));

import { TaxonomyCard } from '@/components/results/taxonomy-card';
import { DOES_NOT_APPLY, cardValues, itemPresentValue, positiveItems } from '@/components/results/taxonomy-view';

function render(label: string, values: ReturnType<typeof cardValues>): string {
  return renderToStaticMarkup(
    createElement(TaxonomyCard, { label, ...values, title: values.missingHover }),
  );
}

describe('TaxonomyCard and applies (Spec 10)', () => {
  it('applies false: card reads Does not apply, no $0', () => {
    const byId = {
      delivered_energy_benefit: {
        taxonomy_id: 'delivered_energy_benefit',
        applies: false,
        available: true,
        value_pv: 0,
        value_nominal: 0,
        value_annual: 0,
      },
    };
    const values = cardValues(byId, 'delivered_energy_benefit');
    expect(values.doesNotApply).toBe(true);
    const html = render('Delivered energy', values);
    expect(html).toContain(DOES_NOT_APPLY);
    expect(DOES_NOT_APPLY).toBe('Does not apply');
    expect(html).not.toContain('$0');
  });

  it('no applies field (stored v5.0 row): renders the value as today', () => {
    const byId = {
      delivered_energy_benefit: {
        taxonomy_id: 'delivered_energy_benefit',
        available: true,
        value_pv: 0,
      },
    };
    const values = cardValues(byId, 'delivered_energy_benefit');
    expect(values.doesNotApply).toBe(false);
    expect(render('Delivered energy', values)).toContain('$0');
  });

  it('applies true and not available: Not available, as today', () => {
    const values = cardValues(
      { congestion_benefit: { applies: true, available: false, value_pv: null } },
      'congestion_benefit',
    );
    const html = render('Congestion', values);
    expect(html).toContain('Not available');
    expect(html).not.toContain(DOES_NOT_APPLY);
  });
  it('state does_not_apply without applies (Spec 11): Does not apply', () => {
    const values = cardValues({ row_rent: { state: 'does_not_apply', value_pv: 0 } }, 'row_rent');
    expect(values.doesNotApply).toBe(true);
    expect(render('ROW Rent', values)).toContain(DOES_NOT_APPLY);
  });
  it('state measured overrides a stale applies flag', () => {
    const values = cardValues({ row_rent: { state: 'measured', applies: false, value_pv: 5 } }, 'row_rent');
    expect(values.doesNotApply).toBe(false);
  });
});

describe('item values follow the perspective rate (SunZia ratepayer view)', () => {
  const byId = {
    oandm_line: { taxonomy_id: 'oandm_line', state: 'measured', value_pv: 683_804_522, value_pv_wacc: 358_422_283 },
    capital_recovery: { taxonomy_id: 'capital_recovery', state: 'measured', value_pv: null, value_pv_wacc: 2_850_880_679 },
  };
  it('societal cards show the social-rate value', () => {
    expect(cardValues(byId, 'oandm_line').pvValue).toBe(683_804_522);
    expect(itemPresentValue(byId, 'oandm_line')).toBe(683_804_522);
  });
  it('utility and ratepayer cards show the WACC value, so they add to the category', () => {
    expect(cardValues(byId, 'oandm_line', 'wacc').pvValue).toBe(358_422_283);
    expect(cardValues(byId, 'capital_recovery', 'wacc').pvValue).toBe(2_850_880_679);
    expect(itemPresentValue(byId, 'capital_recovery', 'wacc')).toBe(2_850_880_679);
    expect(positiveItems([{ id: 'capital_recovery', label: 'CR', category: 'capital', subgroup: null, displayOrder: 0 }], byId, true, 'wacc')).toHaveLength(1);
  });
});

describe('detail rows follow the perspective rate', () => {
  const byId = {
    oandm_line: {
      taxonomy_id: 'oandm_line',
      state: 'measured',
      value_pv: 600,
      value_pv_wacc: 300,
      detail: [
        { dimension: 'component', dimension_key: 'base', value_pv: 500, value_pv_wacc: 250 },
        { dimension: 'component', dimension_key: 'vegetation', value_pv: 100, value_pv_wacc: 50 },
      ],
    },
    stored_v6: {
      taxonomy_id: 'stored_v6',
      value_pv: 10,
      value_pv_wacc: 5,
      detail: [{ dimension: 'component', dimension_key: 'vegetation', value_pv: 10 }],
    },
  };
  it('societal rows show social values and wacc rows show WACC values', () => {
    expect(cardValues(byId, 'oandm_line').detailRows.map((r) => r.pv)).toEqual([500, 100]);
    expect(cardValues(byId, 'oandm_line', 'wacc').detailRows.map((r) => r.pv)).toEqual([250, 50]);
  });
  it('a row without a WACC value shows no PV in a WACC view', () => {
    expect(cardValues(byId, 'stored_v6', 'wacc').detailRows[0]!.pv).toBeUndefined();
  });
});

