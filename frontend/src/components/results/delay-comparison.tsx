import type { ReactElement } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  DELAY_CARD_TITLE,
  DELAY_NOT_AVAILABLE,
  DELAY_ROWS,
  baselineSentence,
  equalBaselineSentence,
  readDelayComparison,
} from '@/lib/delay-comparison';
import { formatResultCurrency } from '@/lib/format';
import { DOES_NOT_APPLY } from '@/lib/results-utils';

export function DelayComparisonCard({
  results,
}: {
  results: Record<string, unknown>;
}): ReactElement {
  const view = readDelayComparison(results);
  if (view === null) {
    return (
      <Card data-delay-card="">
        <CardContent>{DELAY_NOT_AVAILABLE}</CardContent>
      </Card>
    );
  }

  return (
    <Card data-delay-card="">
      <CardContent className="space-y-3">
        <h2 className="text-sm font-semibold">{DELAY_CARD_TITLE}</h2>
        <p className="text-sm text-slate-600">{baselineSentence(view)}</p>
        {view.onTimeRun === false ? (
          <p className="text-sm text-slate-600">{equalBaselineSentence(view)}</p>
        ) : (
          <div className="space-y-2">
            {DELAY_ROWS.map((row) => (
                <div key={row.key}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span
                      className="min-w-0 flex-1 text-sm font-semibold"
                      title={row.help}
                    >
                      {row.label}
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {view.notApplying.has(row.key)
                        ? DOES_NOT_APPLY
                        : formatResultCurrency(view[row.key])}
                    </span>
                  </div>
                </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
