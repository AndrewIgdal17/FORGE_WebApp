import { describe, expect, it } from 'vitest';

import { effectiveRowAgreement } from './row-agreement';

describe('effectiveRowAgreement', () => {
  it('defaults by project type when none is chosen', () => {
    expect(effectiveRowAgreement('', 'greenfield')).toBe('permanent_easement_new');
    expect(effectiveRowAgreement('', 'reconductoring')).toBe('lease_license_existing');
    expect(effectiveRowAgreement('', 'rebuild')).toBe('lease_license_existing');
  });

  it('keeps a chosen agreement', () => {
    expect(effectiveRowAgreement('federal_hybrid', 'rebuild')).toBe('federal_hybrid');
    expect(effectiveRowAgreement('permanent_easement_new', 'reconductoring')).toBe('permanent_easement_new');
  });
});
