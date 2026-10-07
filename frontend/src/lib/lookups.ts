export interface ProjectFields {
  constructionType: string;
  acDc: string;
  capacityMw: number;
  conductorType: string;
  converterType?: string;
  oldAcDc?: string;
  oldCapacityMw?: number;
  oldConductorType?: string;
  oldConverterType?: string;
}

export interface LookupTables {
  buildCostLookup: Record<string, unknown>;
  rowWidthLookup: Record<string, number>;
  vegetationManagementLookup: Record<string, unknown>;
  structureDetailsLookup: Record<string, unknown>;
  converterDetailsLookup: Record<string, unknown>;
  circuitDetailsLookup: Record<string, unknown>;
  conductorOmLookup: Record<string, unknown>;
}

export interface CategoryKeyValidation {
  valid: boolean;
  reason?: string;
}

const CT_NORM: Record<string, string> = {
  'Underground Direct-Buried': 'Underground direct-buried',
  'Underground Tunnel': 'Underground tunnel',
};

function sectionTable(
  defaults: Record<string, unknown>,
  section: string,
  table: string,
): Record<string, unknown> {
  const sectionNode = defaults[section];
  if (
    sectionNode === null ||
    typeof sectionNode !== 'object' ||
    Array.isArray(sectionNode)
  ) {
    throw new TypeError(`defaults.${section} is not an object`);
  }
  const tableNode = (sectionNode as Record<string, unknown>)[table];
  if (
    tableNode === null ||
    typeof tableNode !== 'object' ||
    Array.isArray(tableNode)
  ) {
    throw new TypeError(`defaults.${section}.${table} is not an object`);
  }
  return tableNode as Record<string, unknown>;
}

/**
 * Extract the seven category lookup maps from a calculator defaults template.
 * Each table is nested one level under a numbered section key. Row widths are
 * unwrapped from `{ row_width_feet }` so callers receive a number.
 */
export function loadLookups(defaults: Record<string, unknown>): LookupTables {
  const buildCostLookup = sectionTable(
    defaults,
    '10_project_category_build_costs',
    'project_categories_build_costs',
  );

  const rowWidthDetails = sectionTable(
    defaults,
    '20_project_category_row_widths',
    'project_categories_row_widths',
  );
  const rowWidthLookup = Object.fromEntries(
    Object.entries(rowWidthDetails).map(([category, detail]) => [
      category,
      (detail as { row_width_feet: number }).row_width_feet,
    ]),
  ) as Record<string, number>;

  return {
    buildCostLookup,
    rowWidthLookup,
    vegetationManagementLookup: sectionTable(
      defaults,
      '12_project_om_vegetation_management',
      'vegetation_management_om_costs',
    ),
    structureDetailsLookup: sectionTable(
      defaults,
      '14_category_om_structures',
      'project_categories_om_structures',
    ),
    converterDetailsLookup: sectionTable(
      defaults,
      '15_category_om_converters',
      'converter_om_rate',
    ),
    circuitDetailsLookup: sectionTable(
      defaults,
      '21_project_category_circuit_and_resistance_detail',
      'project_categories_circuit_and_resistance_details',
    ),
    conductorOmLookup: sectionTable(
      defaults,
      '13_category_om_conductors',
      'project_categories_om_conductors',
    ),
  };
}

export function normalizeCT(ct: string): string {
  return CT_NORM[ct] || ct;
}

function capacityToken(capacityMw: number): string {
  return String(capacityMw).replace(/\s*MW\s*/i, '');
}

/** `{construction}/{AC|DC}/{n}MW/{conductor}/{converter}`. DC with no converter keeps an empty converter segment. */
export function buildCategoryKey(fields: ProjectFields): string | null {
  const ctRaw = fields.constructionType;
  const acDc = fields.acDc;
  const cap = fields.capacityMw;
  const cond = fields.conductorType;
  if (!ctRaw || !acDc || !cap || !cond) return null;
  const conv = acDc === 'DC' ? (fields.converterType ?? '') : 'NA';
  return `${normalizeCT(ctRaw)}/${acDc}/${capacityToken(cap)}MW/${cond}/${conv}`;
}

/** Same shape as `buildCategoryKey`, using the old-line fields. A missing DC converter becomes `NA`. */
export function buildOldCategoryKey(fields: ProjectFields): string | null {
  const ctRaw = fields.constructionType;
  const oldAcDc = fields.oldAcDc ?? '';
  const oldCap = fields.oldCapacityMw;
  const oldCond = fields.oldConductorType ?? '';
  if (!ctRaw || !oldAcDc || !oldCap || !oldCond) return null;
  const oldConv = oldAcDc === 'DC' ? fields.oldConverterType || 'NA' : 'NA';
  return `${normalizeCT(ctRaw)}/${oldAcDc}/${capacityToken(oldCap)}MW/${oldCond}/${oldConv}`;
}

function lookupEntry(
  table: Record<string, unknown>,
  key: string,
): unknown | null {
  return table[key] ?? null;
}

export function getBuildCostEntry(
  lookups: LookupTables,
  key: string,
): unknown | null {
  return lookupEntry(lookups.buildCostLookup, key);
}

/**
 * Circuit-and-resistance row for `key`. When the exact DC key is missing,
 * fall back to the same construction, capacity, and conductor with converter
 * `VSC Converter` (the legacy form lookup).
 */
export function getCircuitDetails(
  lookups: LookupTables,
  key: string,
): unknown | null {
  const entry = lookups.circuitDetailsLookup[key];
  if (entry) return entry;
  const parts = key.split('/');
  if (parts[1] === 'DC' && parts[0] && parts[2] && parts[3]) {
    const fallback = `${parts[0]}/DC/${parts[2]}/${parts[3]}/VSC Converter`;
    return lookups.circuitDetailsLookup[fallback] ?? null;
  }
  return null;
}

export function getRowWidthFeet(
  lookups: LookupTables,
  key: string,
): number | null {
  return lookups.rowWidthLookup[key] ?? null;
}

export function getVegetationManagement(
  lookups: LookupTables,
  key: string,
): unknown | null {
  return lookupEntry(lookups.vegetationManagementLookup, key);
}

export function getStructureDetails(
  lookups: LookupTables,
  key: string,
): unknown | null {
  return lookupEntry(lookups.structureDetailsLookup, key);
}

export function getConverterDetails(
  lookups: LookupTables,
  key: string,
): unknown | null {
  return lookupEntry(lookups.converterDetailsLookup, key);
}

export function getConductorOm(
  lookups: LookupTables,
  key: string,
): unknown | null {
  return lookupEntry(lookups.conductorOmLookup, key);
}

/**
 * Check `key` against the build-cost, circuit, and row-width maps. DC keys
 * are also checked against converter details. The AC/DC segment is the second
 * `/`-separated field of the category key.
 */
export function validateCategoryKey(
  key: string,
  lookups: LookupTables,
): CategoryKeyValidation {
  if (!key) return { valid: false, reason: 'Incomplete category fields' };

  const missing: string[] = [];
  if (!(key in lookups.buildCostLookup)) missing.push('build_costs');
  if (!(key in lookups.circuitDetailsLookup)) missing.push('circuit_details');
  if (!(key in lookups.rowWidthLookup)) missing.push('row_widths');

  const acDc = key.split('/')[1];
  if (acDc === 'DC' && !(key in lookups.converterDetailsLookup)) {
    missing.push('converter_details');
  }

  if (missing.length > 0) {
    return {
      valid: false,
      reason: `Configuration "${key}" not found in: ${missing.join(', ')}`,
    };
  }

  return { valid: true };
}
