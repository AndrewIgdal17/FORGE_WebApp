(function() {
'use strict';

var SYN = {
  'interest rate': ['wacc_nominal','social_discount_rate'],
  'wire': ['conductor_type','old_conductor_type'], 'cable': ['conductor_type','old_conductor_type'],
  'cost of money': ['wacc_nominal'],
  'discount': ['social_discount_rate','wacc_nominal'],
  'greenfield': ['reconductoring'], 'reconductoring': ['reconductoring'],
  'voltage': ['converter_loss_pct'], 'capacity': ['capacity_mw','existing_capacity_mw','old_capacity_mw','line_utilization'],
  'utilization': ['line_utilization'],
  'terrain': ['terrain_forested','terrain_scrubbed_flat','terrain_wetland','terrain_farmland',
    'terrain_desert_barren','terrain_urban','terrain_rolling_hills','terrain_mountain','terrain_subsea'],
  'row': ['uses_existing_row'], 'right of way': ['uses_existing_row'],
  'wildfire': ['wf_uninsured_severity','wf_risk_growth_rate','wf_base_ignition_rate'],
  'fire': ['wf_uninsured_severity','wf_base_ignition_rate'],
  'outage': ['out_base_duration_hours','out_risk_growth_rate'],
  'carbon': ['co2_cost_per_kg'], 'co2': ['co2_cost_per_kg'],
  'emission': ['co2_cost_per_kg','sox_cost_per_kg','nox_cost_per_kg','compensation_percent'],
  'fuel': ['grid_mix', 'energy_source_mix'], 'construction': ['construction_type','construction_years'],
  'delay': ['delay_legal','delay_admin','delay_labor','delay_environmental','delay_years'],
  'insurance': ['op_premium_rate'], 'vegetation': ['veg_forested_oh'],
  'mitigation': ['mitigation_uplift_factor'],
  'contingency': ['conductor_contingency','structure_contingency','converter_contingency'],
  'converter': ['n_converters','converter_type','old_converter_type','converter_loss_pct'], 'circuit': ['n_circuits'],
  'loss': ['loss_compensation_rate','compensation_percent','converter_loss_pct'], 'inflation': ['inflation_rate'],
  'base year': ['base_year'], 'afudc': ['apply_afudc'], 'rent': ['zone_1_rent_cost'],
  'acquisition': ['zone_1_acquisition_cost'], 'conductor': ['conductor_type','old_conductor_type'],
  'wacc': ['wacc_nominal']
};

var index = [], synMap = {}, dropdown, inputEl, debounceTimer, activeIdx = -1;

function secLabel(id) {
  var s = window.SIDEBAR_SECTIONS && window.SIDEBAR_SECTIONS.inputs;
  for (var i = 0; s && i < s.length; i++) if (s[i].id === id) return s[i].label;
  return id;
}

function buildSynonymMap(meta) {
  var map = {}, k, t, i, ids, tgt;
  for (k in SYN) if (Object.prototype.hasOwnProperty.call(SYN, k)) {
    ids = [];
    for (t = 0; t < SYN[k].length; t++) for (i = 0; i < meta.length; i++)
      if (meta[i].id.indexOf(SYN[k][t]) !== -1 && ids.indexOf(meta[i].id) < 0) ids.push(meta[i].id);
    map[k] = ids;
  }
  return map;
}

function buildIndex(meta) {
  var out = [], i, m, sl;
  for (i = 0; i < meta.length; i++) {
    m = meta[i];
    sl = secLabel(m.input_tab);
    out.push({
      fieldId: m.id, label: m.label, sectionId: m.input_tab, subItemId: m.sub_tab,
      sectionLabel: sl, fullPath: m.yaml_section + '.' + m.field_path,
      searchText: (m.label + ' ' + (m.help_text || '') + ' ' + sl + ' ' + (m.section_label || '')).toLowerCase()
    });
  }
  return out;
}

function synIds(q, words) {
  var ids = [], k, w, j, lower = q.toLowerCase(), hit, mapped;
  for (k in synMap) if (Object.prototype.hasOwnProperty.call(synMap, k)) {
    hit = lower.indexOf(k) !== -1;
    if (!hit) for (w = 0; w < words.length; w++)
      if (words[w] === k || k.indexOf(words[w]) !== -1) { hit = true; break; }
    if (hit) for (j = 0; j < synMap[k].length; j++)
      if (ids.indexOf(synMap[k][j]) < 0) ids.push(synMap[k][j]);
  }
  return ids;
}

function runSearch(query) {
  var q = query.trim().toLowerCase(), words = q.split(/\s+/).filter(Boolean), i, w, ok, h;
  if (!q) return [];
  var sid = synIds(q, words), seen = {}, hits = [], add = function(e) {
    if (!seen[e.fieldId]) { seen[e.fieldId] = 1; hits.push(e); }
  };
  for (i = 0; i < sid.length; i++) for (w = 0; w < index.length; w++)
    if (index[w].fieldId === sid[i]) add(index[w]);
  for (i = 0; i < index.length; i++) {
    ok = true;
    for (w = 0; w < words.length; w++) if (index[i].searchText.indexOf(words[w]) === -1) { ok = false; break; }
    if (ok) add(index[i]);
  }
  var bySec = {}, order = window.SIDEBAR_SECTIONS && window.SIDEBAR_SECTIONS.inputs || [], out = [], b, o, g;
  for (i = 0; i < hits.length; i++) {
    h = hits[i]; if (!bySec[h.sectionId]) bySec[h.sectionId] = []; bySec[h.sectionId].push(h);
  }
  for (o = 0; o < order.length && out.length < 10; o++) {
    b = bySec[order[o].id]; if (!b) continue;
    for (g = 0; g < b.length && out.length < 10; g++) out.push(b[g]);
  }
  return out;
}

function closeDropdown() {
  if (!dropdown) return;
  dropdown.classList.remove('open');
  dropdown.innerHTML = '';
  activeIdx = -1;
}

function highlightField(entry) {
  var el = document.querySelector('[data-path="' + entry.fullPath + '"]')
    || document.querySelector('[data-field-path="' + entry.fullPath + '"]')
    || document.querySelector('[data-path*="' + entry.fieldId + '"]');
  var target = el && el.closest ? (el.closest('.form-field') || el) : el;
  if (!target) return;
  target.classList.add('field-highlight');
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(function() { target.classList.remove('field-highlight'); }, 1500);
}

function selectResult(entry) {
  if (typeof window.navigateToSubItem === 'function') window.navigateToSubItem(entry.sectionId, entry.subItemId);
  if (inputEl) inputEl.value = '';
  closeDropdown();
  setTimeout(function() { highlightField(entry); }, 50);
}

function setActiveResult(idx) {
  var rows = dropdown.querySelectorAll('.search-result'), i;
  activeIdx = idx;
  for (i = 0; i < rows.length; i++) rows[i].style.background = i === activeIdx ? 'rgba(0,100,200,0.08)' : '';
}

function renderDropdown(results) {
  var i, r, last = '', hdr, row;
  dropdown.innerHTML = '';
  activeIdx = -1;
  if (!results.length) { closeDropdown(); return; }
  for (i = 0; i < results.length; i++) {
    r = results[i];
    if (r.sectionLabel !== last) {
      last = r.sectionLabel;
      hdr = document.createElement('div');
      hdr.style.cssText = 'padding:0.35rem 0.75rem 0.15rem;font-size:0.65rem;font-weight:600;color:#aaa;text-transform:uppercase;';
      hdr.textContent = r.sectionLabel;
      dropdown.appendChild(hdr);
    }
    row = document.createElement('div');
    row.className = 'search-result';
    row.innerHTML = '<strong>' + r.label + '</strong>';
    row.addEventListener('click', (function(e) { return function() { selectResult(e); }; })(r));
    dropdown.appendChild(row);
  }
  dropdown.classList.add('open');
}

function isInputsView() {
  var tab = document.getElementById('main-tab-inputs');
  return tab && tab.classList.contains('active');
}

function onInput() {
  if (!isInputsView()) { closeDropdown(); return; }
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(function() {
    var val = inputEl.value.trim();
    if (!val) closeDropdown(); else renderDropdown(runSearch(val));
  }, 200);
}

function initSidebarSearch() {
  var C = window.FORGE, wrap;
  if (!C || !C.inputMetadata) return;
  inputEl = document.getElementById('sidebar-search-input');
  if (!inputEl) return;
  wrap = inputEl.closest('.sidebar-search');
  if (wrap) wrap.style.position = 'relative';
  index = buildIndex(C.inputMetadata);
  synMap = buildSynonymMap(C.inputMetadata);
  dropdown = document.createElement('div');
  dropdown.className = 'search-dropdown';
  if (wrap) wrap.appendChild(dropdown);
  inputEl.addEventListener('input', onInput);
  inputEl.addEventListener('keydown', function(e) {
    var rows = dropdown.querySelectorAll('.search-result');
    if (e.key === 'Escape') { inputEl.value = ''; closeDropdown(); e.preventDefault(); }
    else if (e.key === 'ArrowDown' && rows.length) { setActiveResult(Math.min(activeIdx + 1, rows.length - 1)); e.preventDefault(); }
    else if (e.key === 'ArrowUp' && rows.length) { setActiveResult(Math.max(activeIdx - 1, 0)); e.preventDefault(); }
    else if (e.key === 'Enter' && activeIdx >= 0 && rows.length) { rows[activeIdx].click(); e.preventDefault(); }
  });
  document.addEventListener('click', function(e) { if (wrap && !wrap.contains(e.target)) closeDropdown(); });
}

window.initSidebarSearch = initSidebarSearch;
})();
