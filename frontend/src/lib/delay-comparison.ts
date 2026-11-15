import { readNumber } from './results-utils';

export interface DelayComparisonView {
  baselineYears: number | null;
  delayYears: number | null;
  onTimeRun: boolean;
  cong: number | null;
  avoid: number | null;
  forgone: number | null;
  total: number | null;
  omittedForgone: string[];
  omittedTotal: string[];
  /** Rows whose forgone benefit does not apply (Spec 12); empty for stored blocks without states. */
  notApplying: Set<'cong' | 'avoid' | 'forgone' | 'total'>;
}

const STATE_KEYS = {
  cong: 'delay_cost_cong',
  avoid: 'delay_cost_avoid',
  forgone: 'delay_cost_forgone',
  total: 'delta_nb_delay',
} as const;

export const DELAY_CARD_TITLE = 'Cost of delay';

export const DELAY_ROWS: ReadonlyArray<{
  key: 'cong' | 'avoid' | 'forgone' | 'total';
  label: string;
  help: string;
}> = [
  {
    key: 'cong',
    label: 'Forgone congestion relief',
    help: 'Congestion relief the project would have delivered if built on time, minus what it delivers as delayed.',
  },
  {
    key: 'avoid',
    label: 'Forgone avoided emissions',
    help: 'The same for avoided emissions. A later operating life displaces generation on a cleaner grid.',
  },
  {
    key: 'forgone',
    label: 'Forgone benefits',
    help: 'The sum of the two.',
  },
  {
    key: 'total',
    label: 'Total cost of delay',
    help: 'Net benefit if built on time, minus net benefit as delayed. It adds the change in every cost: the direct delay cost, deferred construction spending and escalation. Negative means the delayed project has the higher net benefit, which happens when deferring costs outweighs the benefits lost.',
  },
];

export const DELAY_FOOTNOTE =
  "Reported beside the ratio, not inside it: the project's results already reflect its delay.";

export const DELAY_NOT_AVAILABLE = 'Cost of delay: Not available.';

export const DELAY_OTHER_VIEW_NOTE =
  "The cost of delay is measured from society's perspective. Switch to Societal to see it.";

export const DIRECT_DELAY_LABEL = 'Direct delay cost';

export const DIRECT_DELAY_HELP =
  'Permitting, legal work and administration during the delay years.';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function stringIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  for (const item of value) {
    if (typeof item === 'string') ids.push(item);
  }
  return ids;
}

export function readDelayComparison(
  results: Record<string, unknown> | null,
): DelayComparisonView | null {
  if (!results) return null;
  const block = results.delay_comparison;
  if (!isPlainObject(block)) return null;
  const omitted = isPlainObject(block.omitted) ? block.omitted : null;
  return {
    baselineYears: readNumber(block.baseline_delay_years),
    delayYears: readNumber(block.delay_years),
    onTimeRun: block.on_time_run === true,
    cong: readNumber(block.delay_cost_cong),
    avoid: readNumber(block.delay_cost_avoid),
    forgone: readNumber(block.delay_cost_forgone),
    total: readNumber(block.delta_nb_delay),
    omittedForgone: omitted ? stringIds(omitted.delay_cost_forgone) : [],
    omittedTotal: omitted ? stringIds(omitted.delta_nb_delay) : [],
    notApplying: new Set(
      (Object.keys(STATE_KEYS) as Array<keyof typeof STATE_KEYS>).filter(
        (key) => isPlainObject(block.states) && block.states[STATE_KEYS[key]] === 'does_not_apply',
      ),
    ),
  };
}

export function baselineSentence(view: DelayComparisonView): string {
  if (view.baselineYears === 0) {
    return `Compared with the same project built on time (this project: ${view.delayYears}-year delay).`;
  }
  return `Compared with the same project built with a ${view.baselineYears}-year delay (this project: ${view.delayYears} years).`;
}

export function equalBaselineSentence(view: DelayComparisonView): string {
  return `This project's delay equals the baseline (${view.baselineYears} years), so there is no cost of delay to report.`;
}
