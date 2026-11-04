import { describe, expect, it } from 'vitest';
import type { MultiLineString } from 'geojson';

import {
  analyzeRequestBody,
  changesAfterAnalyze,
  resolvedRowWidthFt,
  submittedTerrainMiles,
  terrainMatchesRouteLength,
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

  it('does not write a subsea mile', () => {
    const changes = {
      '02_project_physical_details.terrain.terrain_miles.forested': 80,
      '02_project_physical_details.terrain.terrain_miles.wetland': 20,
    };
    expect(changesAfterAnalyze(changes)).toEqual(changes);
    expect(JSON.stringify(changesAfterAnalyze(changes))).not.toContain('subsea');
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
    expect(submittedTerrainMiles(prior, changesAfterAnalyze(changes))).toBeCloseTo(100);
  });

  it('keeps sub-hundredth miles and matches the route length within 1e-6', () => {
    const forested = 10.123456789;
    const wetland = 2.00000007;
    const routeLength = forested + wetland;
    const prior = {
      forested: 1.01,
      wetland: 1.01,
      scrubbed_flat: 1.01,
      urban: 1.01,
      farmland: 1.01,
      desert_barren: 1.01,
      mountain: 1.01,
      rolling_hills: 1.01,
    };
    const changes: Record<string, number> = {};
    for (const [key, miles] of Object.entries({
      forested,
      wetland,
      scrubbed_flat: 0,
      urban: 0,
      farmland: 0,
      desert_barren: 0,
      mountain: 0,
      rolling_hills: 0,
    })) {
      changes[`02_project_physical_details.terrain.terrain_miles.${key}`] = miles;
    }
    const submitted = submittedTerrainMiles(prior, changesAfterAnalyze(changes));
    expect(submitted).toBe(routeLength);
    expect(submitted).not.toBe(Math.round(routeLength * 100) / 100);
    expect(terrainMatchesRouteLength(routeLength + 1e-7, routeLength)).toBe(true);
    expect(terrainMatchesRouteLength(routeLength - 1e-7, routeLength)).toBe(true);
    expect(terrainMatchesRouteLength(routeLength + 1e-6 + 1e-7, routeLength)).toBe(false);
    expect(terrainMatchesRouteLength(routeLength - 2e-6, routeLength)).toBe(false);
  });
});
