import { describe, expect, it } from 'vitest';
import type { MultiLineString } from 'geojson';

import {
  analyzeRequestBody,
  changesAfterAnalyze,
  resolvedRowWidthFt,
  submittedTerrainMiles,
} from './analyze-request';
import type { LookupTables, ProjectFields } from './lookups';

const route: MultiLineString = {
  type: 'MultiLineString',
  coordinates: [[[-97.74, 30.27], [-96.8, 32.78]]],
};

const fields: ProjectFields = {
  constructionType: 'Overhead',
  acDc: 'AC',
  capacityMw: 460,
  conductorType: 'Standard Aluminum Conductor',
};

function lookups(): LookupTables {
  return {
    buildCostLookup: {},
    rowWidthLookup: {
      'Overhead/AC/460MW/Standard Aluminum Conductor/NA': 100,
    },
    vegetationManagementLookup: {},
    structureDetailsLookup: {},
    converterDetailsLookup: {},
    circuitDetailsLookup: {},
    conductorOmLookup: {},
  };
}

describe('analyze request', () => {
  it('sends the category width in feet', () => {
    expect(resolvedRowWidthFt(fields, lookups())).toBe(100);
    expect(analyzeRequestBody(route, 100)).toEqual({ route, row_width_ft: 100 });
  });

  it('refuses a missing category and a non-positive width', () => {
    expect(resolvedRowWidthFt({ ...fields, constructionType: '' }, lookups())).toBeNull();
    expect(() => analyzeRequestBody(route, 0)).toThrow(/positive/);
  });

  it('submitted terrain miles equal the analyzed route length', () => {
    const prior = {
      forested: 40,
      wetland: 0,
      scrubbed_flat: 0,
      urban: 0,
      farmland: 0,
      desert_barren: 0,
      mountain: 0,
      rolling_hills: 0,
      subsea: 12,
    };
    const changes: Record<string, number> = {};
    for (const [key, miles] of Object.entries({
      forested: 80,
      wetland: 20,
      scrubbed_flat: 0,
      urban: 0,
      farmland: 0,
      desert_barren: 0,
      mountain: 0,
      rolling_hills: 0,
    })) {
      changes[`02_project_physical_details.terrain.terrain_miles.${key}`] = miles;
    }
    const applied = changesAfterAnalyze(changes);
    expect(submittedTerrainMiles(prior, applied)).toBeCloseTo(100);
  });
});
