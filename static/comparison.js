// FORGE Comparison Table
// Extracted from index.html — loaded via <script src="/static/comparison.js">

(function() {
'use strict';

  const C = window.FORGE;

let cmpMetricPickerPanelEl = null;

let cmpMetricPickerAnchorEl = null;

let cmpMetricPickerOpen = false;

let cmpMetricPickerReopen = false;

let cmpMetricPickerOutsideHandler = null;

let cmpMetricPickerKeyHandler = null;

let cmpMetricPickerResizeHandler = null;

/**
 * Sort `C.comparisonColumns` in place by COMPARISON_METRICS catalog order.
 * Keys not present in the catalog sort last; ties broken by localeCompare for stability.
 */
function sortComparisonColumnsByCatalog() {
  C.comparisonColumns.sort((a, b) => {
    const ia = COMPARISON_METRIC_KEY_ORDER.has(a) ? COMPARISON_METRIC_KEY_ORDER.get(a) : UNKNOWN_METRIC_CATALOG_INDEX;
    const ib = COMPARISON_METRIC_KEY_ORDER.has(b) ? COMPARISON_METRIC_KEY_ORDER.get(b) : UNKNOWN_METRIC_CATALOG_INDEX;
    if (ia !== ib) return ia - ib;
    return String(a).localeCompare(String(b));
  });
}

/**
 * Sync header "select all" for comparison: checked when every listed scenario is selected;
 * indeterminate when some but not all. Pass the checkbox element from the current thead.
 */
function syncComparisonSelectAllCheckbox(input) {
  if (!input || C.sessionScenarios.length === 0) return;
  const n = C.sessionScenarios.length;
  const k = C.sessionScenarios.filter(s => C.comparisonScenarioIds.has(s.id)).length;
  input.checked = n > 0 && k === n;
  input.indeterminate = k > 0 && k < n;
}

function getMetricConfig(metricKey) {
  for (const group of COMPARISON_METRICS) {
    for (const m of group.metrics) {
      if (m.key === metricKey) return m;
    }
  }
  return null;
}

function getMetricGroupName(metricKey) {
  for (const group of COMPARISON_METRICS) {
    for (const m of group.metrics) {
      if (m.key === metricKey) return group.group;
    }
  }
  return null;
}

/** Cost metrics use avoided-cost Δ (baseline − scenario). Benefits/BCR stay scenario − baseline. */
function isAvoidedCostMetric(metricKey) {
  const groupName = getMetricGroupName(metricKey);
  return COMPARISON_GROUP_SUPERGROUP[groupName] === 'costs';
}

function comparisonDelta(baselineValue, scenarioValue, metricKey) {
  return isAvoidedCostMetric(metricKey)
    ? (baselineValue - scenarioValue)
    : (scenarioValue - baselineValue);
}

function getExcludedCosts(scenario) {
  if (!scenario.results) return 0;
  const bcr = scenario.results.bcr || {};
  let excluded = 0;
  if (document.getElementById('cmp-exc-emissions')?.checked) excluded += (bcr.emissions_comp_cost_pv || 0);
  if (document.getElementById('cmp-exc-linelosses')?.checked) excluded += (bcr.energy_losses_pv || 0);
  if (document.getElementById('cmp-exc-wildfire')?.checked) excluded += (bcr.wildfire_pv || 0);
  if (document.getElementById('cmp-exc-outage')?.checked) excluded += (bcr.outage_pv || 0);
  return excluded;
}

const MAIN_EXCLUSION_KEYS = new Set(['bcr_societal', 'grand_total_pv', 'net_benefit_pv']);

function getMetricValue(scenario, metricKey) {
  if (metricKey === 'custom_bcr' || metricKey === 'custom_nb') {
    return computeCustomMetric(scenario, metricKey);
  }
  // Apply exclusions to main columns if checkbox is checked
  if (MAIN_EXCLUSION_KEYS.has(metricKey) && document.getElementById('cmp-exc-apply-main')?.checked) {
    return computeMainWithExclusions(scenario, metricKey);
  }
  const config = getMetricConfig(metricKey);
  if (!config || !scenario.results) return undefined;
  const raw = getValueAtPath(scenario.results, config.path);
  if ((raw === undefined || raw === null) && config.zeroIfMissing) {
    return 0;
  }
  return raw;
}

function computeMainWithExclusions(scenario, metricKey) {
  if (!scenario.results) return undefined;
  const bcr = scenario.results.bcr || {};
  const totalBenefitsPV = bcr.total_benefits_pv || 0;
  const totalCostsPV = (bcr.total_costs_pv || 0) - getExcludedCosts(scenario);
  if (metricKey === 'bcr_societal') return totalCostsPV > 0 ? totalBenefitsPV / totalCostsPV : 0;
  if (metricKey === 'grand_total_pv') return totalCostsPV;
  if (metricKey === 'net_benefit_pv') return totalBenefitsPV - totalCostsPV;
  return undefined;
}

function computeCustomMetric(scenario, metricKey) {
  if (!scenario.results) return undefined;
  const bcr = scenario.results.bcr || {};
  const totalBenefitsPV = bcr.total_benefits_pv || 0;
  const totalCostsPV = (bcr.total_costs_pv || 0) - getExcludedCosts(scenario);
  if (metricKey === 'custom_bcr') return totalCostsPV > 0 ? totalBenefitsPV / totalCostsPV : 0;
  return totalBenefitsPV - totalCostsPV;
}

function formatMetricValue(value, format) {
  if (value === undefined || value === null) return 'N/A';
  if (format === 'text') return value === '' ? '—' : String(value);
  if (format === 'boolean') {
    if (value === true || value === 'true') return 'Yes';
    if (value === false || value === 'false') return 'No';
    return String(value);
  }
  if (format === 'percent_decimal') {
    const num = Number(value);
    if (isNaN(num)) return String(value);
    return (num * 100).toLocaleString('en-US', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 2
    }) + '%';
  }
  if (format === 'number2') {
    const num = Number(value);
    if (isNaN(num)) return String(value);
    return formatNumber(num, 2);
  }
  const num = Number(value);
  if (isNaN(num)) return String(value);
  if (format === 'currency') return formatCurrency(num, 0);
  if (format === 'number3') return formatNumber(num, 3);
  return formatNumber(num, 0);
}

function getMetricNumericOrNull(scenario, metricKey) {
  const cfg = getMetricConfig(metricKey);
  if (cfg && (cfg.format === 'text' || cfg.format === 'boolean')) return null;
  const v = getMetricValue(scenario, metricKey);
  if (v === undefined || v === null) return null;
  const n = Number(v);
  if (Number.isNaN(n)) return null;
  return n;
}

/**
 * Categorical / config metrics (format text or boolean) show absolutes only in comparison:
 * no Δ line, no % Δ, empty Δ export cells. Unknown keys → false (no delta).
 */
function metricSupportsComparisonDelta(metricKey) {
  const cfg = getMetricConfig(metricKey);
  if (!cfg) return false;
  if (cfg.format === 'text' || cfg.format === 'boolean') return false;
  return true;
}

function cmpPickerSlug(s) {
  return String(s).replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '') || 'x';
}

function loadCmpPickerOpenState() {
  try {
    const raw = sessionStorage.getItem(CMP_PICKER_STORAGE_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw);
    return o && typeof o === 'object' ? o : {};
  } catch (e) { return {}; }
}

function saveCmpPickerOpenState(state) {
  try {
    sessionStorage.setItem(CMP_PICKER_STORAGE_KEY, JSON.stringify(state));
  } catch (e) {}
}

let cmpPickerLastOpenedId = null;

function persistCmpPickerDetailsFromPanel(panel, closingPanel) {
  if (!panel) return;
  if (closingPanel) {
    // On close: only keep the most recently expanded category open
    const state = {};
    panel.querySelectorAll('details.cmp-det-super').forEach(function(det) {
      if (det.id) state[det.id] = (det.id === cmpPickerLastOpenedId);
    });
    saveCmpPickerOpenState(state);
    cmpPickerLastOpenedId = null;
  } else {
    // During use: save full state
    const state = {};
    panel.querySelectorAll('details.cmp-det-super').forEach(function(det) {
      if (det.id) state[det.id] = !!det.open;
    });
    saveCmpPickerOpenState(state);
  }
}

function buildComparisonMetricPickerContent(excludeKeys) {
  const openState = loadCmpPickerOpenState();
  const wrap = document.createElement('div');
  wrap.className = 'cmp-metric-picker-inner';

  const bySuper = new Map();
  COMPARISON_SUPERGROUP_ORDER.forEach(function(sg) { bySuper.set(sg, []); });

  for (let gi = 0; gi < COMPARISON_METRICS.length; gi++) {
    const gentry = COMPARISON_METRICS[gi];
    const sid = COMPARISON_GROUP_SUPERGROUP[gentry.group];
    if (!sid || !bySuper.has(sid)) continue;
    bySuper.get(sid).push(gentry);
  }

  COMPARISON_SUPERGROUP_ORDER.forEach(function(superId) {
    const groups = bySuper.get(superId) || [];
    const superDetails = document.createElement('details');
    superDetails.className = 'cmp-det-super';
    superDetails.id = 'cmp-super-' + superId;
    if (openState[superDetails.id]) superDetails.open = true;

    const sum = document.createElement('summary');
    sum.textContent = COMPARISON_SUPERGROUP_LABEL[superId] || superId;
    superDetails.appendChild(sum);

    let anyInner = false;
    const singleGroup = groups.length === 1;
    groups.forEach(function(gentry) {
      const metrics = gentry.metrics.filter(function(m) {
        return !excludeKeys || !excludeKeys.has(m.key);
      });
      if (metrics.length === 0) return;
      anyInner = true;

      const metricsWrap = document.createElement('div');
      metricsWrap.className = 'cmp-metric-picker-metrics';
      metrics.forEach(function(m) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cmp-metric-picker-row';
        btn.textContent = m.label;
        btn.dataset.metricKey = m.key;
        metricsWrap.appendChild(btn);
      });

      if (singleGroup) {
        superDetails.appendChild(metricsWrap);
      } else {
        const grpHeader = document.createElement('div');
        grpHeader.className = 'cmp-group-header';
        grpHeader.textContent = gentry.group;
        superDetails.appendChild(grpHeader);
        superDetails.appendChild(metricsWrap);
      }
    });

    if (anyInner) wrap.appendChild(superDetails);
  });

  return wrap;
}

function positionCmpMetricPickerPanel(panel, anchorEl) {
  if (!panel || !anchorEl) return;
  const r = anchorEl.getBoundingClientRect();
  const pad = 6;
  let top = r.bottom + pad;
  let left = r.left;
  panel.style.top = top + 'px';
  panel.style.left = left + 'px';
  requestAnimationFrame(function() {
    const pr = panel.getBoundingClientRect();
    if (pr.bottom > window.innerHeight - pad) {
      top = Math.max(pad, r.top - pr.height - pad);
      panel.style.top = top + 'px';
    }
    if (pr.right > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - pr.width - pad);
      panel.style.left = left + 'px';
    }
  });
}

function closeComparisonMetricPicker(opts) {
  opts = opts || {};
  if (cmpMetricPickerResizeHandler) {
    window.removeEventListener('resize', cmpMetricPickerResizeHandler);
    cmpMetricPickerResizeHandler = null;
  }
  if (cmpMetricPickerKeyHandler) {
    document.removeEventListener('keydown', cmpMetricPickerKeyHandler, true);
    cmpMetricPickerKeyHandler = null;
  }
  if (cmpMetricPickerOutsideHandler) {
    document.removeEventListener('pointerdown', cmpMetricPickerOutsideHandler, true);
    cmpMetricPickerOutsideHandler = null;
  }
  if (cmpMetricPickerPanelEl) {
    persistCmpPickerDetailsFromPanel(cmpMetricPickerPanelEl, true);
    if (cmpMetricPickerPanelEl.parentNode) {
      cmpMetricPickerPanelEl.parentNode.removeChild(cmpMetricPickerPanelEl);
    }
  }
  cmpMetricPickerPanelEl = null;
  cmpMetricPickerOpen = false;
  if (cmpMetricPickerAnchorEl) {
    const tb = cmpMetricPickerAnchorEl.querySelector && cmpMetricPickerAnchorEl.querySelector('#cmp-add-metric-btn');
    if (tb) {
      tb.setAttribute('aria-expanded', 'false');
      if (!opts.skipFocusReturn) {
        try { tb.focus(); } catch (e) {}
      }
    }
    cmpMetricPickerAnchorEl = null;
  }
}

function openComparisonMetricPicker(anchorEl, excludeKeys) {
  if (!anchorEl) return;
  if (cmpMetricPickerOpen && cmpMetricPickerAnchorEl === anchorEl && cmpMetricPickerPanelEl) {
    closeComparisonMetricPicker({});
    return;
  }
  closeComparisonMetricPicker({ skipFocusReturn: true });

  cmpMetricPickerAnchorEl = anchorEl;
  cmpMetricPickerOpen = true;
  const triggerBtnOpen = anchorEl.querySelector && anchorEl.querySelector('#cmp-add-metric-btn');
  if (triggerBtnOpen) {
    triggerBtnOpen.setAttribute('aria-expanded', 'true');
    triggerBtnOpen.setAttribute('aria-controls', 'cmp-metric-picker-panel');
  }

  const panel = document.createElement('div');
  panel.id = 'cmp-metric-picker-panel';
  panel.className = 'cmp-metric-picker-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Add comparison column');
  panel.appendChild(buildComparisonMetricPickerContent(excludeKeys));
  document.body.appendChild(panel);
  cmpMetricPickerPanelEl = panel;

  panel.addEventListener('toggle', function(ev) {
    const t = ev.target;
    if (t && t.tagName === 'DETAILS' && panel.contains(t)) {
      if (t.open && t.id) {
        cmpPickerLastOpenedId = t.id;
      }
      persistCmpPickerDetailsFromPanel(panel, false);
    }
  }, true);

  panel.addEventListener('click', function(ev) {
    const btn = ev.target.closest('.cmp-metric-picker-row');
    if (!btn || !panel.contains(btn)) return;
    const key = btn.dataset.metricKey;
    if (!key) return;
    ev.preventDefault();
    cmpMetricPickerReopen = true;
    C.comparisonColumns.push(key);
    if (C.comparisonAutoSort) sortComparisonColumnsByCatalog();
    renderComparisonTable();
  });

  positionCmpMetricPickerPanel(panel, anchorEl);
  cmpMetricPickerResizeHandler = function() {
    if (cmpMetricPickerPanelEl && cmpMetricPickerAnchorEl) {
      positionCmpMetricPickerPanel(cmpMetricPickerPanelEl, cmpMetricPickerAnchorEl);
    }
  };
  window.addEventListener('resize', cmpMetricPickerResizeHandler);

  cmpMetricPickerOutsideHandler = function(ev) {
    if (!cmpMetricPickerPanelEl || !cmpMetricPickerAnchorEl) return;
    if (cmpMetricPickerPanelEl.contains(ev.target) || cmpMetricPickerAnchorEl.contains(ev.target)) return;
    closeComparisonMetricPicker({});
  };
  document.addEventListener('pointerdown', cmpMetricPickerOutsideHandler, true);

  cmpMetricPickerKeyHandler = function(ev) {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      closeComparisonMetricPicker({});
    }
  };
  document.addEventListener('keydown', cmpMetricPickerKeyHandler, true);
}

function updateComparisonDeltaControlState() {
  // No-op: delta controls are now in the popover and recreated each open.
}

function renderComparisonTable() {
  const container = document.getElementById('comparison-table-container');
  if (!container) return;

  const shouldReopenCmpPicker = cmpMetricPickerReopen;
  cmpMetricPickerReopen = false;
  closeComparisonMetricPicker({ skipFocusReturn: true });

  container.innerHTML = '';

  const selectedScenarios = C.sessionScenarios.filter(s => C.comparisonScenarioIds.has(s.id));
  const hintEl = document.getElementById('cmp-delta-hint');
  if (hintEl) {
    if (C.showDeltaVsBaseline && selectedScenarios.length > 0) {
      const baseOk = C.comparisonBaselineId && C.comparisonScenarioIds.has(C.comparisonBaselineId);
      if (!baseOk) {
        hintEl.style.display = 'block';
        hintEl.textContent = 'Select a baseline (Base column) to see Δ.';
      } else {
        hintEl.style.display = 'none';
      }
    } else {
      hintEl.style.display = 'none';
    }
  }

  if (selectedScenarios.length === 0) {
    container.innerHTML = `
      <div class="compare-empty-state">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="4" y="8" width="16" height="32" rx="2" stroke="currentColor" stroke-width="2" fill="none"/>
          <rect x="28" y="8" width="16" height="32" rx="2" stroke="currentColor" stroke-width="2" fill="none"/>
          <path d="M20 24h8" stroke="currentColor" stroke-width="2" stroke-dasharray="2 2"/>
        </svg>
        <div class="compare-empty-heading">Select scenarios to compare</div>
        <div class="compare-empty-subtext">Check 2+ scenarios above to see a side-by-side comparison table</div>
      </div>
    `;
    updateComparisonDeltaControlState();
    return;
  }

  const baselineScenario = C.sessionScenarios.find(s => s.id === C.comparisonBaselineId && C.comparisonScenarioIds.has(s.id)) || null;

  const wrapper = document.createElement('div');
  wrapper.className = 'comparison-table-wrapper';
  const table = document.createElement('table');
  table.className = 'comparison-table';

  // Header
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  const scenarioTh = document.createElement('th');
  scenarioTh.textContent = 'Scenario';
  headerRow.appendChild(scenarioTh);

  C.comparisonColumns.forEach((colKey, colIdx) => {
    const config = getMetricConfig(colKey);
    const th = document.createElement('th');
    th.className = 'metric-col';
    th.textContent = config ? config.label : colKey;
    th.dataset.colIdx = colIdx;
    th.draggable = true;
    headerRow.appendChild(th);
  });

  // Filler column with add-column dropdown
  const fillerTh = document.createElement('th');
  fillerTh.style.cssText = 'width: 100%; border: none; background: transparent; text-align: left; padding-left: 0.75rem; white-space: nowrap;';
  if (C.comparisonColumns.length < 10) {
    const existingKeys = new Set(C.comparisonColumns);
    const addWrap = document.createElement('span');
    addWrap.id = 'cmp-add-metric-wrap';
    addWrap.style.cssText = 'display: inline-flex; align-items: center; gap: 0.35rem; flex-shrink: 0;';

    const plusIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    plusIcon.setAttribute('width', '22');
    plusIcon.setAttribute('height', '22');
    plusIcon.setAttribute('viewBox', '0 0 24 24');
    plusIcon.style.cssText = 'vertical-align: middle; flex-shrink: 0; cursor: pointer;';
    plusIcon.setAttribute('role', 'presentation');
    plusIcon.innerHTML = '<circle cx="12" cy="12" r="11" fill="rgba(0,0,0,0.25)"/><line x1="7" y1="12" x2="17" y2="12" stroke="white" stroke-width="3" stroke-linecap="round"/><line x1="12" y1="7" x2="12" y2="17" stroke="white" stroke-width="3" stroke-linecap="round"/>';

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.id = 'cmp-add-metric-btn';
    addBtn.className = 'cmp-add-metric-btn btn btn-secondary btn-sm';
    addBtn.textContent = 'Add column…';
    addBtn.setAttribute('aria-haspopup', 'dialog');
    addBtn.setAttribute('aria-expanded', 'false');
    addBtn.title = 'Add a metric column to the comparison table';

    function openPickerFromFooter() {
      openComparisonMetricPicker(addWrap, existingKeys);
    }
    plusIcon.addEventListener('click', function(e) {
      e.preventDefault();
      openPickerFromFooter();
    });
    addBtn.addEventListener('click', function(e) {
      e.preventDefault();
      openPickerFromFooter();
    });

    addWrap.appendChild(plusIcon);
    addWrap.appendChild(addBtn);
    fillerTh.appendChild(addWrap);
  }
  headerRow.appendChild(fillerTh);

  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Body
  const tbody = document.createElement('tbody');
  selectedScenarios.forEach(scenario => {
    const row = document.createElement('tr');
    const nameTd = document.createElement('td');
    nameTd.appendChild(document.createTextNode(scenario.customName));
    if ((C.showDeltaVsBaseline || C.showComparisonPercentDelta) && baselineScenario && scenario.id === baselineScenario.id) {
      const badge = document.createElement('span');
      badge.className = 'baseline-badge';
      badge.textContent = 'Baseline';
      nameTd.appendChild(badge);
    }
    row.appendChild(nameTd);

    C.comparisonColumns.forEach((colKey, colIdx) => {
      const config = getMetricConfig(colKey);
      const td = document.createElement('td');
      td.className = 'metric-val';
      td.dataset.colIdx = colIdx;
      const parts = getDeltaDisplayParts(baselineScenario, scenario, colKey, true);
      const isBaseline = baselineScenario && scenario.id === baselineScenario.id;
      const showDelta = C.showDeltaVsBaseline && baselineScenario && !isBaseline && parts.deltaLineText;
      const showPercent = C.showComparisonPercentDelta && baselineScenario && !isBaseline && parts.percentText;

      if (!config) {
        td.textContent = '';
      } else {
        const main = document.createElement('span');
        main.className = 'comparison-metric-line';
        main.textContent = parts.absText;
        td.appendChild(main);
        if (showDelta) {
          const line2 = document.createElement('span');
          line2.className = 'comparison-delta-line';
          line2.textContent = parts.deltaLineText;
          td.appendChild(line2);
        }
        if (showPercent) {
          const linePct = document.createElement('span');
          linePct.className = 'comparison-percent-line';
          linePct.textContent = parts.percentText;
          td.appendChild(linePct);
        }
      }
      row.appendChild(td);
    });

    // Filler cell
    const fillerTd = document.createElement('td');
    fillerTd.style.cssText = 'border: none; background: transparent;';
    row.appendChild(fillerTd);

    tbody.appendChild(row);
  });
  table.appendChild(tbody);

  // Footer row with remove buttons (visually outside table)
  const tfoot = document.createElement('tfoot');
  const footRow = document.createElement('tr');
  footRow.appendChild(document.createElement('td'));
  C.comparisonColumns.forEach((colKey, colIdx) => {
    const td = document.createElement('td');
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-col-btn';
    removeBtn.innerHTML = '<span>\u00d7</span><span>remove</span>';
    removeBtn.title = 'Remove column';
    removeBtn.addEventListener('click', () => {
      C.comparisonColumns.splice(colIdx, 1);
      renderComparisonTable();
    });
    td.appendChild(removeBtn);
    footRow.appendChild(td);
  });
  footRow.appendChild(document.createElement('td')); // filler
  tfoot.appendChild(footRow);
  table.appendChild(tfoot);

  // Column drag-and-drop reordering
  (function initColDrag() {
    let dragIdx = null;
    let dropIdx = null;

    function clearDropIndicators() {
      table.querySelectorAll('.cmp-drop-left, .cmp-drop-right').forEach(el => {
        el.classList.remove('cmp-drop-left', 'cmp-drop-right');
      });
    }

    function setDraggingClass(idx, on) {
      table.querySelectorAll('[data-col-idx="' + idx + '"]').forEach(el => {
        el.classList.toggle('cmp-dragging', on);
      });
    }

    function getCellsForCol(idx) {
      return table.querySelectorAll('[data-col-idx="' + idx + '"]');
    }

    headerRow.querySelectorAll('th.metric-col').forEach(th => {
      th.addEventListener('dragstart', function(e) {
        dragIdx = parseInt(th.dataset.colIdx);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', '' + dragIdx);
        // Create a small drag image
        const ghost = document.createElement('div');
        ghost.textContent = th.textContent;
        ghost.style.cssText = 'position:absolute;top:-9999px;padding:4px 10px;background:rgba(0,0,0,0.08);border:1px solid rgba(0,0,0,0.2);border-radius:4px;font-size:0.8rem;font-weight:600;color:rgba(0,0,0,0.5);white-space:nowrap;';
        document.body.appendChild(ghost);
        e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, ghost.offsetHeight / 2);
        requestAnimationFrame(() => document.body.removeChild(ghost));
        setTimeout(() => setDraggingClass(dragIdx, true), 0);
      });

      th.addEventListener('dragend', function() {
        if (dragIdx !== null) setDraggingClass(dragIdx, false);
        clearDropIndicators();
        if (dragIdx !== null && dropIdx !== null && dragIdx !== dropIdx) {
          const moved = C.comparisonColumns.splice(dragIdx, 1)[0];
          const insertAt = dropIdx > dragIdx ? dropIdx - 1 : dropIdx;
          C.comparisonColumns.splice(insertAt, 0, moved);
          renderComparisonTable();
        }
        dragIdx = null;
        dropIdx = null;
      });

      th.addEventListener('dragover', function(e) {
        if (dragIdx === null) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const targetIdx = parseInt(th.dataset.colIdx);
        if (targetIdx === dragIdx) { clearDropIndicators(); dropIdx = null; return; }
        clearDropIndicators();
        const rect = th.getBoundingClientRect();
        const midX = rect.left + rect.width / 2;
        if (e.clientX < midX) {
          dropIdx = targetIdx;
          getCellsForCol(targetIdx).forEach(el => el.classList.add('cmp-drop-left'));
        } else {
          dropIdx = targetIdx + 1;
          getCellsForCol(targetIdx).forEach(el => el.classList.add('cmp-drop-right'));
        }
      });

      th.addEventListener('dragleave', function() {
        // Only clear if actually leaving the header area
      });

      th.addEventListener('drop', function(e) {
        e.preventDefault();
      });
    });

    // Allow dragover on the table to keep drop targets active
    table.addEventListener('dragover', function(e) {
      if (dragIdx === null) return;
      e.preventDefault();
    });
  })();

  wrapper.appendChild(table);
  container.appendChild(wrapper);
  if (shouldReopenCmpPicker && C.comparisonColumns.length < 10) {
    const wrapEl = document.getElementById('cmp-add-metric-wrap');
    if (wrapEl) {
      openComparisonMetricPicker(wrapEl, new Set(C.comparisonColumns));
    }
  }
  updateComparisonDeltaControlState();
  updateBaselineButtonState();
}

function updateBaselineButtonState() {
  const btn = document.getElementById('compare-baseline-btn');
  if (!btn) return;
  if (C.comparisonBaselineId) {
    btn.className = 'btn btn-primary btn-sm';
  } else {
    btn.className = 'btn btn-secondary btn-sm';
  }
}

function initComparisonToolbar() {
  const compareBaselineBtn = document.getElementById('compare-baseline-btn');
  let deltaPopover = null;

  function createDeltaPopover() {
    const pop = document.createElement('div');
    pop.className = 'delta-popover';
    pop.innerHTML =
      '<div class="delta-popover-header">Delta Options</div>' +
      '<label class="delta-popover-option">' +
        '<input type="checkbox" id="cmp-show-delta"' + (C.showDeltaVsBaseline ? ' checked' : '') + '>' +
        ' Show \u0394' +
      '</label>' +
      '<label class="delta-popover-option">' +
        '<input type="checkbox" id="cmp-show-percent-delta"' + (C.showComparisonPercentDelta ? ' checked' : '') + '>' +
        ' Show % \u0394' +
      '</label>';

    pop.querySelector('#cmp-show-delta').addEventListener('change', function() {
      C.showDeltaVsBaseline = this.checked;
      renderComparisonTable();
    });
    pop.querySelector('#cmp-show-percent-delta').addEventListener('change', function() {
      C.showComparisonPercentDelta = this.checked;
      renderComparisonTable();
    });

    return pop;
  }

  function closeDeltaPopoverOutside(e) {
    if (deltaPopover && !deltaPopover.contains(e.target) && e.target !== compareBaselineBtn) {
      closeDeltaPopover();
    }
  }

  function closeDeltaPopoverEscape(e) {
    if (e.key === 'Escape') closeDeltaPopover();
  }

  function closeDeltaPopover() {
    if (deltaPopover) { deltaPopover.remove(); deltaPopover = null; }
    document.removeEventListener('click', closeDeltaPopoverOutside);
    document.removeEventListener('keydown', closeDeltaPopoverEscape);
  }

  function toggleDeltaPopover() {
    if (deltaPopover) {
      closeDeltaPopover();
      return;
    }
    deltaPopover = createDeltaPopover();
    compareBaselineBtn.parentElement.style.position = 'relative';
    compareBaselineBtn.parentElement.appendChild(deltaPopover);

    setTimeout(function() {
      document.addEventListener('click', closeDeltaPopoverOutside);
      document.addEventListener('keydown', closeDeltaPopoverEscape);
    }, 0);
  }

  if (compareBaselineBtn) {
    compareBaselineBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      toggleDeltaPopover();
    });
  }

  // Custom BCR exclusion checkbox listeners
  ['cmp-exc-emissions', 'cmp-exc-linelosses', 'cmp-exc-wildfire', 'cmp-exc-outage', 'cmp-exc-apply-main'].forEach(function(id) {
    const cb = document.getElementById(id);
    if (cb) cb.addEventListener('change', function() { renderComparisonTable(); });
  });

  const cmpDeltaModeEl = document.getElementById('cmp-delta-display-mode');
  if (cmpDeltaModeEl) {
    cmpDeltaModeEl.addEventListener('change', function() {
      C.comparisonDeltaDisplayMode = cmpDeltaModeEl.value === 'delta_only' ? 'delta_only' : 'values_plus_delta';
      renderComparisonTable();
    });
  }

  const cmpAutoSortEl = document.getElementById('cmp-auto-sort-columns');
  if (cmpAutoSortEl) {
    cmpAutoSortEl.addEventListener('change', function() {
      C.comparisonAutoSort = cmpAutoSortEl.checked;
      if (C.comparisonAutoSort) {
        sortComparisonColumnsByCatalog();
        renderComparisonTable();
      }
    });
  }
}

function formatDeltaLine(baselineScenario, rowScenario, metricKey) {
  const config = getMetricConfig(metricKey);
  if (!config || !baselineScenario || rowScenario.id === baselineScenario.id) return null;
  if (!metricSupportsComparisonDelta(metricKey)) return null;
  const a = getMetricNumericOrNull(baselineScenario, metricKey);
  const b = getMetricNumericOrNull(rowScenario, metricKey);
  if (a === null || b === null) return 'Δ —';
  const d = comparisonDelta(a, b, metricKey);
  if (config.format === 'currency') return 'Δ ' + formatSignedCurrencyValue(d, 0);
  if (config.format === 'number3') return 'Δ ' + formatSignedNumberValue(d, 3);
  if (config.format === 'number2') return 'Δ ' + formatSignedNumberValue(d, 2);
  if (config.format === 'percent_decimal') return 'Δ ' + formatSignedNumberValue(d * 100, 2) + '%';
  return 'Δ ' + formatSignedNumberValue(d, 0);
}

/** Signed percent vs baseline; baseline row / missing nums / baseline 0 → null (caller uses only when includePercent). */
function formatPercentDeltaLine(baselineScenario, rowScenario, metricKey) {
  const config = getMetricConfig(metricKey);
  if (!config || !baselineScenario || rowScenario.id === baselineScenario.id) return null;
  if (!metricSupportsComparisonDelta(metricKey)) return null;
  const a = getMetricNumericOrNull(baselineScenario, metricKey);
  const b = getMetricNumericOrNull(rowScenario, metricKey);
  if (a === null || b === null || a === 0) return '—';
  const pct = (comparisonDelta(a, b, metricKey) / a) * 100;
  if (!isFinite(pct)) return '—';
  const t = pct.toFixed(1);
  if (pct > 0) return '+' + t + '%';
  return t + '%';
}

/**
 * Shared pipeline for comparison table, Copy TSV, and PNG.
 * deltaPlain strips the leading "Δ " from formatDeltaLine for spreadsheet Δ columns.
 */
function getDeltaDisplayParts(baselineScenario, rowScenario, metricKey, includePercent) {
  const config = getMetricConfig(metricKey);
  const val = getMetricValue(rowScenario, metricKey);
  const absText = formatMetricValue(val, config?.format);
  if (!config || !baselineScenario || rowScenario.id === baselineScenario.id) {
    return { absText, deltaLineText: null, deltaPlain: null, percentText: null };
  }
  const deltaLineText = formatDeltaLine(baselineScenario, rowScenario, metricKey);
  let deltaPlain = null;
  if (deltaLineText) {
    deltaPlain = deltaLineText.startsWith('Δ ') ? deltaLineText.slice(2) : deltaLineText;
  }
  let percentText = null;
  if (includePercent) {
    percentText = formatPercentDeltaLine(baselineScenario, rowScenario, metricKey);
  }
  return { absText, deltaLineText, deltaPlain, percentText };
}

function comparisonMetricLabel(metricKey) {
  for (const group of COMPARISON_METRICS) {
    for (const m of group.metrics) {
      if (m.key === metricKey) return m.label;
    }
  }
  return metricKey;
}



  // Public API
  window.renderComparisonTable = renderComparisonTable;
  window.syncComparisonSelectAllCheckbox = syncComparisonSelectAllCheckbox;
  window.sortComparisonColumnsByCatalog = sortComparisonColumnsByCatalog;
  window.initComparisonToolbar = initComparisonToolbar;
  window.updateComparisonDeltaControlState = updateComparisonDeltaControlState;
  window.updateBaselineButtonState = updateBaselineButtonState;
  window.comparisonMetricLabel = comparisonMetricLabel;
  window.getMetricConfig = getMetricConfig;
  window.getMetricValue = getMetricValue;
  window.formatMetricValue = formatMetricValue;
  window.getDeltaDisplayParts = getDeltaDisplayParts;
  window.formatDeltaLine = formatDeltaLine;
  window.formatPercentDeltaLine = formatPercentDeltaLine;
})();
