import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(), auth: { getSession: vi.fn() } },
}));

import { DelayComparisonCard } from '@/components/results/delay-comparison';
import { DELAY_ROWS } from '@/lib/delay-comparison';
import { CTT_ACTUAL_DELAY2_BLOCK, SUNZIA_DELAY2_BLOCK } from '@/lib/delay-comparison.fixtures';

function render(results: Record<string, unknown>): string {
  return renderToStaticMarkup(createElement(DelayComparisonCard, { results }));
}

function count(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

describe('DelayComparisonCard', () => {
  it('SunZia_Delay2: not available rows and a partial total, with no excludes or footnote (the headline names them)', () => {
    const html = render({ delay_comparison: SUNZIA_DELAY2_BLOCK });
    expect(html).toContain('Cost of delay');
    expect(html).toContain('Compared with the same project built on time (this project: 2-year delay).');
    expect(count(html, 'Not available')).toBe(3);
    expect(html).toContain('-$541,002,928');
    expect(html).not.toContain('Excludes');
    expect(html).not.toContain('Reported beside the ratio');
  });
  it('CTT v4 block: values, measured zero, no excludes (acceptance 2)', () => {
    const html = render({ delay_comparison: CTT_ACTUAL_DELAY2_BLOCK });
    expect(count(html, '$9,218,180')).toBe(2);
    expect(html).toContain('>$0<');
    expect(html).toContain('-$247,125,646');
    expect(html).not.toContain('Excludes');
  });
  it('no block: single not-available line (acceptance 3)', () => {
    expect(render({})).toContain('Cost of delay: Not available.');
    expect(render({})).not.toContain('Forgone');
  });
  it('delay equals baseline: sentence replaces the rows (acceptance 4)', () => {
    const html = render({ delay_comparison: { ...CTT_ACTUAL_DELAY2_BLOCK, delay_years: 0, on_time_run: false, delay_cost_cong: 0, delay_cost_avoid: 0, delay_cost_forgone: 0, delta_nb_delay: 0 } });
    // React 19 escapes the apostrophe, so assert the sentence in pieces.
    for (const part of "This project's delay equals the baseline (0 years), so there is no cost of delay to report.".split("'")) {
      expect(html).toContain(part);
    }
    expect(html).not.toContain('Forgone congestion relief');
  });
  it('every null field renders Not available, never $0 (acceptance 6)', () => {
    const html = render({ delay_comparison: { ...CTT_ACTUAL_DELAY2_BLOCK, delay_cost_cong: null, delay_cost_avoid: null, delay_cost_forgone: null, delta_nb_delay: null } });
    expect(count(html, 'Not available')).toBe(4);
    expect(html).not.toContain('$0');
  });
  it('partial forgone: number without an excludes note (review focus 2)', () => {
    const html = render({ delay_comparison: { ...SUNZIA_DELAY2_BLOCK, delay_cost_avoid: 1000, delay_cost_forgone: 1000 } });
    expect(html).toContain('$1,000');
    expect(html).not.toContain('Excludes');
  });
  it('empty omitted lists: no excludes note (review focus 3)', () => {
    const html = render({ delay_comparison: { ...CTT_ACTUAL_DELAY2_BLOCK, omitted: { delay_cost_forgone: [], delta_nb_delay: [] } } });
    expect(html).not.toContain('Excludes');
  });
  it('baseline above zero names both delays (review focus 1)', () => {
    const html = render({ delay_comparison: { ...CTT_ACTUAL_DELAY2_BLOCK, baseline_delay_years: 3, delay_years: 7 } });
    expect(html).toContain('built with a 3-year delay (this project: 7 years).');
  });
  it('rows carry their help text as a title', () => {
    for (const row of DELAY_ROWS) expect(render({ delay_comparison: CTT_ACTUAL_DELAY2_BLOCK })).toContain(row.help.replace(/'/g, '&#x27;'));
  });
});

describe('forgone benefit states (Spec 12 item 1)', () => {
  it('a forgone benefit that does not apply reads Does not apply', () => {
    const block = {
      ...CTT_ACTUAL_DELAY2_BLOCK,
      delay_cost_cong: null,
      delay_cost_avoid: 1000,
      delay_cost_forgone: 1000,
      states: { delay_cost_cong: 'does_not_apply', delay_cost_avoid: 'measured', delay_cost_forgone: 'measured', delta_nb_delay: 'measured' },
    };
    const html = render({ delay_comparison: block });
    expect(html).toContain('Does not apply');
    expect(count(html, 'Not available')).toBe(0);
  });
  it('a block without states renders as today', () => {
    expect(render({ delay_comparison: CTT_ACTUAL_DELAY2_BLOCK })).not.toContain('Does not apply');
  });
});
