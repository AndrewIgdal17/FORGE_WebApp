import { describe, expect, it } from 'vitest';

import { calculationStatusDisplay } from './workspace-header';

describe('calculationStatusDisplay', () => {
  it('shows a spinner while calculating', () => {
    expect(calculationStatusDisplay('Calculating...')).toEqual({ kind: 'spinner' });
  });

  it('hides a routine "Calculated in" status, keeping it as a tooltip', () => {
    expect(calculationStatusDisplay('Calculated in 1.2s')).toEqual({
      kind: 'none',
      title: 'Calculated in 1.2s',
    });
  });

  it('keeps anything else visible as text', () => {
    expect(calculationStatusDisplay('Not calculated')).toEqual({ kind: 'text', text: 'Not calculated' });
    expect(calculationStatusDisplay('A drawn route inside the lower 48 is required.')).toEqual({
      kind: 'text',
      text: 'A drawn route inside the lower 48 is required.',
    });
  });
});
