import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { TaxonomyCard } from '@/components/results/taxonomy-card';
import { cardValues } from '@/components/results/taxonomy-view';
import { buildResultById, deriveTaxonomyResults } from '@/lib/results-utils';
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
