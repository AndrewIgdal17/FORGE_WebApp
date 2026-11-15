import type { ReactElement } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  DELAY_CARD_TITLE,
  DELAY_FOOTNOTE,
  DELAY_NOT_AVAILABLE,
  DELAY_ROWS,
  baselineSentence,
  equalBaselineSentence,
  readDelayComparison,
  type DelayComparisonView,
} from '@/lib/delay-comparison';
import { formatResultCurrency } from '@/lib/format';
import { excludesNote } from '@/lib/results-utils';

const NOTE_CLASS = 'text-sm italic text-slate-600';

function rowExcludes(
  view: DelayComparisonView,
  key: (typeof DELAY_ROWS)[number]['key'],
): string | null {
  if (key === 'forgone' && view.omittedForgone.length > 0 && view.forgone !== null) {
    return excludesNote(view.omittedForgone);
  }
  if (key === 'total' && view.omittedTotal.length > 0 && view.total !== null) {
    return excludesNote(view.omittedTotal);
  }
  return null;
}

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
            {DELAY_ROWS.map((row) => {
              const note = rowExcludes(view, row.key);
              return (
                <div key={row.key}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span
                      className="min-w-0 flex-1 text-sm font-semibold"
                      title={row.help}
                    >
                      {row.label}
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {formatResultCurrency(view[row.key])}
                    </span>
                  </div>
                  {note ? <p className={NOTE_CLASS}>{note}</p> : null}
                </div>
              );
            })}
          </div>
        )}
        <p className={NOTE_CLASS}>{DELAY_FOOTNOTE}</p>
      </CardContent>
    </Card>
  );
}
