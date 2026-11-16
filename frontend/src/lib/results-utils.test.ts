import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { TaxonomyCard } from '@/components/results/taxonomy-card';
import { cardValues } from '@/components/results/taxonomy-view';
import {
  BENEFIT_CATEGORY_LABELS,
  CATEGORY_LABELS,
  LEGACY_TAXONOMY_ITEMS,
  OPERATING_PART_LABELS,
  RESULT_CATEGORY,
  buildResultById,
  deriveTaxonomyResults,
  readCategoryTotal,
} from '@/lib/results-utils';
import { pvHeading, withLegacyItems, withRetiredItems } from '@/components/results/taxonomy-view';
import * as formatModule from '@/lib/format';
import * as resultsModule from '@/lib/results-utils';
import * as taxonomyModule from '@/components/results/taxonomy-view';

const BANNED = ['or' + 'Zero', 'or' + 'Null'];
const SOURCES = import.meta.glob('../**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function formatResultCurrency(value: number | null): string | undefined {
  const fn = (formatModule as { formatResultCurrency?: (value: number | null) => string })
    .formatResultCurrency
    ?? (resultsModule as { formatResultCurrency?: (value: number | null) => string })
      .formatResultCurrency;
  return fn?.(value);
}

function readNumber(value: unknown): number | null | undefined {
  const fn = (resultsModule as { readNumber?: (value: unknown) => number | null }).readNumber;
  return fn?.(value);
}

function excludesNote(ids: string[]): string | undefined {
  const fn = (resultsModule as { excludesNote?: (ids: string[]) => string }).excludesNote;
  return fn?.(ids);
}

function missingHover(paths: unknown): string {
  const values = cardValues(
    buildResultById({
      taxonomy_results: [
        {
          taxonomy_id: 'congestion_benefit',
          available: false,
          value_pv: null,
          missing_inputs: paths,
        },
      ],
    }),
    'congestion_benefit',
  );
  const hover = (values as { missingHover?: string }).missingHover;
  if (typeof hover === 'string') return hover;
  const fn = (taxonomyModule as { missingInputsHover?: (paths: unknown) => string })
    .missingInputsHover;
  return fn?.(paths) ?? '';
}

function congestion(value: number | null): { value_annual: unknown; value_pv: unknown } {
  const rows = deriveTaxonomyResults({
    benefits: {
      congestion: {
        congestion_benefit_annual: value,
        congestion_benefit_pv: value,
      },
    },
  });
  const row = rows.find(
    (entry) =>
      !!entry &&
      typeof entry === 'object' &&
      (entry as { taxonomy_id?: string }).taxonomy_id === 'congestion_benefit',
  );
  return row as { value_annual: unknown; value_pv: unknown };
}

function cardHtml(
  item: Record<string, unknown>,
  label: string,
): string {
  const values = cardValues(buildResultById({ taxonomy_results: [item] }), String(item.taxonomy_id));
  return renderToStaticMarkup(
    createElement(TaxonomyCard, {
      label,
      pvValue: values.pvValue ?? undefined,
      title: (values as { missingHover?: string }).missingHover,
    }),
  );
}

describe('result nulls', () => {
  it('test_acceptance_null_is_not_available_zero_is_zero', () => {
    const missing = congestion(null);
    const measured = congestion(0);
    expect(missing.value_annual).toBeNull();
    expect(missing.value_pv).toBeNull();
    expect(measured.value_annual).toBe(0);
    expect(measured.value_pv).toBe(0);

    expect(formatResultCurrency(null)).toBe('Not available');
    expect(formatResultCurrency(0)).toBe('$0');

    const delayMissing = {
      delay_comparison: { delay_cost_cong: null },
    };
    const delayZero = {
      delay_comparison: { delay_cost_cong: 0 },
    };
    expect(formatResultCurrency(readNumber(delayMissing.delay_comparison.delay_cost_cong) ?? null)).toBe(
      'Not available',
    );
    expect(formatResultCurrency(readNumber(delayZero.delay_comparison.delay_cost_cong) ?? null)).toBe('$0');
    expect(readNumber(delayZero.delay_comparison.delay_cost_cong)).toBe(0);
    expect(readNumber(delayMissing.delay_comparison.delay_cost_cong)).toBeNull();

    const hits: string[] = [];
    for (const [file, text] of Object.entries(SOURCES)) {
      for (const needle of BANNED) {
        if (text.includes(needle)) hits.push(`${file}: ${needle}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('test_acceptance_same_zone_shows_zero_congestion_relief', () => {
    const item = {
      taxonomy_id: 'congestion_benefit',
      available: true,
      value_pv: 0,
      missing_inputs: [],
    };
    const html = cardHtml(item, 'Congestion relief');
    expect(html).toContain('$0');
    expect(html).not.toContain('Not available');
    expect(formatResultCurrency(0)).toBe('$0');
  });

  it('test_acceptance_different_markets_spp_not_available', () => {
    const ids = [
      'avoided_emissions_benefit',
      'congestion_benefit',
      'emissions_comp',
      'line_loss_conductor',
    ];
    const labels: Record<string, string> = {
      avoided_emissions_benefit: 'Avoided emissions',
      congestion_benefit: 'Congestion relief',
      emissions_comp: 'Loss-compensation emissions',
      line_loss_conductor: 'Conductor losses',
    };
    const paths = [
      'technical_parameters.market_measurements.congestion_spread_per_mwh',
      'technical_parameters.market_measurements.hours_receiving_more_congested',
      'technical_parameters.market_measurements.hours_sending_more_congested',
      'technical_parameters.market_measurements.receiving_energy_value_per_mwh',
    ];
    for (const id of ['congestion_benefit', 'line_loss_conductor', 'emissions_comp', 'avoided_emissions_benefit']) {
      const html = cardHtml(
        {
          taxonomy_id: id,
          available: false,
          value_pv: null,
          missing_inputs: id === 'congestion_benefit' ? paths : [],
        },
        labels[id] ?? id,
      );
      expect(html).toContain('Not available');
      expect(html).not.toContain('$0');
    }
    const hover = missingHover(paths);
    expect(hover).toContain('Congestion spread (route): not measured');
    expect(hover).toContain('Hours receiving end is more congested (route): not measured');
    expect(hover).toContain('Hours sending end is more congested (route): not measured');
    expect(hover).toContain('Receiving-end energy value (route): not measured');

    const results = {
      bcr: {
        bcr_societal: 1.2,
        omitted: { bcr_societal: ids },
      },
    };
    expect(results.bcr.bcr_societal).toBe(1.2);
    expect(results.bcr.omitted.bcr_societal).toEqual(ids);
    expect(excludesNote(ids)).toBe(
      'Excludes: Avoided emissions, Congestion relief, Loss-compensation emissions, Conductor losses.',
    );
  });
});

describe('reporting categories (Spec 15)', () => {
  it('returns stored bcr.capital_costs_pv when delay_period_costs_pv is present, including null', () => {
    const results = {
      bcr: {
        delay_period_costs_pv: 0,
        capital_costs_pv: null,
      },
    };
    expect(readCategoryTotal(results, 'capital')).toBeNull();
    expect(readCategoryTotal({ bcr: { delay_period_costs_pv: 1, capital_costs_pv: 42 } }, 'capital')).toBe(42);
  });

  it('rebuilds capital and delay_period from taxonomy on v5-shaped stored results', () => {
    const results = {
      bcr: { capital_costs_pv: 999 },
      taxonomy_results: [
        { taxonomy_id: 'build_conductor', value_pv: 50 },
        { taxonomy_id: 'build_structure', value_pv: 20 },
        { taxonomy_id: 'build_converter', value_pv: 10 },
        { taxonomy_id: 'row_acquisition', value_pv: 30 },
        { taxonomy_id: 'env_mitigation', value_pv: 10 },
        { taxonomy_id: 'row_holding', value_pv: 7 },
        { taxonomy_id: 'base_delay', value_pv: 100 },
      ],
    };
    expect(readCategoryTotal(results, 'capital')).toBe(120);
    expect(readCategoryTotal(results, 'delay_period')).toBe(107);
  });

  it('uses legacy market keys when item sum is incomplete; capital has no fallback', () => {
    const marketResults = {
      bcr: { benefits_remedial_pv: 5, benefits_enabling_pv: 6 },
      taxonomy_results: [
        { taxonomy_id: 'delivered_energy_benefit', state: 'does_not_apply', value_pv: 0 },
        { taxonomy_id: 'capacity_value_benefit', state: 'does_not_apply', value_pv: 0 },
      ],
    };
    expect(readCategoryTotal(marketResults, 'market')).toBe(11);

    const capitalResults = {
      bcr: { capital_costs_pv: 999 },
      taxonomy_results: [
        { taxonomy_id: 'build_structure', value_pv: 20 },
        { taxonomy_id: 'build_converter', value_pv: 10 },
        { taxonomy_id: 'row_acquisition', value_pv: 30 },
        { taxonomy_id: 'env_mitigation', value_pv: 10 },
      ],
    };
    expect(readCategoryTotal(capitalResults, 'capital')).toBeNull();
  });

  it('skips does_not_apply rows and returns null when every applying row is unavailable', () => {
    const skipped = {
      taxonomy_results: [
        { taxonomy_id: 'build_conductor', state: 'does_not_apply', value_pv: 99 },
        { taxonomy_id: 'build_structure', value_pv: 21 },
        { taxonomy_id: 'build_converter', value_pv: 0 },
        { taxonomy_id: 'row_acquisition', value_pv: 0 },
        { taxonomy_id: 'env_mitigation', value_pv: 0 },
      ],
    };
    expect(readCategoryTotal(skipped, 'capital')).toBe(21);

    const unavailable = {
      taxonomy_results: [
        { taxonomy_id: 'build_conductor', state: 'not_available', available: false, value_pv: null },
        { taxonomy_id: 'build_structure', state: 'not_available', available: false, value_pv: null },
        { taxonomy_id: 'build_converter', state: 'not_available', available: false, value_pv: null },
        { taxonomy_id: 'row_acquisition', state: 'not_available', available: false, value_pv: null },
        { taxonomy_id: 'env_mitigation', state: 'not_available', available: false, value_pv: null },
      ],
    };
    expect(readCategoryTotal(unavailable, 'capital')).toBeNull();
  });

  it('exposes exact category labels and RESULT_CATEGORY metadata', () => {
    expect(CATEGORY_LABELS.capital).toBe('Capital costs');
    expect(CATEGORY_LABELS.delay_period).toBe('Delay-period costs');
    expect(CATEGORY_LABELS.operating).toBe('Operating costs');
    expect(CATEGORY_LABELS.external).toBe('External costs');
    expect(CATEGORY_LABELS.risk).toBe('Risk');
    expect(CATEGORY_LABELS.emissions).toBe('Emissions');
    expect(BENEFIT_CATEGORY_LABELS.market).toBe('Market benefits');
    expect(BENEFIT_CATEGORY_LABELS.external).toBe('External benefits');
    expect(Object.keys(RESULT_CATEGORY)).toHaveLength(25);
    expect(RESULT_CATEGORY.outage_load_shed).toEqual({
      side: 'cost',
      category: 'external',
      subgroup: 'risk',
    });
    expect(RESULT_CATEGORY.outage_redispatch).toEqual({
      side: 'cost',
      category: 'external',
      subgroup: 'risk',
    });
    expect(RESULT_CATEGORY.row_holding.category).toBe('delay_period');
    expect(pvHeading('market', 'Benefits')).toContain('Market benefits');
  });
});

describe('operating part ids (Task 7)', () => {
  const operatingMeta = { side: 'cost' as const, category: 'operating' as const, subgroup: null };

  it('maps the four part ids and legacy oandm and insurance to operating', () => {
    for (const id of [
      'oandm_line',
      'oandm_converter',
      'insurance_line',
      'insurance_converter',
      'oandm',
      'insurance',
    ]) {
      expect(RESULT_CATEGORY[id]).toEqual(operatingMeta);
    }
    expect(OPERATING_PART_LABELS).toEqual({
      oandm_line: 'Line O&M',
      oandm_converter: 'Converter O&M',
      insurance_line: 'Line insurance',
      insurance_converter: 'Converter insurance',
    });
    expect(LEGACY_TAXONOMY_ITEMS).toEqual([
      { id: 'oandm', label: 'O&M', category: 'operating', subgroup: null, displayOrder: 1 },
      { id: 'insurance', label: 'Insurance', category: 'operating', subgroup: null, displayOrder: 2 },
    ]);
  });

  it('sums four new operating rows and legacy oandm plus insurance rows', () => {
    const fourParts = {
      taxonomy_results: [
        { taxonomy_id: 'oandm_line', value_pv: 10 },
        { taxonomy_id: 'oandm_converter', value_pv: 20 },
        { taxonomy_id: 'insurance_line', value_pv: 3 },
        { taxonomy_id: 'insurance_converter', value_pv: 7 },
        { taxonomy_id: 'oandm', state: 'does_not_apply', value_pv: null },
        { taxonomy_id: 'insurance', state: 'does_not_apply', value_pv: null },
        { taxonomy_id: 'row_rent', state: 'does_not_apply', value_pv: null },
        { taxonomy_id: 'line_loss_conductor', state: 'does_not_apply', value_pv: null },
        { taxonomy_id: 'line_loss_converter', state: 'does_not_apply', value_pv: null },
      ],
    };
    expect(readCategoryTotal(fourParts, 'operating')).toBe(40);

    const legacy = {
      taxonomy_results: [
        { taxonomy_id: 'oandm', value_pv: 5 },
        { taxonomy_id: 'insurance', value_pv: 3 },
        { taxonomy_id: 'row_rent', state: 'does_not_apply', value_pv: null },
        { taxonomy_id: 'oandm_line', state: 'does_not_apply', value_pv: null },
        { taxonomy_id: 'oandm_converter', state: 'does_not_apply', value_pv: null },
        { taxonomy_id: 'insurance_line', state: 'does_not_apply', value_pv: null },
        { taxonomy_id: 'insurance_converter', state: 'does_not_apply', value_pv: null },
        { taxonomy_id: 'line_loss_conductor', state: 'does_not_apply', value_pv: null },
        { taxonomy_id: 'line_loss_converter', state: 'does_not_apply', value_pv: null },
      ],
    };
    expect(readCategoryTotal(legacy, 'operating')).toBe(8);
  });

  it('withLegacyItems adds legacy O&M when results carry oandm but taxonomy does not', () => {
    const items = withLegacyItems([], buildResultById({ taxonomy_results: [{ taxonomy_id: 'oandm', value_pv: 1 }] }));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 'oandm', label: 'O&M', category: 'operating' });

    expect(withLegacyItems([], buildResultById({ taxonomy_results: [] }))).toHaveLength(0);
  });
});

describe('outage split and retired rows (Spec 18 Task 6)', () => {
  it('excludesNote labels outage redispatch', () => {
    expect(excludesNote(['outage_redispatch'])).toBe('Excludes: Outage redispatch.');
  });

  it('deriveTaxonomyResults emits two outage parts when pv_load_shed is present', () => {
    const rows = deriveTaxonomyResults({
      costs: { outage: { pv_load_shed: 3, pv_redispatch: 7, pv_cost: 10 } },
    });
    const ids = rows.map((r) => (r as { taxonomy_id: string }).taxonomy_id);
    expect(ids).toContain('outage_load_shed');
    expect(ids).toContain('outage_redispatch');
    expect(ids).not.toContain('outage_eac');
  });

  it('deriveTaxonomyResults keeps outage_eac when split keys are absent', () => {
    const rows = deriveTaxonomyResults({
      costs: { outage: { pv_cost: 4 } },
    });
    const ids = rows.map((r) => (r as { taxonomy_id: string }).taxonomy_id);
    expect(ids).toContain('outage_eac');
    expect(ids).not.toContain('outage_load_shed');
  });

  it('readCategoryTotal sums split outage rows on external_risk', () => {
    const results = {
      taxonomy_results: [
        { taxonomy_id: 'wildfire_eac', value_pv: 1 },
        { taxonomy_id: 'outage_load_shed', value_pv: 3 },
        { taxonomy_id: 'outage_redispatch', value_pv: 2 },
        { taxonomy_id: 'outage_eac', state: 'does_not_apply', value_pv: null },
      ],
    };
    expect(readCategoryTotal(results, 'external_risk')).toBe(6);
  });

  it('withRetiredItems adds stored outage_eac when taxonomy omits it', () => {
    const resultById = buildResultById({
      taxonomy_results: [{ taxonomy_id: 'outage_eac', value_pv: 7 }],
    });
    const items = withRetiredItems([], resultById);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'outage_eac',
      label: 'Expected outage cost',
      category: 'external',
      subgroup: 'risk',
    });
    expect(
      readCategoryTotal(
        {
          taxonomy_results: [
            { taxonomy_id: 'wildfire_eac', state: 'does_not_apply', value_pv: null },
            { taxonomy_id: 'outage_load_shed', state: 'does_not_apply', value_pv: null },
            { taxonomy_id: 'outage_redispatch', state: 'does_not_apply', value_pv: null },
            { taxonomy_id: 'outage_eac', value_pv: 7 },
          ],
        },
        'external_risk',
      ),
    ).toBe(7);
  });
});
