// FORGE Utility Functions
// Extracted from index.html — loaded via <script src="/static/utils.js">

(function() {
'use strict';


let activeTooltip = null;

// --- Always-solving architecture ---
function debounce(fn, ms) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

function showToast(msg, durationMs = 4000) {
  const existing = document.querySelectorAll('.toast-notification').length;
  const el = document.createElement('div');
  el.className = 'toast-notification visible';
  el.style.bottom = (1.5 + existing * 3.5) + 'rem';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => { el.classList.remove('visible'); setTimeout(() => el.remove(), 300); }, durationMs);
}

function showRestoreDefaultsDialog(storageKey, scopeLabel, onConfirm) {
  const suppressed = localStorage.getItem(storageKey) === 'true';
  if (suppressed) { onConfirm(); return; }
  const overlay = document.createElement('div');
  overlay.className = 'confirm-dialog-overlay';
  const dialog = document.createElement('div');
  dialog.className = 'confirm-dialog';
  dialog.innerHTML = `
    <div class="confirm-dialog-title">Restore canonical defaults?</div>
    <div class="confirm-dialog-body">This will reset all values in ${scopeLabel} to the SOURCE defaults for your current project configuration. Any custom overrides will be lost.</div>
    <label class="confirm-dialog-suppress"><input type="checkbox" id="suppress-restore-check"> Don't show this warning again</label>
    <div class="confirm-dialog-buttons">
      <button type="button" class="confirm-btn-cancel">Cancel</button>
      <button type="button" class="confirm-btn-confirm">Restore Defaults</button>
    </div>`;
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  dialog.querySelector('.confirm-btn-cancel').addEventListener('click', () => overlay.remove());
  dialog.querySelector('.confirm-btn-confirm').addEventListener('click', () => {
    if (dialog.querySelector('#suppress-restore-check').checked) localStorage.setItem(storageKey, 'true');
    overlay.remove();
    onConfirm();
  });
}

function milesToAcres(miles, rowWidthFeet) {
  return (miles * 5280 * rowWidthFeet) / 43560;
}

function computeTerrainAcres(terrainMilesMap, rowWidthFeet) {
  const acres = {};
  for (const [terrain, miles] of Object.entries(terrainMilesMap)) {
    if (miles > 0) acres[terrain] = milesToAcres(miles, rowWidthFeet);
  }
  return acres;
}

function computeEffectiveAcres(terrainAcres, upliftFactor) {
  const eff = {};
  for (const [terrain, acres] of Object.entries(terrainAcres)) {
    eff[terrain] = acres * upliftFactor;
  }
  return eff;
}

function computeTotalEffectiveAcres(terrainAcres, upliftFactor) {
  const total = Object.values(terrainAcres).reduce((s, a) => s + a, 0);
  return total * upliftFactor;
}

let _modalCallback = null;
function showModal(title, message, onConfirm, confirmLabel, confirmClass) {
  const overlay = document.getElementById('modal-overlay');
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-message').textContent = message;
  _modalCallback = onConfirm;
  overlay.classList.add('visible');
  const cancel = document.getElementById('modal-cancel');
  const confirm = document.getElementById('modal-confirm');
  confirm.textContent = confirmLabel || 'Confirm';
  confirm.className = confirmClass || 'btn btn-primary';
  cancel.className = 'btn btn-secondary';
  const onCancel = () => { hideModal(); cancel.removeEventListener('click', onCancel); confirm.removeEventListener('click', onOk); };
  const onOk = () => { if (_modalCallback) _modalCallback(); hideModal(); cancel.removeEventListener('click', onCancel); confirm.removeEventListener('click', onOk); };
  cancel.addEventListener('click', onCancel);
  confirm.addEventListener('click', onOk);
}

function hideModal() {
  document.getElementById('modal-overlay').classList.remove('visible');
  _modalCallback = null;
}

function getValueAtPath(obj, path) {
  if (!obj || !path) return undefined;
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

function setValueAtPath(obj, path, value) {
  const parts = path.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (current[parts[i]] == null) current[parts[i]] = {};
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
}

function btnLabel(btn) {
  return btn.childNodes[0]?.textContent?.trim() || btn.textContent.trim();
}

function formatTimestamp(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const mon = months[d.getMonth()];
  const day = String(d.getDate()).padStart(2, '0');
  const yr = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${mon} ${day} ${yr} ${hh}.${mm}.${ss}`;
}

function flattenObject(obj, prefix) {
  const rows = [];
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    const fullPath = prefix ? prefix + '.' + key : key;
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      rows.push(...flattenObject(val, fullPath));
    } else {
      rows.push({ path: fullPath, value: val });
    }
  }
  return rows;
}

function csvEscape(str) {
  if (str == null) return '';
  str = String(str);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

function showTooltip(helpIcon) {
  hideTooltip(); // Remove any existing tooltip

  const text = helpIcon.dataset.tooltip;
  if (!text) return;

  const tooltip = document.createElement('div');
  tooltip.className = 'help-tooltip';
  tooltip.textContent = text;

  const arrow = document.createElement('div');
  arrow.className = 'help-tooltip-arrow';
  tooltip.appendChild(arrow);

  document.body.appendChild(tooltip);
  activeTooltip = tooltip;

  // Get positions
  const iconRect = helpIcon.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const padding = 10;

  // Calculate ideal centered position
  let left = iconRect.left + (iconRect.width / 2) - (tooltipRect.width / 2);
  let top = iconRect.top - tooltipRect.height - 8;

  // Adjust for left edge
  if (left < padding) {
    left = padding;
  }

  // Adjust for right edge
  if (left + tooltipRect.width > viewportWidth - padding) {
    left = viewportWidth - tooltipRect.width - padding;
  }

  // If not enough space above, show below
  if (top < padding) {
    top = iconRect.bottom + 8;
    arrow.className = 'help-tooltip-arrow arrow-top';
  } else {
    arrow.className = 'help-tooltip-arrow arrow-bottom';
  }

  // Position arrow relative to icon center
  const arrowLeft = iconRect.left + (iconRect.width / 2) - left;
  arrow.style.left = Math.max(10, Math.min(arrowLeft, tooltipRect.width - 10)) + 'px';
  arrow.style.transform = 'translateX(-50%)';

  tooltip.style.left = left + 'px';
  tooltip.style.top = top + 'px';
}

function hideTooltip() {
  if (activeTooltip) {
    activeTooltip.remove();
    activeTooltip = null;
  }
}

function showMethodologyTooltip(icon) {
  const existing = document.querySelector('.methodology-tooltip');
  if (existing) { existing.remove(); return; }

  const key = icon.dataset.tabKey;
  const data = TAB_TOOLTIP_CONTENT[key];
  if (!data) return;

  const tooltip = document.createElement('div');
  tooltip.className = 'methodology-tooltip';
  const gloss = document.createElement('span');
  gloss.className = 'tooltip-gloss';
  gloss.textContent = data.gloss;
  tooltip.appendChild(gloss);
  if (data.appendixRef && data.appendixPage) {
    const link = document.createElement('a');
    link.className = 'tooltip-appendix-link';
    link.href = '/static/appendix.pdf#page=' + data.appendixPage;
    link.target = '_blank';
    link.textContent = '\u{1F4C4} See appendix \u00a7' + data.appendixRef + ' (p.' + data.appendixPage + ') \u2192';
    tooltip.appendChild(link);
  }
  icon.style.position = 'relative';
  icon.appendChild(tooltip);

  const ttRect = tooltip.getBoundingClientRect();
  const tabBar = icon.closest('.tabs, .sub-tabs, .sub-sub-tabs');
  const clearance = tabBar ? tabBar.getBoundingClientRect().top : 0;
  if (ttRect.top < clearance) {
    tooltip.style.bottom = 'auto';
    tooltip.style.top = 'calc(100% + 8px)';
  }
  const ttRect2 = tooltip.getBoundingClientRect();
  if (ttRect2.left < 8) {
    tooltip.style.left = '0';
    tooltip.style.transform = 'none';
  } else if (ttRect2.right > window.innerWidth - 8) {
    tooltip.style.left = 'auto';
    tooltip.style.right = '0';
    tooltip.style.transform = 'none';
  }

  const dismiss = function(ev) {
    if (!tooltip.contains(ev.target) && ev.target !== icon) {
      tooltip.remove();
      document.removeEventListener('click', dismiss);
    }
  };
  setTimeout(function() { document.addEventListener('click', dismiss); }, 0);
}

function makeMethodologyIcon(tabKey) {
  const icon = document.createElement('span');
  icon.className = 'methodology-icon';
  icon.textContent = '?';
  icon.dataset.tabKey = tabKey;
  icon.addEventListener('click', function(e) {
    e.stopPropagation();
    showMethodologyTooltip(icon);
  });
  return icon;
}

function formatDollar(n) {
  if (n == null || isNaN(n)) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (abs >= 1e9) return sign + '$' + (abs / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return sign + '$' + (abs / 1e6).toFixed(2) + 'M';
  if (abs >= 1e3) return sign + '$' + (abs / 1e3).toFixed(1) + 'K';
  return sign + '$' + abs.toFixed(0);
}

function deriveDefaultApiBase(currentUrl, defaultPort) {
  try {
    const url = new URL(currentUrl);
    if (url.protocol === "file:") {
      return `http://127.0.0.1:${defaultPort}`;
    }

    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
      url.port = String(defaultPort);
    }
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.origin;
  } catch (error) {
    return `http://127.0.0.1:${defaultPort}`;
  }
}

function parseValues(raw) {
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length)
    .map((value) => Number(value))
    .filter((value) => !Number.isNaN(value));
}

async function readFileAsJson(file) {
  const text = await file.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error("The selected file is not valid JSON.");
  }
}

// Format numbers for display
function formatNumber(value, decimals = 0) {
  if (value === null || value === undefined) return 'N/A';
  const num = Number(value);
  if (isNaN(num)) return String(value);
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function formatCurrency(value, decimals = 0) {
  if (value === null || value === undefined) return 'N/A';
  const num = Number(value);
  if (isNaN(num)) return String(value);
  const sign = num < 0 ? '-' : '';
  const absNum = Math.abs(num);
  return sign + '$' + absNum.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function formatSignedCurrencyValue(value, decimals = 0) {
  const num = Number(value);
  if (isNaN(num)) return String(value);
  const absNum = Math.abs(num);
  const dollars = '$' + absNum.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
  if (num > 0) return '+' + dollars;
  if (num < 0) return '-' + dollars;
  return dollars;
}

function formatSignedNumberValue(value, decimals = 0) {
  const num = Number(value);
  if (isNaN(num)) return String(value);
  const absStr = Math.abs(num).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
  if (num > 0) return '+' + absStr;
  if (num < 0) return '-' + absStr;
  return absStr;
}

function humanizeLabel(key) {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase())
    .replace(/Mw\b/g, 'MW')
    .replace(/Mwh\b/g, 'MWh')
    .replace(/Pv\b/g, 'PV')
    .replace(/Afudc\b/g, 'AFUDC')
    .replace(/Bcr\b/g, 'BCR')
    .replace(/Co2\b/g, 'CO2')
    .replace(/Sox\b/g, 'SOx')
    .replace(/Nox\b/g, 'NOx')
    .replace(/Eal\b/g, 'EAL')
    .replace(/Eac\b/g, 'EAC');
}

// --- Structured output helpers ---
function safeGet(obj, path, defaultVal = 0) {
  return path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : defaultVal), obj);
}

const TAB_TOOLTIP_CONTENT = {
  'project-technical': { gloss: 'Physical, electrical, and geographic project definition', appendixRef: 'Utilities', appendixPage: 2 },
  'benefits': { gloss: 'Grid economics and constraint parameters', appendixRef: 'System Constraints and Relief', appendixPage: 5 },
  'financial': { gloss: 'Discount rates, financing, and AFUDC', appendixRef: 'Financial Parameters', appendixPage: 3 },
  'capital-costs': { gloss: 'Upfront construction costs', appendixRef: 'Hard Costs', appendixPage: 9 },
  'operational': { gloss: 'Recurring maintenance and insurance', appendixRef: 'Soft Costs', appendixPage: 18 },
  'delay-costs': { gloss: 'Pre-construction delay period expenses', appendixRef: 'Base Delay Costs', appendixPage: 27 },
  'emissions': { gloss: 'Fuel mix, line losses, and emission costs', appendixRef: 'Emissions Costs', appendixPage: 37 },
  'risk': { gloss: 'Wildfire and outage risk assumptions', appendixRef: 'Risk Costs', appendixPage: 32 },
  'technology': { gloss: 'Construction type, AC/DC, capacity', appendixRef: 'Utilities', appendixPage: 2 },
  'timeline': { gloss: 'Construction years, delay, lifetime', appendixRef: 'Financial Parameters', appendixPage: 3 },
  'routing': { gloss: 'Route terrain and right-of-way zones', appendixRef: 'Weighted Miles', appendixPage: 2 },
  'conductor-details': { gloss: 'Wire selection and electrical parameters', appendixRef: 'Energy Losses', appendixPage: 23 },
  'structure-details': { gloss: 'Tower density by terrain', appendixRef: 'Build Costs', appendixPage: 9 },
  'converter-details': { gloss: 'DC converter station parameters', appendixRef: 'Build Costs', appendixPage: 9 },
  'rates': { gloss: 'WACC, inflation, social discount rate', appendixRef: 'Financial Parameters', appendixPage: 3 },
  'afudc': { gloss: 'Construction-period capitalization rules', appendixRef: 'AFUDC and Rate Base', appendixPage: 4 },
  'conductor': { gloss: 'Per-mile conductor build costs', appendixRef: 'Build Costs', appendixPage: 9 },
  'structure': { gloss: 'Per-mile structure build costs', appendixRef: 'Build Costs', appendixPage: 9 },
  'converter': { gloss: 'Per-station converter build costs', appendixRef: 'Build Costs', appendixPage: 9 },
  'environmental-mitigation': { gloss: 'Restoration and offset costs', appendixRef: 'Environmental Mitigation', appendixPage: 14 },
  'operational-insurance': { gloss: 'Annual asset insurance premiums', appendixRef: 'Operational Insurance', appendixPage: 20 },
  'maintenance-costs': { gloss: 'Asset maintenance by component', appendixRef: 'O&M', appendixPage: 18 },
  'vegetation-management': { gloss: 'Per-mile vegetation clearance costs', appendixRef: 'O&M', appendixPage: 18 },
  'wildfire-risk': { gloss: 'Ignition rates and loss severity', appendixRef: 'Expected Cost of Wildfires', appendixPage: 32 },
  'outage-risk': { gloss: 'Outage frequency, duration, exposure', appendixRef: 'Expected Cost of Outages', appendixPage: 34 },
  'energy-emissions-energy': { gloss: 'Fuel mix and loss parameters', appendixRef: 'Energy Losses', appendixPage: 23 },
  'energy-emissions-emissions': { gloss: 'Emission intensities and externality costs', appendixRef: 'Emissions Costs', appendixPage: 37 },
  'economic-details': { gloss: 'Value of load and lost load', appendixRef: 'System Constraints and Relief', appendixPage: 5 },
  'system-constraints': { gloss: 'Congestion severity (binding hours, exceedance, pricing)', appendixRef: 'System Constraints and Relief', appendixPage: 5 },
  'terrain-mix': { gloss: 'Miles and multipliers by terrain type', appendixRef: 'Weighted Miles', appendixPage: 2 },
  'rights-of-way': { gloss: 'Land acquisition and holding zones', appendixRef: 'Capital ROW Costs', appendixPage: 11 },
  'base-mitigation': { gloss: 'Per-acre restoration by terrain', appendixRef: 'Environmental Mitigation', appendixPage: 14 },
  'credits': { gloss: 'Wetland and habitat offset costs', appendixRef: 'Environmental Mitigation', appendixPage: 14 },
  'conductor-maintenance': { gloss: 'Annual conductor maintenance rate', appendixRef: 'O&M', appendixPage: 18 },
  'structure-maintenance': { gloss: 'Per-structure annual maintenance', appendixRef: 'O&M', appendixPage: 18 },
  'converter-maintenance': { gloss: 'Annual converter station maintenance', appendixRef: 'O&M', appendixPage: 18 },
  'wf-severity': { gloss: 'Dollar loss per ignition event', appendixRef: 'Expected Cost of Wildfires', appendixPage: 32 },
  'wf-ignition-profile': { gloss: 'Terrain ignition rates and escalation', appendixRef: 'Expected Cost of Wildfires', appendixPage: 32 },
  'out-exposure': { gloss: 'Capacity-at-risk factor', appendixRef: 'Expected Cost of Outages', appendixPage: 34 },
  'out-outage-profile': { gloss: 'Terrain outage rates and durations', appendixRef: 'Expected Cost of Outages', appendixPage: 34 },
  'energy-mix': { gloss: 'Fuel shares and growth rates', appendixRef: 'Energy Losses', appendixPage: 23 },
  'energy-losses': { gloss: 'Loss compensation and conductor parameters', appendixRef: 'Thermal Loss Costs', appendixPage: 25 },
  'emission-intensities': { gloss: 'kg pollutant per MWh by fuel', appendixRef: 'Emissions Costs', appendixPage: 37 },
  'emission-externality-costs': { gloss: 'Societal cost per kg pollutant', appendixRef: 'Emissions Costs', appendixPage: 37 },
  'congestion': { gloss: 'Binding hours, exceedance, pricing', appendixRef: 'System Constraints and Relief', appendixPage: 5 },
};

function showMultiplierConfirmDialog(anchorEl, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-dialog-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'confirm-dialog';
  dialog.innerHTML = `
    <div class="confirm-dialog-title">Override terrain multipliers?</div>
    <div class="confirm-dialog-body">These values are sourced from SOURCE and reflect standard cost adjustments by terrain type. Most users should keep the defaults.</div>
    <label class="confirm-dialog-suppress"><input type="checkbox" id="suppress-multiplier-check"> Don't show this warning again</label>
    <div class="confirm-dialog-buttons">
      <button type="button" class="confirm-btn-cancel">Keep Defaults</button>
      <button type="button" class="confirm-btn-confirm">Edit Multipliers</button>
    </div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  dialog.querySelector('.confirm-btn-cancel').addEventListener('click', () => {
    overlay.remove();
  });
  dialog.querySelector('.confirm-btn-confirm').addEventListener('click', () => {
    const suppress = dialog.querySelector('#suppress-multiplier-check').checked;
    overlay.remove();
    onConfirm(suppress);
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

function makeHelpIcon(text) {
  const icon = document.createElement('span');
  icon.className = 'help-icon';
  icon.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/><text x="8" y="12" text-anchor="middle" font-size="10" fill="currentColor">?</text></svg>';
  icon.dataset.tooltip = text;
  return icon;
}

// =============================================
// Terrain Miles Total (used by routing validation)
// =============================================
function calculateTerrainMilesTotal() {
  const terrainFields = [
    '02_project_physical_details.terrain.terrain_miles.forested',
    '02_project_physical_details.terrain.terrain_miles.scrubbed_flat',
    '02_project_physical_details.terrain.terrain_miles.wetland',
    '02_project_physical_details.terrain.terrain_miles.farmland',
    '02_project_physical_details.terrain.terrain_miles.desert_barren',
    '02_project_physical_details.terrain.terrain_miles.urban',
    '02_project_physical_details.terrain.terrain_miles.rolling_hills',
    '02_project_physical_details.terrain.terrain_miles.mountain',
    '02_project_physical_details.terrain.terrain_miles.subsea'
  ];

  let total = 0;
  terrainFields.forEach(path => {
    const input = document.querySelector(`input[data-path="${path}"]`);
    if (input) {
      const value = parseNumberInput(input.value);
      if (value !== null) total += value;
    }
  });
  return total;
}

// Helper: hide the first section-header-row after a tab-section-header if its text matches any in the list
function hideFirstDuplicateSubheader(tabHeader, matchTexts) {
  let sibling = tabHeader.nextElementSibling;
  while (sibling && !sibling.classList.contains('tab-section-header')) {
    if (sibling.classList.contains('section-header-row')) {
      const innerHeader = sibling.querySelector('.section-header, .subsection-header');
      if (innerHeader) {
        const innerText = innerHeader.textContent.trim().toLowerCase();
        if (matchTexts.some(t => innerText === t)) {
          sibling.style.display = 'none';
          break;
        }
      }
    }
    sibling = sibling.nextElementSibling;
  }
}



  // Public API
  window.debounce = debounce;
  window.showToast = showToast;
  window.showRestoreDefaultsDialog = showRestoreDefaultsDialog;
  window.showModal = showModal;
  window.hideModal = hideModal;
  window.getValueAtPath = getValueAtPath;
  window.setValueAtPath = setValueAtPath;
  window.btnLabel = btnLabel;
  window.formatTimestamp = formatTimestamp;
  window.flattenObject = flattenObject;
  window.csvEscape = csvEscape;
  window.parseCsvLine = parseCsvLine;
  window.showTooltip = showTooltip;
  window.hideTooltip = hideTooltip;
  window.showMethodologyTooltip = showMethodologyTooltip;
  window.makeMethodologyIcon = makeMethodologyIcon;
  window.makeHelpIcon = makeHelpIcon;
  window.formatDollar = formatDollar;
  window.deriveDefaultApiBase = deriveDefaultApiBase;
  window.parseValues = parseValues;
  window.readFileAsJson = readFileAsJson;
  window.formatNumber = formatNumber;
  window.formatCurrency = formatCurrency;
  window.formatSignedCurrencyValue = formatSignedCurrencyValue;
  window.formatSignedNumberValue = formatSignedNumberValue;
  window.humanizeLabel = humanizeLabel;
  window.safeGet = safeGet;
  window.showMultiplierConfirmDialog = showMultiplierConfirmDialog;
  window.calculateTerrainMilesTotal = calculateTerrainMilesTotal;
  window.hideFirstDuplicateSubheader = hideFirstDuplicateSubheader;
  window.milesToAcres = milesToAcres;
  window.computeTerrainAcres = computeTerrainAcres;
  window.computeEffectiveAcres = computeEffectiveAcres;
  window.computeTotalEffectiveAcres = computeTotalEffectiveAcres;
})();
