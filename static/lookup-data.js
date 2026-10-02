// FORGE Lookup Data Tables
// Extracted from index.html — loaded via <script src="/static/lookup-data.js">

(function() {
'use strict';
const C = window.FORGE;

// Lookup caches on FORGE namespace so index.html input-renderers can access them
C.rowWidthLookup = null;
C.buildCostLookup = null;
C.circuitDetailsLookup = null;
C.structureDetailsLookup = null;
C.converterDetailsLookup = null;
C.conductorOmLookup = null;
C.vegetationManagementLookup = null;

// loadLookups(defaults) populates the lookup caches above from the calculator's
// defaults template (the `defaults` half of GET /api/defaults). No network
// fetch is needed — the caller already has the full defaults object.
//
// Each calculator table is nested one level under a numbered section key, so
// the category-keyed map lives at `defaults[section][tableKey]`, not at
// `defaults[section]` directly (verified against `forge.get_defaults_template()`).
// `20_project_category_row_widths` is the one exception: its per-category
// value is a detail object (`{..., row_width_feet}`), not a bare number, so it
// is unwrapped here to keep `getRowWidthFeet()` returning a number as before.
function loadLookups(defaults) {
  C.buildCostLookup = defaults["10_project_category_build_costs"]["project_categories_build_costs"];

  const rowWidthDetails = defaults["20_project_category_row_widths"]["project_categories_row_widths"];
  C.rowWidthLookup = Object.fromEntries(
    Object.entries(rowWidthDetails).map(([category, detail]) => [category, detail.row_width_feet])
  );

  C.vegetationManagementLookup = defaults["12_project_om_vegetation_management"]["vegetation_management_om_costs"];
  C.structureDetailsLookup = defaults["14_category_om_structures"]["project_categories_om_structures"];
  C.converterDetailsLookup = defaults["15_category_om_converters"]["converter_om_rate"];
  C.circuitDetailsLookup = defaults["21_project_category_circuit_and_resistance_detail"]["project_categories_circuit_and_resistance_details"];
  C.conductorOmLookup = defaults["13_category_om_conductors"]["project_categories_om_conductors"];
}

function normalizeCT(ct) {
  const ctNorm = {'Underground Direct-Buried':'Underground direct-buried','Underground Tunnel':'Underground tunnel'};
  return ctNorm[ct] || ct;
}

function buildCategoryString() {
  const get = path => {
    const el = document.querySelector(`[data-path="${path}"]`);
    return el ? el.value : '';
  };
  let ct = get('01_project_technical_details.project.construction_type');
  const acDc = get('01_project_technical_details.project.ac_dc');
  const cap = get('01_project_technical_details.project.capacity_mw');
  const cond = get('01_project_technical_details.project.conductor_type');
  const conv = acDc === 'DC'
    ? get('01_project_technical_details.project.converter_type')
    : 'NA';
  if (!ct || !acDc || !cap || !cond) return null;
  ct = normalizeCT(ct);
  const capNum = String(cap).replace(/\s*MW\s*/i, '');
  return `${ct}/${acDc}/${capNum}MW/${cond}/${conv}`;
}

function getRowWidthFeet() {
  if (!C.rowWidthLookup) return null;
  const cat = buildCategoryString();
  return cat ? (C.rowWidthLookup[cat] ?? null) : null;
}

function validateCategoryString() {
  const cat = buildCategoryString();
  if (!cat) return { valid: false, reason: 'Incomplete category fields' };

  const missing = [];
  if (C.buildCostLookup && !(cat in C.buildCostLookup)) missing.push('build_costs');
  if (C.circuitDetailsLookup && !(cat in C.circuitDetailsLookup)) missing.push('circuit_details');
  if (C.rowWidthLookup && !(cat in C.rowWidthLookup)) missing.push('row_widths');

  const acDc = document.querySelector('[data-path="01_project_technical_details.project.ac_dc"]')?.value;
  if (acDc === 'DC' && C.converterDetailsLookup && !(cat in C.converterDetailsLookup)) {
    missing.push('converter_details');
  }

  if (missing.length > 0) {
    return { valid: false, reason: `Configuration "${cat}" not found in: ${missing.join(', ')}` };
  }

  if (isReconductoring()) {
    const oldCat = buildOldCategoryString();
    if (oldCat) {
      const oldMissing = [];
      if (C.buildCostLookup && !(oldCat in C.buildCostLookup)) oldMissing.push('build_costs');
      if (C.circuitDetailsLookup && !(oldCat in C.circuitDetailsLookup)) oldMissing.push('circuit_details');
      if (oldMissing.length > 0) {
        return { valid: false, reason: `Old-line configuration "${oldCat}" not found in: ${oldMissing.join(', ')}` };
      }
    }
  }

  return { valid: true, key: cat };
}

function getBuildCostEntry() {
  if (!C.buildCostLookup) return null;
  const cat = buildCategoryString();
  return cat ? (C.buildCostLookup[cat] ?? null) : null;
}

function getCircuitDetailsEntry() {
  if (!C.circuitDetailsLookup) return null;
  const cat = buildCategoryString();
  const entry = cat ? C.circuitDetailsLookup[cat] : null;
  if (entry) return entry;
  const get = path => document.querySelector(`[data-path="${path}"]`)?.value || '';
  const acDc = get('01_project_technical_details.project.ac_dc');
  if (acDc === 'DC') {
    let ct = get('01_project_technical_details.project.construction_type');
    const ctNorm = {'Underground Direct-Buried':'Underground direct-buried','Underground Tunnel':'Underground tunnel'};
    ct = ctNorm[ct] || ct;
    const cap = String(get('01_project_technical_details.project.capacity_mw')).replace(/\s*MW\s*/i, '');
    const cond = get('01_project_technical_details.project.conductor_type');
    if (ct && cap && cond) {
      return C.circuitDetailsLookup[`${ct}/${acDc}/${cap}MW/${cond}/VSC Converter`] ?? null;
    }
  }
  return null;
}

function getOldCircuitDetailsEntry() {
  if (!C.circuitDetailsLookup) return null;
  const oldCat = buildOldCategoryString();
  return oldCat ? (C.circuitDetailsLookup[oldCat] ?? null) : null;
}

function buildOldCategoryString() {
  const get = path => {
    const el = document.querySelector(`[data-path="${path}"]`);
    return el ? el.value : '';
  };
  let ct = get('01_project_technical_details.project.construction_type');
  const oldAcDc = get('01_project_technical_details.project.old_ac_dc');
  const oldCap = get('01_project_technical_details.project.old_capacity_mw');
  const oldCond = get('01_project_technical_details.project.old_conductor_type');
  if (!ct || !oldAcDc || !oldCap || !oldCond) return null;
  ct = normalizeCT(ct);
  const capNum = String(oldCap).replace(/\s*MW\s*/i, '');
  const oldConv = oldAcDc === 'DC'
    ? (document.querySelector('[data-path="01_project_technical_details.project.old_converter_type"]')?.value || 'NA')
    : 'NA';
  return `${ct}/${oldAcDc}/${capNum}MW/${oldCond}/${oldConv}`;
}



  // Public API
  window.loadLookups = loadLookups;
  window.normalizeCT = normalizeCT;
  window.buildCategoryString = buildCategoryString;
  window.getRowWidthFeet = getRowWidthFeet;
  window.validateCategoryString = validateCategoryString;
  window.getBuildCostEntry = getBuildCostEntry;
  window.getCircuitDetailsEntry = getCircuitDetailsEntry;
  window.getOldCircuitDetailsEntry = getOldCircuitDetailsEntry;
  window.buildOldCategoryString = buildOldCategoryString;
})();
