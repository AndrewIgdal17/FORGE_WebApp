import { describe, expect, it } from 'vitest';

import { duplicateAction } from '@/lib/duplicate-action';

describe('duplicateAction', () => {
  it('returns offer_project_duplicate when the project is read-only, even with an empty id', () => {
    expect(duplicateAction(true, '')).toBe('offer_project_duplicate');
    expect(duplicateAction(true, 's1')).toBe('offer_project_duplicate');
  });

  it('returns duplicate_scenario when editable and an id is present', () => {
    expect(duplicateAction(false, 's1')).toBe('duplicate_scenario');
  });

  it('returns none when editable without an active scenario id', () => {
    expect(duplicateAction(false, '')).toBe('none');
  });
});