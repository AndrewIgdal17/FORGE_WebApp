import { describe, expect, it } from 'vitest';

import { resolvedRowWidthFt, rowWidthProblem } from './analyze-request';
import type { LookupTables, ProjectFields } from './lookups';

// Category rows in the shape of calculator v2.1.2
// `20_project_category_row_widths`: three construction types, no Subsea rows.
const ROW_WIDTHS: Record<string, number> = {
  'Overhead/AC/460MW/Standard Aluminum Conductor/NA': 100,
  'Overhead/AC/1792MW/Standard Aluminum Conductor/NA': 175,
  'Overhead/AC/1792MW/Advanced Aluminum Conductor/NA': 175,
  'Overhead/DC/2400MW/Standard Aluminum Conductor/LCC Converter': 215,
  'Overhead/DC/2400MW/Standard Aluminum Conductor/VSC Converter': 215,
  'Underground direct-buried/AC/460MW/Underground Copper Conductor/NA': 50,
  'Underground tunnel/DC/500MW/Underground Copper Conductor/VSC Converter': 40,
};

function lookups(): LookupTables {
  return {
    buildCostLookup: {},
    rowWidthLookup: { ...ROW_WIDTHS },
    vegetationManagementLookup: {},
    structureDetailsLookup: {},
    converterDetailsLookup: {},
    circuitDetailsLookup: {},
    conductorOmLookup: {},
  };
}

// Project fields as stored on the live TBC_Delay4 paper row (seeded 2026-10-10).
const LEGACY_SUBSEA: ProjectFields = {
  constructionType: 'Subsea',
  acDc: 'DC',
  capacityMw: 500,
  conductorType: 'Subsea Copper Conductor',
  converterType: 'VSC Converter',
};

// Project fields as stored on the live SunZia_Delay2 paper row.
const LEGACY_SUNZIA: ProjectFields = {
  constructionType: 'Overhead',
  acDc: 'DC',
  capacityMw: 2400,
  conductorType: 'Standard Aluminum Conductor',
  converterType: 'VSC Converter',
};

describe('legacy scenarios', () => {
  it('a legacy overhead scenario resolves a positive width and has no problem', () => {
    expect(resolvedRowWidthFt(LEGACY_SUNZIA, lookups())).toBe(215);
    expect(rowWidthProblem(LEGACY_SUNZIA, lookups())).toBeNull();
  });

  it('a legacy Subsea scenario names the construction type and the allowed choices', () => {
    expect(resolvedRowWidthFt(LEGACY_SUBSEA, lookups())).toBeNull();
    expect(rowWidthProblem(LEGACY_SUBSEA, lookups())).toBe(
      "Construction type 'Subsea' has no right-of-way width. Choose Overhead, " +
        'Underground Direct-Buried, or Underground Tunnel in Project Identity → ' +
        'Technology before drawing a route.',
    );
  });
});

describe('rowWidthProblem', () => {
  const base: ProjectFields = {
    constructionType: 'Overhead',
    acDc: 'AC',
    capacityMw: 460,
    conductorType: 'Standard Aluminum Conductor',
  };

  it('names every blank field', () => {
    expect(rowWidthProblem({ ...base, capacityMw: 0 }, lookups())).toBe(
      'Set Capacity (MW) in Project Identity → Technology before drawing a route.',
    );
    expect(
      rowWidthProblem({ ...base, constructionType: '', conductorType: '' }, lookups()),
    ).toBe(
      'Set Construction type and Conductor type in Project Identity → Technology ' +
        'before drawing a route.',
    );
  });

  it('names a capacity the construction type does not offer', () => {
    expect(rowWidthProblem({ ...base, capacityMw: 999 }, lookups())).toBe(
      "Capacity (MW) '999' has no right-of-way width for Overhead AC. Choose 460 " +
        'or 1792 in Project Identity → Technology before drawing a route.',
    );
  });

  it('names a conductor the construction type does not offer', () => {
    expect(
      rowWidthProblem(
        { ...base, constructionType: 'Underground Direct-Buried' },
        lookups(),
      ),
    ).toBe(
      "Conductor type 'Standard Aluminum Conductor' has no right-of-way width for " +
        'Underground Direct-Buried AC 460 MW. Choose Underground Copper Conductor in ' +
        'Project Identity → Technology before drawing a route.',
    );
  });

  it('names a DC converter that has no row', () => {
    expect(
      rowWidthProblem(
        {
          constructionType: 'Underground Tunnel',
          acDc: 'DC',
          capacityMw: 500,
          conductorType: 'Underground Copper Conductor',
          converterType: 'LCC Converter',
        },
        lookups(),
      ),
    ).toBe(
      "Converter type 'LCC Converter' has no right-of-way width for Underground " +
        'Tunnel DC 500 MW Underground Copper Conductor. Choose VSC Converter in ' +
        'Project Identity → Technology before drawing a route.',
    );
  });

  it('returns null when the width resolves', () => {
    expect(rowWidthProblem(base, lookups())).toBeNull();
  });
});
