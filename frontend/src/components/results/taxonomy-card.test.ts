import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(), auth: { getSession: vi.fn() } },
}));

import { TaxonomyCard } from '@/components/results/taxonomy-card';
import { DOES_NOT_APPLY, cardValues } from '@/components/results/taxonomy-view';

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
});
