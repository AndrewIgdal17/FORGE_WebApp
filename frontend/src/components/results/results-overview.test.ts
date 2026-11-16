import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { PerspectiveKey } from '@/components/results/perspective-toggle';
import {
  PERSPECTIVE_CATEGORIES,
  ResultsOverview,
  WATERFALL_NOT_AVAILABLE,
  adjustedRatio,
  categoryValueText,
  externalAccordionSubgroupHeadings,
  loadCategories,
  readTotal,
} from '@/components/results/results-overview';
import { DELAY_OTHER_VIEW_NOTE, DIRECT_DELAY_LABEL } from '@/lib/delay-comparison';
import { SUNZIA_DELAY2_BLOCK } from '@/lib/delay-comparison.fixtures';

const results: Record<string, unknown> = {
  bcr: {
    bcr_societal: 0.1477,
    net_benefit_pv: -15816246347.76,
    bcr_utility: 0.9924,
    omitted: {},
  },
  delay_comparison: SUNZIA_DELAY2_BLOCK,
};

function decodeText(html: string): string {
  return html.replace(/&#x27;/g, "'").replace(/&#39;/g, "'");
}

function render(
  perspective: PerspectiveKey,
  value: Record<string, unknown> = results,
): string {
  return decodeText(
    renderToStaticMarkup(
      createElement(ResultsOverview, {
        results: value,
        perspective,
        taxonomy: undefined,
      }),
    ),
  );
}

/** Remove the delay card root `<div>` from its opening tag through the matching close. */
function stripCard(html: string): string {
  const marker = html.indexOf('data-delay-card');
  if (marker === -1) return html;
  const open = html.lastIndexOf('<div', marker);
  if (open === -1) return html;
  let depth = 0;
  let i = open;
  while (i < html.length) {
    const nextOpen = html.indexOf('<div', i);
    const nextClose = html.indexOf('</div>', i);
    if (nextClose === -1) return html;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth += 1;
      i = nextOpen + 4;
    } else {
      depth -= 1;
      i = nextClose + '</div>'.length;
      if (depth === 0) return html.slice(0, open) + html.slice(i);
    }
  }
  return html;
}

describe('ResultsOverview delay card', () => {
  it('societal view shows the card; other views show the note (acceptance 5)', () => {
    expect(render('societal')).toContain('data-delay-card');
    for (const p of ['utility', 'ratepayer'] as const) {
      expect(render(p)).not.toContain('data-delay-card');
      expect(render(p)).toContain(DELAY_OTHER_VIEW_NOTE);
    }
  });
  it('the card changes nothing else on the page (acceptance 7)', () => {
    const withBlock = render('societal', results);
    const withoutBlock = render('societal', { ...results, delay_comparison: undefined });
    expect(stripCard(withBlock)).toBe(stripCard(withoutBlock));
  });
  it('utility cost row reads Direct delay cost', () => {
    expect(PERSPECTIVE_CATEGORIES.utility.costs.find((c) => c.key === 'delay')!.label).toBe(DIRECT_DELAY_LABEL);
  });
});

const NULL_BENEFITS: Record<string, unknown> = {
  summary: { total_benefits_pv: null, total_costs_pv: 4.8e9 },
  bcr: {
    bcr_societal: null,
    net_benefit_pv: null,
    bcr_ratepayer: null,
    net_benefit_ratepayer_pv: null,
    ratepayer_benefits_pv: null,
    ratepayer_costs_pv: 6.4e8,
    bcr_utility: 0.9854,
    benefits_enabling_pv: 0,
    benefits_remedial_pv: null,
    displacement_avoided_benefit_pv: null,
    omitted: {
      bcr_societal: ['avoided_emissions_benefit', 'congestion_benefit'],
      bcr_ratepayer: ['congestion_benefit'],
    },
  },
};

describe('ResultsOverview with no applicable benefit available (Spec 10)', () => {
  it('null societal ratio reads Not available with no Excludes note', () => {
    const html = render('societal', NULL_BENEFITS);
    expect(html).toContain('Not available');
    expect(html).not.toContain('0.000');
    expect(html).not.toContain('Excludes:');
  });
  it('null ratepayer ratio reads Not available with no Excludes note', () => {
    const html = render('ratepayer', NULL_BENEFITS);
    expect(html).not.toContain('0.000');
    expect(html).not.toContain('Excludes:');
  });
  it('stored results without a total key still render their ratio', () => {
    expect(render('societal')).toContain('0.148');
  });
  it('a null total stays null; an absent total sums its categories (review focus 1)', () => {
    const rows = [{ key: 'a', label: 'A', value: 5 }, { key: 'b', label: 'B', value: null }];
    expect(readTotal(NULL_BENEFITS, 'summary.total_benefits_pv', rows)).toBeNull();
    expect(readTotal({}, 'summary.total_benefits_pv', rows)).toBe(5);
    expect(readTotal(NULL_BENEFITS, 'summary.total_costs_pv', rows)).toBe(4.8e9);
  });
  it('an adjusted ratio with null benefits is null (review focus 2)', () => {
    expect(adjustedRatio(null, 4e9)).toBeNull();
    expect(adjustedRatio(1, 2)).toBe(0.5);
    expect(adjustedRatio(1, 0)).toBeNull();
  });
});

describe('waterfall with a null benefit total (final review I1)', () => {
  it('replaces the waterfall with a Not available line', () => {
    const html = render('societal', NULL_BENEFITS);
    expect(html).toContain(WATERFALL_NOT_AVAILABLE);
    expect(html).not.toContain('Total Benefits');
    expect(html).not.toContain('Net Benefit</text>');
  });
  it('still draws the waterfall for a stored result with numbers', () => {
    expect(render('societal')).not.toContain(WATERFALL_NOT_AVAILABLE);
  });
});

describe('readTotal with a non-number stored value (Spec 11 D3)', () => {
  it('falls back to the category sum; only null stays null', () => {
    const rows = [{ key: 'a', label: 'A', value: 5 }];
    expect(readTotal({ summary: { total_benefits_pv: 'x' } }, 'summary.total_benefits_pv', rows)).toBe(5);
    expect(readTotal({ summary: { total_benefits_pv: null } }, 'summary.total_benefits_pv', rows)).toBeNull();
  });
});

describe('single-item overview rows that do not apply (Spec 11, final review)', () => {
  const ctt = {
    bcr: { converter_loss_pv: 0, row_rent_pv: 0, conductor_loss_pv: 5 },
    taxonomy_results: [
      { taxonomy_id: 'line_loss_converter', state: 'does_not_apply', value_pv: 0, value_pv_wacc: 0 },
      { taxonomy_id: 'row_rent', state: 'does_not_apply', value_pv: 0, value_pv_wacc: 0 },
      { taxonomy_id: 'line_loss_conductor', state: 'measured', value_pv: 5, value_pv_wacc: 5 },
    ],
  };
  it('marks the row and shows Does not apply', () => {
    const rows = loadCategories(ctt, PERSPECTIVE_CATEGORIES.ratepayer.costs);
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(byKey.converter_loss!.doesNotApply).toBe(true);
    expect(byKey.row_rent!.doesNotApply).toBe(true);
    expect(byKey.conductor_loss!.doesNotApply).toBe(false);
    expect(categoryValueText(byKey.row_rent!)).toBe('Does not apply');
    expect(categoryValueText(byKey.conductor_loss!)).toBe('$5');
  });
  it('an old row without state keeps its value', () => {
    const old = { bcr: { row_rent_pv: 0 }, taxonomy_results: [{ taxonomy_id: 'row_rent', value_pv: 0, value_pv_wacc: 0 }] };
    const rows = loadCategories(old, PERSPECTIVE_CATEGORIES.ratepayer.costs);
    expect(rows.find((r) => r.key === 'row_rent')!.doesNotApply).toBe(false);
  });
});

const V5_SOCIETAL: Record<string, unknown> = {
  summary: { total_costs_pv: 500, total_benefits_pv: 100 },
  bcr: {
    bcr_societal: 0.2,
    net_benefit_pv: -400,
    capital_costs_pv: 999,
    benefits_remedial_pv: 40,
    benefits_enabling_pv: 60,
    omitted: {},
  },
  taxonomy_results: [
    { taxonomy_id: 'build_conductor', value_pv: 50 },
    { taxonomy_id: 'build_structure', value_pv: 20 },
    { taxonomy_id: 'build_converter', value_pv: 10 },
    { taxonomy_id: 'row_acquisition', value_pv: 30 },
    { taxonomy_id: 'env_mitigation', value_pv: 10 },
    { taxonomy_id: 'row_holding', value_pv: 7 },
    { taxonomy_id: 'base_delay', value_pv: 100 },
    { taxonomy_id: 'oandm', value_pv: 5 },
    { taxonomy_id: 'insurance', value_pv: 3 },
    { taxonomy_id: 'row_rent', value_pv: 2 },
    { taxonomy_id: 'line_loss_conductor', value_pv: 1 },
    { taxonomy_id: 'line_loss_converter', value_pv: 1 },
    { taxonomy_id: 'wildfire_eac', value_pv: 8 },
    { taxonomy_id: 'outage_eac', value_pv: 4 },
    { taxonomy_id: 'emissions_comp', value_pv: 6 },
    { taxonomy_id: 'congestion_benefit', value_pv: 20 },
    { taxonomy_id: 'delivered_energy_benefit', value_pv: 30 },
    { taxonomy_id: 'capacity_value_benefit', value_pv: 10 },
    { taxonomy_id: 'avoided_emissions_benefit', value_pv: 40 },
  ],
};

const EXTERNAL_TAXONOMY_ITEMS = [
  { id: 'wildfire_eac', label: 'Wildfire', category: 'external', subgroup: 'risk', side: 'cost', display_order: 1 },
  { id: 'outage_eac', label: 'Outage', category: 'external', subgroup: 'risk', side: 'cost', display_order: 2 },
  { id: 'emissions_comp', label: 'Emissions comp', category: 'external', subgroup: 'emissions', side: 'cost', display_order: 3 },
];

describe('reporting category overview (Task 5)', () => {
  it('societal view shows new labels and rebuilt capital, not legacy names', () => {
    const html = render('societal', V5_SOCIETAL);
  for (const label of [
      'Capital costs',
      'Delay-period costs',
      'Operating costs',
      'External costs',
      'Market benefits',
      'External benefits',
    ]) {
      expect(html).toContain(label);
    }
    expect(html).toContain('$120');
    for (const legacy of ['Hard Costs', 'Soft Costs', 'Remedial', 'Enabling']) {
      expect(html).not.toContain(legacy);
    }
  });

  it('utility cost rows sum to utility_costs_pv and include ROW Holding Cost', () => {
    const utility = {
      bcr: {
        utility_costs_pv: 515,
        capital_recovery_pv: 400,
        oandm_pv: 10,
        insurance_pv: 5,
        row_rent_pv: 20,
        delay_cost_pv: 30,
        holding_pv: 50,
      },
      taxonomy_results: [
        { taxonomy_id: 'capital_recovery', value_pv_wacc: 400 },
        { taxonomy_id: 'oandm', value_pv_wacc: 10 },
        { taxonomy_id: 'insurance', value_pv_wacc: 5 },
        { taxonomy_id: 'row_rent', value_pv_wacc: 20 },
        { taxonomy_id: 'base_delay', value_pv_wacc: 30 },
        { taxonomy_id: 'row_holding', value_pv_wacc: 50 },
      ],
    };
    const rows = loadCategories(utility, PERSPECTIVE_CATEGORIES.utility.costs);
    expect(rows.find((r) => r.key === 'holding')?.label).toBe('ROW Holding Cost');
    const sum = rows.reduce((total, row) => (row.value === null ? total : total + row.value), 0);
    expect(sum).toBe(515);
  });

  it('external accordion exposes Risk and Emissions subgroup headings', () => {
    const headings = externalAccordionSubgroupHeadings(
      EXTERNAL_TAXONOMY_ITEMS.map((item) => ({
        id: item.id,
        label: item.label,
        category: item.category,
        subgroup: item.subgroup,
        displayOrder: item.display_order,
      })),
    );
    expect(headings).toEqual(['Risk', 'Emissions']);
  });
});
