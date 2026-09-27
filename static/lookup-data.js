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

async function fetchRowWidths(baseUrl) {
  if (C.rowWidthLookup) return C.rowWidthLookup;
  const resp = await fetch(new URL("/static/row_widths.json", baseUrl).toString());
  if (!resp.ok) throw new Error("Failed to load row_widths.json: " + resp.status);
  C.rowWidthLookup = await resp.json();
  return C.rowWidthLookup;
}

async function fetchBuildCosts(baseUrl) {
  if (C.buildCostLookup) return C.buildCostLookup;
  const resp = await fetch(new URL("/static/build_costs.json", baseUrl).toString());
  if (!resp.ok) throw new Error("Failed to load build_costs.json: " + resp.status);
  C.buildCostLookup = await resp.json();
  return C.buildCostLookup;
}

async function fetchCircuitDetails(baseUrl) {
  if (C.circuitDetailsLookup) return C.circuitDetailsLookup;
  const resp = await fetch(new URL("/static/circuit_details.json", baseUrl).toString());
  if (!resp.ok) throw new Error("Failed to load circuit_details.json: " + resp.status);
  C.circuitDetailsLookup = await resp.json();
  return C.circuitDetailsLookup;
}

async function fetchStructureDetails(baseUrl) {
  if (C.structureDetailsLookup) return C.structureDetailsLookup;
  const resp = await fetch(new URL("/static/structure_details.json", baseUrl).toString());
  if (!resp.ok) throw new Error("Failed to load structure_details.json: " + resp.status);
  C.structureDetailsLookup = await resp.json();
  return C.structureDetailsLookup;
}

async function fetchConverterDetails(baseUrl) {
  if (C.converterDetailsLookup) return C.converterDetailsLookup;
  const resp = await fetch(new URL("/static/converter_details.json", baseUrl).toString());
  if (!resp.ok) throw new Error("Failed to load converter_details.json: " + resp.status);
  C.converterDetailsLookup = await resp.json();
  return C.converterDetailsLookup;
}

async function fetchConductorOm(baseUrl) {
  if (C.conductorOmLookup) return C.conductorOmLookup;
  const resp = await fetch(new URL("/static/conductor_om.json", baseUrl).toString());
  if (!resp.ok) throw new Error("Failed to load conductor_om.json: " + resp.status);
  C.conductorOmLookup = await resp.json();
  return C.conductorOmLookup;
}

async function fetchVegetationManagement(baseUrl) {
  if (C.vegetationManagementLookup) return C.vegetationManagementLookup;
  const resp = await fetch(new URL("/static/vegetation_management.json", baseUrl).toString());
  if (!resp.ok) throw new Error("Failed to load vegetation_management.json: " + resp.status);
  C.vegetationManagementLookup = await resp.json();
  return C.vegetationManagementLookup;
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
  window.fetchRowWidths = fetchRowWidths;
  window.fetchBuildCosts = fetchBuildCosts;
  window.fetchCircuitDetails = fetchCircuitDetails;
  window.fetchStructureDetails = fetchStructureDetails;
  window.fetchConverterDetails = fetchConverterDetails;
  window.fetchConductorOm = fetchConductorOm;
  window.fetchVegetationManagement = fetchVegetationManagement;
  window.normalizeCT = normalizeCT;
  window.buildCategoryString = buildCategoryString;
  window.getRowWidthFeet = getRowWidthFeet;
  window.validateCategoryString = validateCategoryString;
  window.getBuildCostEntry = getBuildCostEntry;
  window.getCircuitDetailsEntry = getCircuitDetailsEntry;
  window.getOldCircuitDetailsEntry = getOldCircuitDetailsEntry;
  window.buildOldCategoryString = buildOldCategoryString;
})();
