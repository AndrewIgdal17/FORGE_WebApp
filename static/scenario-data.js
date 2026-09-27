// FORGE Scenario Data Layer
// Extracted from scenarios.js — loaded via <script src="/static/scenario-data.js">
// Depends on: utils.js (setValueAtPath, csvEscape, flattenObject, parseCsvLine),
//             supabase client (_sb), window.FORGE

(function() {
'use strict';

  const C = window.FORGE;

  let _snapshotCache = {};

  const SCENARIO_SPECIFIC_SECTIONS = new Set([
    '01_project_technical_details',
    '03_financing',
    '05_delays',
    '17_congestion_reductions',
  ]);

  const NEW_SCENARIO_BLANK_FIELDS = [
    { path: '01_project_technical_details.project.construction_type', value: null },
    { path: '01_project_technical_details.project.ac_dc', value: null },
    { path: '01_project_technical_details.project.capacity_mw', value: null },
    { path: '01_project_technical_details.project.conductor_type', value: null },
    { path: '01_project_technical_details.project.old_ac_dc', value: null },
    { path: '01_project_technical_details.project.old_capacity_mw', value: null },
    { path: '01_project_technical_details.project.old_conductor_type', value: null },
    { path: '01_project_technical_details.project.old_converter_type', value: null },
    { path: '01_project_technical_details.timeline.construction_years', value: 0 },
    { path: '01_project_technical_details.timeline.delay_years', value: 0 },
  ];

  const RESULTS_EXPORT_FIELDS = [
    { key: 'capacity_mw', path: 'technical_parameters.capacity_mw' },
    { key: 'line_length_miles', path: 'technical_parameters.line_length_miles' },
    { key: 'project_lifetime_years', path: 'technical_parameters.project_lifetime_years' },
    { key: 'delay_years', path: 'technical_parameters.delay_years' },
    { key: 'build_cost_pv', path: 'costs.build.total_pv' },
    { key: 'row_capital_pv', path: 'costs.row.row_capital_pv' },
    { key: 'row_rent_pv', path: 'costs.row.row_rent_pv' },
    { key: 'env_mitigation_pv', path: 'costs.environmental.total_pv' },
    { key: 'total_capital_pv', path: 'summary.total_capital_pv' },
    { key: 'insurance_pv', path: 'costs.insurance.pv_total' },
    { key: 'oandm_pv', path: 'costs.oandm.total_pv' },
    { key: 'total_operational_pv', path: 'summary.total_operational_pv' },
    { key: 'wildfire_pv', path: 'costs.wildfire.pv_cost' },
    { key: 'outage_pv', path: 'costs.outage.pv_cost' },
    { key: 'total_risk_pv', path: 'summary.total_risk_pv' },
    { key: 'delay_pv', path: 'costs.delay.total_pv' },
    { key: 'line_loss_pv', path: 'costs.line_loss.total_pv' },
    { key: 'emissions_pv', path: 'costs.emissions.total_pv' },
    { key: 'fac_emissions_project_pv', path: 'bcr.fac_emissions_project_pv' },
    { key: 'displacement_avoided_benefit_pv', path: 'bcr.displacement_avoided_benefit_pv' },
    { key: 'total_energy_emissions_pv', path: 'summary.total_energy_emissions_pv' },
    { key: 'grand_total_cost_pv', path: 'summary.total_costs_pv' },
    { key: 'hard_costs_pv', path: 'bcr.hard_costs_pv' },
    { key: 'soft_costs_pv', path: 'bcr.soft_costs_pv' },
    { key: 'emissions_costs_pv', path: 'bcr.emissions_costs_pv' },
    { key: 'revenue_pv', path: 'bcr.revenue_pv' },
    { key: 'bcr_societal', path: 'bcr.bcr_societal' },
    { key: 'bcr_utility', path: 'bcr.bcr_utility' },
    { key: 'bcr_ratepayer', path: 'bcr.bcr_ratepayer' },
    { key: 'net_benefit_pv', path: 'bcr.net_benefit_pv' },
    { key: 'net_benefit_utility_pv', path: 'bcr.net_benefit_utility_pv' },
    { key: 'net_benefit_ratepayer_pv', path: 'bcr.net_benefit_ratepayer_pv' },
  ];

  async function loadScenariosFromDB() {
    const [scenarioRes, profileRes] = await Promise.all([
      _sb.from('scenario').select('*').order('updated_at', { ascending: false }),
      _sb.from('profiles').select('id, username, org')
    ]);
    if (scenarioRes.error) {
      console.error('Failed to load scenarios:', scenarioRes.error);
      return;
    }
    const profileMap = {};
    (profileRes.data || []).forEach(p => { profileMap[p.id] = p; });
    C.sessionScenarios = scenarioRes.data.map(row => ({
      id: row.id,
      user_id: row.user_id,
      customName: row.name,
      inputs: row.inputs,
      results: row.results,
      metadata: row.metadata || {},
      ref_snapshot_id: row.ref_snapshot_id,
      overrides: row.overrides || {},
      _owner: profileMap[row.user_id] || null
    }));
    const snapshotIds = [...new Set(C.sessionScenarios.map(s => s.ref_snapshot_id).filter(Boolean))];
    await Promise.all(snapshotIds.map(id => loadSnapshot(id)));
    window._latestSnapshot = snapshotIds.length > 0 ? _snapshotCache[snapshotIds[0]] : null;
    const newBtn = document.getElementById('new-scenario-btn');
    if (newBtn) newBtn.removeAttribute('disabled');
  }

  async function saveScenarioToDB(scenario) {
    const userId = C.currentUserId;
    if (!userId) return;
    const fullInputs = typeof collectJsonData === 'function' ? collectJsonData() : null;
    const snap = scenario.ref_snapshot_id ? _snapshotCache[scenario.ref_snapshot_id] : null;
    const slimInputs = (fullInputs && snap) ? extractScenarioInputs(fullInputs) : scenario.inputs;
    const overrides = (fullInputs && snap) ? computeOverrides(fullInputs, snap) : (scenario.overrides || {});
    const { error } = await _sb.from('scenario').upsert({
      id: scenario.id,
      user_id: userId,
      name: scenario.customName,
      inputs: slimInputs,
      results: scenario.results,
      metadata: scenario.metadata,
      overrides: overrides,
      ref_snapshot_id: scenario.ref_snapshot_id,
      updated_at: new Date().toISOString()
    });
    if (error) console.error('Failed to save scenario:', error);
    if (!error) C.unsavedChanges = false;
    scenario.inputs = slimInputs;
    scenario.overrides = overrides;
  }

  async function deleteScenarioFromDB(id) {
    const { error } = await _sb.from('scenario').delete().eq('id', id);
    if (error) console.error('Failed to delete scenario:', error);
  }

  async function loadSnapshot(snapshotId) {
    if (_snapshotCache[snapshotId]) return _snapshotCache[snapshotId];
    const { data, error } = await _sb.from('ref_snapshot')
      .select('data').eq('id', snapshotId).single();
    if (error) { console.error('Failed to load snapshot:', error); return null; }
    _snapshotCache[snapshotId] = data.data;
    return data.data;
  }

  function assembleFullInputs(snapshotData, overrides, scenarioInputs) {
    const full = JSON.parse(JSON.stringify(snapshotData));
    for (const [path, value] of Object.entries(overrides || {})) {
      setValueAtPath(full, path, value);
    }
    const hasInputs = Object.keys(scenarioInputs || {}).length > 0;
    if (hasInputs) {
      for (const section of SCENARIO_SPECIFIC_SECTIONS) {
        if (scenarioInputs[section]) {
          full[section] = JSON.parse(JSON.stringify(scenarioInputs[section]));
        }
      }
      if (scenarioInputs['02_project_physical_details']?.terrain?.terrain_miles) {
        if (!full['02_project_physical_details']) full['02_project_physical_details'] = {};
        if (!full['02_project_physical_details'].terrain) full['02_project_physical_details'].terrain = {};
        full['02_project_physical_details'].terrain.terrain_miles =
          JSON.parse(JSON.stringify(scenarioInputs['02_project_physical_details'].terrain.terrain_miles));
      }
    } else {
      for (const { path, value } of NEW_SCENARIO_BLANK_FIELDS) {
        setValueAtPath(full, path, value);
      }
      const terrainMiles = full['02_project_physical_details']?.terrain?.terrain_miles;
      if (terrainMiles) {
        for (const key of Object.keys(terrainMiles)) {
          terrainMiles[key] = 0;
        }
      }
    }
    return full;
  }

  function extractScenarioInputs(fullData) {
    const inputs = {};
    for (const section of SCENARIO_SPECIFIC_SECTIONS) {
      if (fullData[section]) inputs[section] = JSON.parse(JSON.stringify(fullData[section]));
    }
    if (fullData['02_project_physical_details']?.terrain?.terrain_miles) {
      inputs['02_project_physical_details'] = {
        terrain: { terrain_miles: JSON.parse(JSON.stringify(
          fullData['02_project_physical_details'].terrain.terrain_miles)) }
      };
    }
    return inputs;
  }

  function computeOverrides(fullData, snapshotData) {
    const overrides = {};
    const refSections = Object.keys(snapshotData).filter(k => !SCENARIO_SPECIFIC_SECTIONS.has(k));
    for (const section of refSections) {
      if (section === '02_project_physical_details') {
        diffObjects(snapshotData[section], fullData[section], section, overrides,
          new Set(['02_project_physical_details.terrain.terrain_miles']));
      } else {
        diffObjects(snapshotData[section], fullData[section], section, overrides);
      }
    }
    return overrides;
  }

  function diffObjects(ref, current, path, overrides, skipPaths) {
    if (skipPaths && skipPaths.has(path)) return;
    if (ref === current) return;
    if (ref == null || current == null || typeof ref !== 'object' || typeof current !== 'object') {
      if (ref !== current) overrides[path] = current;
      return;
    }
    for (const key of new Set([...Object.keys(ref), ...Object.keys(current)])) {
      diffObjects(ref[key], current[key], path + '.' + key, overrides, skipPaths);
    }
  }

  function generateScenarioName(baseName) {
    const existingNames = C.sessionScenarios.map(s => s.customName);
    if (!existingNames.includes(baseName)) return baseName;
    let counter = 2;
    while (existingNames.includes(`${baseName} (${counter})`)) counter++;
    return `${baseName} (${counter})`;
  }

  function updateScenarioBadge() {
    // No-op: badge removed by design
  }

  async function addScenarioToSession(inputs, results, metadata, customName) {
    const userId = C.currentUserId;
    const name = customName || generateScenarioName('Scenario');
    const latestSnapshotId = Object.keys(_snapshotCache)[0] || null;
    const row = {
      user_id: userId || null,
      name: name,
      inputs: inputs ? extractScenarioInputs(inputs) : {},
      results: results ? JSON.parse(JSON.stringify(results)) : null,
      metadata: metadata || { timestamp: new Date().toISOString(), source: 'manual' },
      updated_at: new Date().toISOString(),
      ref_snapshot_id: latestSnapshotId,
      overrides: (inputs && latestSnapshotId && _snapshotCache[latestSnapshotId])
          ? computeOverrides(inputs, _snapshotCache[latestSnapshotId]) : {}
    };
    const { data, error } = await _sb.from('scenario').insert(row).select('id').single();
    const id = (data && !error) ? data.id : crypto.randomUUID();
    if (error) console.error('Failed to insert scenario:', error);
    const scenario = {
      ...row, id, customName: name,
      _owner: C.userProfile ? { username: C.userProfile.username, org: C.userProfile.org } : null
    };
    C.sessionScenarios.push(scenario);
    return scenario;
  }

  function hasRequiredFields() {
    if (!document.getElementById('demo-form')) return false;
    const q = s => document.querySelector('[data-path="' + s + '"]');
    const constructionType = q('01_project_technical_details.project.construction_type');
    const acDc = q('01_project_technical_details.project.ac_dc');
    const capacityMw = q('01_project_technical_details.project.capacity_mw');
    const conductorType = q('01_project_technical_details.project.conductor_type');
    if (!constructionType?.value || !acDc?.value || !capacityMw?.value || !conductorType?.value) return false;
    if (acDc.value === 'DC') {
      const converterType = q('01_project_technical_details.project.converter_type');
      if (!converterType?.value) return false;
    }
    if (constructionType.value === 'Reconductoring') {
      const oldAcDc = q('01_project_technical_details.project.old_ac_dc');
      const oldCapacity = q('01_project_technical_details.project.old_capacity_mw');
      const oldConductor = q('01_project_technical_details.project.old_conductor_type');
      if (!oldAcDc?.value || !oldCapacity?.value || !oldConductor?.value) return false;
    }
    const terrainInputs = document.querySelectorAll('[data-path*="terrain_miles"]');
    let hasAnyMiles = false;
    terrainInputs.forEach(input => {
      const val = parseFloat(input.value.replace(/,/g, ''));
      if (!isNaN(val) && val > 0) hasAnyMiles = true;
    });
    if (!hasAnyMiles) return false;
    if (typeof calculateTerrainMilesTotal === 'function' && typeof calculateROWMilesTotal === 'function') {
      if (Math.abs(calculateTerrainMilesTotal() - calculateROWMilesTotal()) >= 0.01) return false;
    }
    return true;
  }

  function getInvalidFields() {
    var invalid = [];
    if (!document.getElementById('demo-form')) return invalid;
    var q = function(s) { return document.querySelector('[data-path="' + s + '"]'); };

    var checks = [
      { path: '01_project_technical_details.project.construction_type', label: 'Construction Type', subTab: 'technology' },
      { path: '01_project_technical_details.project.ac_dc', label: 'AC/DC', subTab: 'technology' },
      { path: '01_project_technical_details.project.capacity_mw', label: 'Capacity MW', subTab: 'technology' },
      { path: '01_project_technical_details.project.conductor_type', label: 'Conductor Type', subTab: 'conductor-details' },
    ];

    var acDcEl = q('01_project_technical_details.project.ac_dc');
    if (acDcEl && acDcEl.value === 'DC') {
      checks.push({ path: '01_project_technical_details.project.converter_type', label: 'Converter Type', subTab: 'converter-details' });
    }

    var ctEl = q('01_project_technical_details.project.construction_type');
    if (ctEl && ctEl.value === 'Reconductoring') {
      checks.push({ path: '01_project_technical_details.project.old_ac_dc', label: 'Old AC/DC', subTab: 'technology' });
      checks.push({ path: '01_project_technical_details.project.old_capacity_mw', label: 'Old Capacity MW', subTab: 'technology' });
      checks.push({ path: '01_project_technical_details.project.old_conductor_type', label: 'Old Conductor Type', subTab: 'technology' });
    }

    for (var i = 0; i < checks.length; i++) {
      var el = q(checks[i].path);
      if (!el || !el.value) {
        invalid.push(checks[i]);
      }
    }

    var terrainInputs = document.querySelectorAll('[data-path*="terrain_miles"]');
    var hasAnyMiles = false;
    terrainInputs.forEach(function(input) {
      var val = parseFloat(input.value.replace(/,/g, ''));
      if (!isNaN(val) && val > 0) hasAnyMiles = true;
    });
    if (!hasAnyMiles) {
      invalid.push({ path: 'terrain_miles', label: 'Terrain miles (at least one > 0)', subTab: 'terrain-mix' });
    }

    if (hasAnyMiles && typeof calculateTerrainMilesTotal === 'function' && typeof calculateROWMilesTotal === 'function') {
      var tTotal = calculateTerrainMilesTotal();
      var zTotal = calculateROWMilesTotal();
      if (Math.abs(tTotal - zTotal) >= 0.01) {
        var msg = 'Terrain miles (' + tTotal + ') \u2260 zone miles (' + zTotal + ')';
        invalid.push({ path: 'routing_mismatch', label: msg, subTab: 'terrain-mix' });
        invalid.push({ path: 'routing_mismatch_row', label: msg, subTab: 'rights-of-way' });
      }
    }

    return invalid;
  }

  function clearResults() {
    const resultEl = document.getElementById('result');
    if (resultEl) {
      resultEl.innerHTML = '<div style="display:flex; align-items:center; justify-content:center; min-height:300px; color:#999; font-size:1.1rem; text-align:center;">' +
        '<div><div style="font-size:2rem; margin-bottom:0.5rem;">&#9432;</div>' +
        'Fill in required project fields to calculate results.<br>' +
        '<span style="font-size:0.85rem; color:#bbb;">Construction Type, AC/DC, Capacity MW, and at least one terrain with miles &gt; 0</span></div></div>';
    }
    C.lastRunResults = null;
    C.latestValidResults = null;
    const resultsBtn = document.querySelector('.view-toggle-btn[data-view="results"]');
    if (resultsBtn) {
      resultsBtn.classList.remove('results-available');
    }
  }

  function exportAsForge(scenario) {
    let fullInputs = scenario.inputs;
    if (scenario.id === C.activeScenarioId && typeof collectJsonData === 'function') {
      fullInputs = collectJsonData() || fullInputs;
    } else if (scenario.ref_snapshot_id && _snapshotCache[scenario.ref_snapshot_id]) {
      fullInputs = assembleFullInputs(
        _snapshotCache[scenario.ref_snapshot_id],
        scenario.overrides,
        scenario.inputs || {}
      );
    }

    const defaults = C.forgeJsonData;
    const slimInputs = extractScenarioInputs(fullInputs);
    const overrides = defaults ? computeOverrides(fullInputs, defaults) : {};

    const data = {
      version: '2.0',
      customName: scenario.customName,
      ref_version: C.refVersion || 'v1.0',
      inputs: slimInputs,
      overrides: overrides,
      results: scenario.results
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (scenario.customName || 'scenario').replace(/[^a-zA-Z0-9_-]/g, '_') + '.forge';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportAsCsv(scenario) {
    let fullInputs = scenario.inputs;
    if (scenario.id === C.activeScenarioId && typeof collectJsonData === 'function') {
      fullInputs = collectJsonData() || fullInputs;
    } else if (scenario.ref_snapshot_id && _snapshotCache[scenario.ref_snapshot_id]) {
      fullInputs = assembleFullInputs(
        _snapshotCache[scenario.ref_snapshot_id],
        scenario.overrides,
        scenario.inputs || {}
      );
    }

    const defaults = C.forgeJsonData;
    const slimInputs = extractScenarioInputs(fullInputs);
    const overrides = defaults ? computeOverrides(fullInputs, defaults) : {};

    let csv = '';
    csv += '[METADATA]\n';
    csv += 'version,2.0\n';
    csv += 'customName,' + csvEscape(scenario.customName || '') + '\n';
    csv += 'ref_version,' + csvEscape(C.refVersion || 'v1.0') + '\n';
    csv += 'timestamp,' + (scenario.metadata?.timestamp || new Date().toISOString()) + '\n';
    csv += '\n';

    csv += '[INPUTS]\n';
    csv += 'path,value\n';
    for (const sectionKey of Object.keys(slimInputs)) {
      const flat = flattenObject(slimInputs[sectionKey], sectionKey);
      for (const row of flat) {
        csv += csvEscape(row.path) + ',' + csvEscape(String(row.value ?? '')) + '\n';
      }
    }
    csv += '\n';

    if (Object.keys(overrides).length > 0) {
      csv += '[OVERRIDES]\n';
      csv += 'path,value\n';
      for (const [path, value] of Object.entries(overrides)) {
        csv += csvEscape(path) + ',' + csvEscape(String(value ?? '')) + '\n';
      }
      csv += '\n';
    }

    if (scenario.results) {
      csv += '[RESULTS]\n';
      csv += 'key,value\n';
      for (const field of RESULTS_EXPORT_FIELDS) {
        const val = getValueAtPath(scenario.results, field.path);
        if (val != null) {
          csv += csvEscape(field.key) + ',' + csvEscape(String(val)) + '\n';
        }
      }
    }

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (scenario.customName || 'scenario').replace(/[^a-zA-Z0-9_-]/g, '_') + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function validateForgeFile(data) {
    const errors = [];
    if (!data || typeof data !== 'object') { errors.push('Invalid JSON structure'); return { valid: false, errors }; }
    if (data.version === '2.0') {
      if (!data.inputs || typeof data.inputs !== 'object') errors.push('Missing or invalid inputs field');
      if (data.overrides !== undefined && typeof data.overrides !== 'object') errors.push('Overrides field must be an object');
    } else {
      if (!data.inputs || typeof data.inputs !== 'object') errors.push('Missing or invalid inputs field');
      else if (!data.inputs['01_project_technical_details']) errors.push('Missing 01_project_technical_details in inputs');
    }
    if (data.results && typeof data.results !== 'object') errors.push('Results field must be an object');
    return { valid: errors.length === 0, errors };
  }

  function loadForgeFile(text, fileName) {
    try {
      const data = JSON.parse(text);
      const validation = validateForgeFile(data);
      if (!validation.valid) {
        alert('Invalid .forge file:\n' + validation.errors.join('\n'));
        return;
      }
      if (data.results && data.results.results && data.results.results.bcr) {
        data.results = data.results.results;
      }

      const name = data.customName || fileName.replace('.forge', '');
      let inputs;

      if (data.version === '2.0') {
        const defaults = C.forgeJsonData;
        if (!defaults) {
          alert('Cannot import v2.0 .forge file: reference data not loaded yet. Open the workspace first.');
          return;
        }
        inputs = assembleFullInputs(defaults, data.overrides || {}, data.inputs);
        if (data.ref_version && data.ref_version !== (C.refVersion || 'v1.0')) {
          console.info('Imported scenario built against ref ' + data.ref_version +
            '; current is ' + (C.refVersion || 'v1.0'));
        }
      } else {
        inputs = data.inputs;
      }

      addScenarioToSession(inputs, data.results || null,
        { timestamp: data.metadata?.timestamp || new Date().toISOString(),
          scenario_id: data.metadata?.scenario_id || '',
          source: 'upload-forge' },
        generateScenarioName(name));
    } catch (e) {
      alert('Failed to parse .forge file: ' + e.message);
    }
  }

  function loadCsvFile(text, fileName) {
    try {
      const sections = {};
      let currentSection = null;
      const lines = text.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.match(/^\[([A-Z]+)\]$/)) {
          currentSection = trimmed.match(/^\[([A-Z]+)\]$/)[1];
          sections[currentSection] = [];
        } else if (currentSection && trimmed) {
          sections[currentSection].push(trimmed);
        }
      }

      if (!sections.METADATA) {
        alert('Invalid CSV: missing [METADATA] section');
        return;
      }

      const metadata = {};
      for (const line of sections.METADATA) {
        const idx = line.indexOf(',');
        if (idx > 0) {
          metadata[line.substring(0, idx)] = line.substring(idx + 1);
        }
      }

      const isV2 = metadata.version === '2.0';
      let inputs = null;

      if (isV2) {
        const defaults = C.forgeJsonData;
        if (!defaults) {
          alert('Cannot import v2.0 CSV file: reference data not loaded yet. Open the workspace first.');
          return;
        }
        const scenarioInputs = {};
        if (sections.INPUTS && sections.INPUTS.length > 1) {
          for (let i = 1; i < sections.INPUTS.length; i++) {
            const parts = parseCsvLine(sections.INPUTS[i]);
            if (parts.length >= 2) {
              let val = parts[1];
              if (val !== '' && !isNaN(Number(val))) val = Number(val);
              else if (val === 'true') val = true;
              else if (val === 'false') val = false;
              setValueAtPath(scenarioInputs, parts[0], val);
            }
          }
        }
        const overrides = {};
        if (sections.OVERRIDES && sections.OVERRIDES.length > 1) {
          for (let i = 1; i < sections.OVERRIDES.length; i++) {
            const parts = parseCsvLine(sections.OVERRIDES[i]);
            if (parts.length >= 2) {
              let val = parts[1];
              if (val !== '' && !isNaN(Number(val))) val = Number(val);
              else if (val === 'true') val = true;
              else if (val === 'false') val = false;
              overrides[parts[0]] = val;
            }
          }
        }
        inputs = assembleFullInputs(defaults, overrides, scenarioInputs);
        if (metadata.ref_version && metadata.ref_version !== (C.refVersion || 'v1.0')) {
          console.info('Imported CSV built against ref ' + metadata.ref_version +
            '; current is ' + (C.refVersion || 'v1.0'));
        }
      } else {
        if (sections.INPUTS && sections.INPUTS.length > 1) {
          inputs = C.forgeJsonData ? JSON.parse(JSON.stringify(C.forgeJsonData)) : {};
          for (let i = 1; i < sections.INPUTS.length; i++) {
            const parts = parseCsvLine(sections.INPUTS[i]);
            if (parts.length >= 3) {
              const fullPath = parts[0] + '.' + parts[1];
              let val = parts[2];
              if (val !== '' && !isNaN(Number(val))) val = Number(val);
              else if (val === 'true') val = true;
              else if (val === 'false') val = false;
              setValueAtPath(inputs, fullPath, val);
            }
          }
        }
      }

      let results = null;
      if (sections.RESULTS && sections.RESULTS.length > 1) {
        results = {};
        for (let i = 1; i < sections.RESULTS.length; i++) {
          const parts = parseCsvLine(sections.RESULTS[i]);
          if (parts.length >= 2) {
            const field = RESULTS_EXPORT_FIELDS.find(f => f.key === parts[0]);
            if (field) {
              let val = parts[1];
              if (val !== '' && !isNaN(Number(val))) val = Number(val);
              setValueAtPath(results, field.path, val);
            }
          }
        }
      }

      const name = metadata.customName || fileName.replace('.csv', '');
      addScenarioToSession(inputs, results,
        { timestamp: metadata.timestamp || new Date().toISOString(),
          source: 'upload-csv' },
        generateScenarioName(name));
    } catch (e) {
      alert('Failed to parse CSV file: ' + e.message);
    }
  }

  async function loadForgeJson() {
    try {
      const baseUrl = C.apiBaseUrl;
      if (!C.taxonomy || !C.inputMetadata) {
        try {
          const [taxData, metaData] = await Promise.all([
            C.taxonomy ? Promise.resolve(C.taxonomy) : fetchTaxonomy(baseUrl),
            C.inputMetadata ? Promise.resolve(C.inputMetadata) : fetchInputMetadata(baseUrl),
            fetchRowWidths(baseUrl),
            fetchBuildCosts(baseUrl),
            fetchCircuitDetails(baseUrl),
            fetchStructureDetails(baseUrl),
            fetchConverterDetails(baseUrl),
            fetchConductorOm(baseUrl),
            fetchVegetationManagement(baseUrl),
          ]);
          if (!C.taxonomy) {
            C.taxonomy = taxData;
            C.taxonomyById = {};
            C.taxonomyBySide = {};
            C.taxonomyByCategory = {};
            (taxData.items || []).forEach(item => {
              C.taxonomyById[item.id] = item;
              (C.taxonomyBySide[item.side] ??= []).push(item);
              (C.taxonomyByCategory[item.category] ??= []).push(item);
            });
          }
          if (!C.inputMetadata) C.inputMetadata = metaData;
        } catch (err) {
          console.warn('Taxonomy/metadata pre-load failed, using legacy renderer:', err);
        }
      }
      const data = await fetchFinalCombined(baseUrl);
      renderJsonInputs(data);
    } catch (error) {
      const _ls = document.getElementById('load-status');
      if (_ls) { _ls.textContent = '✗ ' + error.message; _ls.style.color = '#b00020'; }
    }
  }

  async function displayCsvFiles(apiResponse, baseUrl) {
    try {
      const csvFiles = apiResponse.csv_files || [];
      const outputDir = apiResponse.output_dir || '../outputs';

      if (csvFiles.length === 0) {
        document.getElementById('result').textContent = "No CSV files generated.";
        document.getElementById('status').textContent = "Success (no CSV files)";
        return;
      }

      let html = '<div style="font-family: monospace; white-space: pre-wrap;">';
      html += `<h3>Generated ${csvFiles.length} CSV file(s):</h3>`;

      html += `<div style="margin-bottom: 20px;">`;
      html += `<button onclick="downloadAllCsvFiles()" style="padding: 10px 20px; background: #0066cc; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;">Download All CSV Files</button>`;
      html += `</div>\n\n`;

      for (const csvFile of csvFiles) {
        try {
          const csvUrl = new URL(`/api/outputs/${csvFile}`, baseUrl).toString();
          const response = await fetch(csvUrl);

          if (response.ok) {
            const csvContent = await response.text();
            html += `<div style="margin-bottom: 30px; border: 1px solid #ddd; padding: 15px; border-radius: 4px;">`;
            html += `<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">`;
            html += `<h4 style="margin: 0; color: #0066cc;">${csvFile}</h4>`;
            html += `<button onclick="downloadCsvFile('${csvFile}', '${csvUrl}')" style="padding: 8px 16px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 13px;">Download</button>`;
            html += `</div>`;
            html += `<pre style="overflow-x: auto; background: #f5f5f5; padding: 10px; border-radius: 4px; max-height: 400px;">${csvContent}</pre>`;
            html += `</div>`;
          } else {
            html += `<div style="margin-bottom: 20px;">`;
            html += `<h4 style="color: #b00020;">${csvFile}</h4>`;
            html += `<p>Could not fetch file (${response.status})</p>`;
            html += `</div>`;
          }
        } catch (error) {
          html += `<div style="margin-bottom: 20px;">`;
          html += `<h4 style="color: #b00020;">${csvFile}</h4>`;
          html += `<p>Error: ${error.message}</p>`;
          html += `</div>`;
        }
      }

      html += '</div>';
      document.getElementById('result').innerHTML = html;
      document.getElementById('status').textContent = `Success - ${csvFiles.length} CSV file(s) displayed`;
    } catch (error) {
      document.getElementById('result').textContent = `Error displaying CSV files: ${error.message}`;
      document.getElementById('status').textContent = "Error";
    }
  }

  function downloadCsvFile(filename, url) {
    const downloadUrl = url.includes('?') ? `${url}&download=true` : `${url}?download=true`;

    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function downloadAllCsvFiles() {
    const buttons = document.getElementById('result').querySelectorAll('button[onclick^="downloadCsvFile"]');

    if (buttons.length === 0) {
      alert('No CSV files to download');
      return;
    }

    buttons.forEach((button, index) => {
      setTimeout(() => {
        const onclickAttr = button.getAttribute('onclick');
        const match = onclickAttr.match(/downloadCsvFile\('([^']+)',\s*'([^']+)'\)/);
        if (match) {
          const filename = match[1];
          const url = match[2];
          downloadCsvFile(filename, url);
        }
      }, index * 200);
    });
  }

  window.loadScenariosFromDB = loadScenariosFromDB;
  window.saveScenarioToDB = saveScenarioToDB;
  window.generateScenarioName = generateScenarioName;
  window.updateScenarioBadge = updateScenarioBadge;
  window.addScenarioToSession = addScenarioToSession;
  window.hasRequiredFields = hasRequiredFields;
  window.getInvalidFields = getInvalidFields;
  window.clearResults = clearResults;
  window.loadSnapshot = loadSnapshot;
  window.assembleFullInputs = assembleFullInputs;
  window.extractScenarioInputs = extractScenarioInputs;
  window.computeOverrides = computeOverrides;
  window.exportAsForge = exportAsForge;
  window.exportAsCsv = exportAsCsv;
  window.validateForgeFile = validateForgeFile;
  window.loadForgeFile = loadForgeFile;
  window.loadCsvFile = loadCsvFile;
  window.loadForgeJson = loadForgeJson;
  window.displayCsvFiles = displayCsvFiles;
  window.downloadCsvFile = downloadCsvFile;
  window.downloadAllCsvFiles = downloadAllCsvFiles;
  window.deleteScenarioFromDB = deleteScenarioFromDB;
  window._snapshotCache = _snapshotCache;
})();
