import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { PerspectiveKey } from '@/components/results/perspective-toggle';
import { PERSPECTIVE_CATEGORIES, ResultsOverview } from '@/components/results/results-overview';
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
