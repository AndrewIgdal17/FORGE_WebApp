// FORGE Results Renderer
// Extracted from index.html — loaded via <script src="/static/results-renderer.js">

(function() {
'use strict';
const C = window.FORGE;

// "Run Comparison" button state management
function updateDesignCmpRunButton() {
  const btn = document.getElementById('design-cmp-run-btn');
  if (!btn) return;
  const cap = document.getElementById('design-cmp-capacity');
  const cond = document.getElementById('design-cmp-conductor');
  const ready = cap && cap.value && cond && cond.value;
  btn.disabled = !ready;
  btn.style.background = ready ? '#10b981' : '#ccc';
  btn.style.cursor = ready ? 'pointer' : 'not-allowed';
  btn.style.opacity = ready ? '1' : '0.6';
}

function populateDesignCmpDropdowns() {
  const acDcEl = document.querySelector('select[data-path="01_project_technical_details.project.ac_dc"]');
  const acDc = acDcEl ? acDcEl.value : 'AC';
  const constructionEl = document.querySelector('select[data-path="01_project_technical_details.project.construction_type"]');
  const constructionType = constructionEl ? constructionEl.value : 'Overhead';

  const capSelect = document.getElementById('design-cmp-capacity');
  if (capSelect) {
    const current = capSelect.value;
    const opts = CAPACITY_OPTIONS_BY_AC_DC[acDc] || CAPACITY_OPTIONS_BY_AC_DC['AC'];
    capSelect.innerHTML = '<option value="">(None)</option>';
    opts.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v + ' MW';
      if (String(v) === String(current)) opt.selected = true;
      capSelect.appendChild(opt);
    });
  }

  const condSelect = document.getElementById('design-cmp-conductor');
  if (condSelect) {
    const current = condSelect.value;
    const condOpts = CONDUCTOR_TYPE_BY_CONSTRUCTION[constructionType] || ['Standard Aluminum Conductor'];
    condSelect.innerHTML = '<option value="">(None)</option>';
    condOpts.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      if (v === current) opt.selected = true;
      condSelect.appendChild(opt);
    });
  }
}

function updateDesignCmpPrimaryReadout() {
  const readout = document.getElementById('design-cmp-primary-readout');
  if (!readout) return;
  const get = path => {
    const el = document.querySelector(`[data-path="${path}"]`);
    return el ? (el.value || el.textContent) : '—';
  };
  const cap = get('01_project_technical_details.project.capacity_mw');
  const cond = get('01_project_technical_details.project.conductor_type');
  const acDc = get('01_project_technical_details.project.ac_dc');
  const ct = get('01_project_technical_details.project.construction_type');
  readout.innerHTML =
    `<div><strong>${cap} MW</strong> ${acDc} · ${ct}</div>` +
    `<div style="color: rgba(0,0,0,0.55);">${cond}</div>`;
}

function renderDesignComparison(results) {
  const container = document.getElementById('design-comparison-results');
  const hint = document.getElementById('design-cmp-run-hint');
  if (!container) return;

  const dc = results?.costs?.design_comparison;
  if (!dc) {
    container.style.display = 'none';
    if (hint) hint.style.display = '';
    return;
  }
  container.style.display = '';
  if (hint) hint.style.display = 'none';
  container.innerHTML = '';

  const p = dc.primary;
  const c = dc.comparison;
  const methods = dc.methods;

  const fNum = (n, d) => n != null ? Number(n).toLocaleString(undefined, {maximumFractionDigits: d ?? 0}) : '—';

  // Config summary cards
  const cardsGrid = document.createElement('div');
  cardsGrid.className = 'results-summary-grid';
  cardsGrid.style.gridTemplateColumns = '1fr 1fr';
  cardsGrid.style.marginBottom = '1.25rem';

  function configCard(title, cap, conductor, lossRate) {
    const card = document.createElement('div');
    card.className = 'results-summary-card forge-card';
    const lbl = document.createElement('div');
    lbl.className = 'results-summary-label';
    lbl.textContent = title;
    const val = document.createElement('div');
    val.className = 'results-summary-value';
    val.style.fontSize = '1.1rem';
    val.textContent = fNum(cap) + ' MW';
    const sub = document.createElement('div');
    sub.style.cssText = 'font-size: 0.82rem; color: rgba(0,0,0,0.55); margin-top: 0.25rem;';
    sub.textContent = conductor || '—';
    const rate = document.createElement('div');
    rate.style.cssText = 'font-size: 0.82rem; color: rgba(0,0,0,0.55); margin-top: 0.15rem;';
    rate.textContent = 'Loss rate: ' + (lossRate != null ? lossRate.toFixed(2) + '%' : '—');
    card.appendChild(lbl);
    card.appendChild(val);
    card.appendChild(sub);
    card.appendChild(rate);
    return card;
  }

  cardsGrid.appendChild(configCard('Your Project', p.capacity_mw, p.conductor_type, p.loss_percent));
  const altCard = configCard('Alternative', c.capacity_mw, c.conductor_type, c.loss_percent);
  altCard.classList.add('highlight', 'forge-card--highlight');
  cardsGrid.appendChild(altCard);
  container.appendChild(cardsGrid);

  // Method sections
  const section = document.createElement('div');
  section.className = 'cost-section-items';

  const methodEntries = [
    { key: 'direct', label: 'Direct Comparison', startExpanded: true },
    { key: 'counterfactual', label: 'Counterfactual Comparison', startExpanded: false },
    { key: 'normalized', label: 'Normalized Comparison', startExpanded: false },
  ];

  methodEntries.forEach((entry, idx) => {
    const m = methods[entry.key];

    const header = document.createElement('div');
    header.className = 'collapsible-header cf-method-header' + (entry.startExpanded ? ' expanded' : '');
    if (idx > 0) header.style.marginTop = '1rem';
    header.textContent = entry.label;
    section.appendChild(header);

    const body = document.createElement('div');
    body.className = 'collapsible-content' + (entry.startExpanded ? ' expanded' : '');

    body.appendChild(createNote(m.description));
    body.appendChild(numberItem('Loss Difference (MWh/yr)', fNum(m.delta_mwh_yr, 1)));
    body.appendChild(currencyItem('Annual Cost Difference', m.annual_cost));
    body.appendChild(currencyItem('Lifetime Nominal', m.lifetime_nominal));
    body.appendChild(createSubtotalRow('Net Present Value', m.npv));

    header.addEventListener('click', () => {
      header.classList.toggle('expanded');
      body.classList.toggle('expanded');
    });

    section.appendChild(body);
  });

  section.appendChild(createNote('Positive values mean the primary design has higher losses (costs more).'));
  container.appendChild(section);
}

function createSubtotalRow(label, value) {
  const row = document.createElement('div');
  row.className = 'results-subtotal';
  const labelEl = document.createElement('span');
  labelEl.className = 'results-item-label';
  labelEl.textContent = label;
  const valueEl = document.createElement('span');
  valueEl.className = 'results-item-value currency';
  const num = Number(value);
  valueEl.textContent = formatCurrency(num, 0);
  if (num < 0) valueEl.classList.add('negative');
  row.appendChild(labelEl);
  row.appendChild(valueEl);
  return row;
}

function createNote(text) {
  const note = document.createElement('div');
  note.className = 'results-note';
  note.textContent = text;
  return note;
}

function currencyItem(label, value) {
  return createResultItem(label, value, true);
}

function numberItem(label, value) {
  return createResultItem(label, value, false);
}

function createResultItem(label, value, isCurrency = false) {
  const item = document.createElement('div');
  item.className = 'results-item';

  const labelEl = document.createElement('span');
  labelEl.className = 'results-item-label';
  labelEl.textContent = humanizeLabel(label);

  const valueEl = document.createElement('span');
  valueEl.className = 'results-item-value';

  if (isCurrency) {
    const numValue = Number(value);
    valueEl.textContent = formatCurrency(value);
    valueEl.classList.add('currency');
    if (numValue < 0) {
      valueEl.classList.add('negative');
    }
  } else {
    valueEl.textContent = typeof value === 'number' ? formatNumber(value) : String(value);
  }

  item.appendChild(labelEl);
  item.appendChild(valueEl);
  return item;
}

function renderObjectAsResults(obj, container, isCurrency = false) {
  Object.entries(obj).forEach(([key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const subcategory = document.createElement('div');
      subcategory.className = 'results-subcategory';

      const title = document.createElement('div');
      title.className = 'results-subcategory-title';
      title.textContent = humanizeLabel(key);
      subcategory.appendChild(title);

      const grid = document.createElement('div');
      grid.className = 'results-grid';
      renderObjectAsResults(value, grid, isCurrency);
      subcategory.appendChild(grid);

      container.appendChild(subcategory);
    } else {
      // Primitive value - create item
      const item = createResultItem(key, value, isCurrency);
      container.appendChild(item);
    }
  });
}

function createCategory(title, content, isCollapsed = false) {
  const category = document.createElement('div');
  category.className = 'results-category';
  if (isCollapsed) category.classList.add('collapsed');

  const header = document.createElement('div');
  header.className = 'results-category-header';

  const h3 = document.createElement('h3');
  h3.textContent = title;

  const toggle = document.createElement('span');
  toggle.className = 'results-category-toggle';
  toggle.textContent = '▼';

  header.appendChild(h3);
  header.appendChild(toggle);

  header.addEventListener('click', () => {
    category.classList.toggle('collapsed');
  });

  const contentDiv = document.createElement('div');
  contentDiv.className = 'results-category-content';
  contentDiv.appendChild(content);

  category.appendChild(header);
  category.appendChild(contentDiv);

  return category;
}

C.CATEGORY_LABELS = {
  hard: 'Hard Costs', soft: 'Soft Costs',
  risk: 'Risk Costs', emissions: 'Line Loss Compensation Emissions',
  remedial: 'Remedial Benefits', enabling: 'Enabling Benefits',
  avoided_emissions: 'Avoided Emissions',
  transfer: 'Revenue (Transfer)', reporting: 'Transfers & Reporting',
};

C.COST_CATEGORY_ORDER = ['hard', 'soft', 'risk', 'emissions'];

function buildResultById(results) {
  const m = {};
  (results.taxonomy_results || []).forEach(r => { m[r.taxonomy_id] = r; });
  return m;
}

var COMPOSITION_COLORS = ['#0066cc', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd'];

function formatCompact(value) {
  var abs = Math.abs(value);
  var sign = value < 0 ? '-' : '';
  if (abs >= 1e9) return sign + '$' + (abs / 1e9).toFixed(1) + 'B';
  if (abs >= 1e6) return sign + '$' + (abs / 1e6).toFixed(0) + 'M';
  if (abs >= 1e3) return sign + '$' + (abs / 1e3).toFixed(0) + 'K';
  return sign + '$' + abs.toFixed(0);
}

function renderCompositionBar(segments) {
  var bar = document.createElement('div');
  bar.className = 'results-composition-bar';
  var total = segments.reduce(function(s, seg) { return s + seg.value; }, 0);
  if (total <= 0) return bar;

  segments.forEach(function(seg, i) {
    var pct = (seg.value / total) * 100;
    if (pct < 0.5) return;
    var el = document.createElement('div');
    el.className = 'results-composition-segment';
    el.style.width = pct + '%';
    el.style.background = COMPOSITION_COLORS[Math.min(i, COMPOSITION_COLORS.length - 1)];
    if (pct > 12) el.textContent = seg.label;
    el.title = seg.label + ': ' + formatCurrency(seg.value, 0) + ' (' + pct.toFixed(1) + '%)';
    bar.appendChild(el);
  });

  return bar;
}

function renderCompositionLegend(segments) {
  var legend = document.createElement('div');
  legend.className = 'results-composition-legend';
  legend.textContent = segments.map(function(s) {
    return s.label + ' ' + formatCompact(s.value);
  }).join(' \u00B7 ');
  return legend;
}

function renderSectionOverview(results, sectionType) {
  var container = document.createElement('div');
  if (!C.taxonomy) return container;
  var rid = buildResultById(results);

  var categories, parentTotal;
  if (sectionType === 'costs') {
    categories = C.COST_CATEGORY_ORDER;
  } else {
    categories = ['remedial', 'enabling', 'avoided_emissions'];
  }

  parentTotal = categories.reduce(function(s, b) {
    return s + (C.taxonomyByCategory[b] || []).reduce(function(ss, i) {
      return ss + (rid[i.id] ? rid[i.id].value_pv || 0 : 0);
    }, 0);
  }, 0);

  var heading = document.createElement('div');
  heading.className = 'results-section-total';
  var headLabel = document.createElement('div');
  headLabel.className = 'total-label';
  headLabel.textContent = sectionType === 'costs' ? 'Total Costs (PV)' : 'Total Benefits (PV)';
  var headValue = document.createElement('div');
  headValue.className = 'total-value';
  headValue.textContent = formatCurrency(parentTotal, 0);
  heading.appendChild(headLabel);
  heading.appendChild(headValue);
  container.appendChild(heading);

  categories.forEach(function(b) {
    var items = (C.taxonomyByCategory[b] || []);
    var categoryPV = items.reduce(function(s, i) {
      return s + (rid[i.id] ? rid[i.id].value_pv || 0 : 0);
    }, 0);
    if (categoryPV <= 0) return;

    var pct = parentTotal > 0 ? ((categoryPV / parentTotal) * 100).toFixed(0) : '0';

    var card = document.createElement('div');
    card.className = 'results-category-card';

    var title = document.createElement('div');
    title.className = 'category-title';
    title.textContent = (C.CATEGORY_LABELS && C.CATEGORY_LABELS[b]) || b;
    card.appendChild(title);

    var value = document.createElement('div');
    value.className = 'category-value';
    value.textContent = formatCurrency(categoryPV, 0);
    card.appendChild(value);

    var pctEl = document.createElement('div');
    pctEl.className = 'category-pct';
    pctEl.textContent = pct + '% of total ' + sectionType;
    card.appendChild(pctEl);

    var segments = items.map(function(i) {
      return { label: i.label, value: rid[i.id] ? rid[i.id].value_pv || 0 : 0 };
    }).filter(function(s) { return s.value > 0; })
      .sort(function(a, bb) { return bb.value - a.value; });

    card.appendChild(renderCompositionBar(segments));
    card.appendChild(renderCompositionLegend(segments));

    var subItemId = getSubItemIdForCategory(b);
    card.addEventListener('click', function() {
      if (typeof navigateToSubItem === 'function') {
        var sectionId = sectionType === 'costs' ? 'r-costs' : 'r-benefits';
        navigateToSubItem(sectionId, subItemId);
      }
    });

    container.appendChild(card);
  });

  return container;
}

function getSubItemIdForCategory(category) {
  var map = {
    hard: 'r-capital',
    soft: 'r-operational',
    risk: 'r-risk-costs',
    emissions: 'r-emissions-costs',
    remedial: 'r-remedial',
    enabling: 'r-loss-comp',
    avoided_emissions: 'r-emissions-costs'
  };
  return map[category] || 'r-capital';
}

function renderExpandableCard(item, rid, colorIndex, parentTotal) {
  var r = rid[item.id];
  var pv = r ? r.value_pv || 0 : 0;
  var pct = parentTotal > 0 ? ((pv / parentTotal) * 100).toFixed(0) : '0';
  var detailRows = r ? (r.detail_rows || r.detail || []) : [];
  var hasDetail = detailRows.length > 0;

  var card = document.createElement('div');
  card.className = 'results-detail-card';
  card.style.borderLeftColor = COMPOSITION_COLORS[Math.min(colorIndex, COMPOSITION_COLORS.length - 1)];

  var header = document.createElement('div');
  header.className = 'detail-header';

  var left = document.createElement('div');
  var label = document.createElement('div');
  label.className = 'detail-label';
  label.textContent = item.label;
  left.appendChild(label);

  var sublabel = document.createElement('div');
  sublabel.className = 'detail-sublabel';
  sublabel.textContent = pct + '% of category';
  if (hasDetail) sublabel.textContent += ' \u00B7 ' + detailRows.length + ' components';
  left.appendChild(sublabel);

  var right = document.createElement('div');
  right.style.cssText = 'display:flex;align-items:center;gap:0.5rem';
  var value = document.createElement('div');
  value.className = 'detail-value';
  value.textContent = formatCurrency(pv, 0);
  right.appendChild(value);

  if (hasDetail) {
    var chevron = document.createElement('span');
    chevron.className = 'detail-chevron';
    chevron.textContent = '\u25B8';
    right.appendChild(chevron);
  }

  header.appendChild(left);
  header.appendChild(right);
  card.appendChild(header);

  if (hasDetail) {
    var subrows = document.createElement('div');
    subrows.className = 'results-detail-subrows';
    detailRows.forEach(function(row) {
      var sr = document.createElement('div');
      sr.className = 'results-detail-subrow';
      var srLabel = document.createElement('span');
      srLabel.textContent = row.label || row.key || '';
      var srValue = document.createElement('span');
      srValue.className = 'subrow-value';
      srValue.textContent = formatCurrency(row.value_pv != null ? row.value_pv : (row.value || 0), 0);
      sr.appendChild(srLabel);
      sr.appendChild(srValue);
      subrows.appendChild(sr);
    });
    card.appendChild(subrows);

    card.addEventListener('click', function() {
      card.classList.toggle('expanded');
    });
  }

  return card;
}

function renderDetailDrillIn(results, categories) {
  var container = document.createElement('div');
  if (!C.taxonomy) return container;
  var rid = buildResultById(results);

  var allItems = [];
  categories.forEach(function(b) {
    var items = (C.taxonomyByCategory[b] || []).slice().sort(function(a, bb) {
      return a.display_order - bb.display_order;
    });
    allItems = allItems.concat(items);
  });

  var categoryTotal = allItems.reduce(function(s, i) {
    return s + (rid[i.id] ? rid[i.id].value_pv || 0 : 0);
  }, 0);

  var grandTotal = C.COST_CATEGORY_ORDER.reduce(function(s, b) {
    return s + (C.taxonomyByCategory[b] || []).reduce(function(ss, i) {
      return ss + (rid[i.id] ? rid[i.id].value_pv || 0 : 0);
    }, 0);
  }, 0);
  var pctOfTotal = grandTotal > 0 ? ((categoryTotal / grandTotal) * 100).toFixed(0) : '0';

  var heading = document.createElement('div');
  heading.className = 'results-section-total';
  var headLabel = document.createElement('div');
  headLabel.className = 'total-label';
  headLabel.textContent = ((C.CATEGORY_LABELS && C.CATEGORY_LABELS[categories[0]]) || categories[0]) + ' Costs (PV)';
  var headValue = document.createElement('div');
  headValue.className = 'total-value';
  headValue.textContent = formatCurrency(categoryTotal, 0);
  var headPct = document.createElement('div');
  headPct.className = 'total-pct';
  headPct.textContent = pctOfTotal + '% of total project costs';
  heading.appendChild(headLabel);
  heading.appendChild(headValue);
  heading.appendChild(headPct);
  container.appendChild(heading);

  var segments = allItems.map(function(i) {
    return { label: i.label, value: rid[i.id] ? rid[i.id].value_pv || 0 : 0 };
  }).filter(function(s) { return s.value > 0; })
    .sort(function(a, b) { return b.value - a.value; });

  container.appendChild(renderCompositionBar(segments));
  container.appendChild(renderCompositionLegend(segments));

  var cardsWrapper = document.createElement('div');
  cardsWrapper.style.marginTop = '1.25rem';
  allItems.filter(function(i) {
    return rid[i.id] && (rid[i.id].value_pv || 0) > 0;
  }).sort(function(a, b) {
    return (rid[b.id].value_pv || 0) - (rid[a.id].value_pv || 0);
  }).forEach(function(item, idx) {
    cardsWrapper.appendChild(renderExpandableCard(item, rid, idx, categoryTotal));
  });
  container.appendChild(cardsWrapper);

  return container;
}

function renderBenefitDrillIn(results, category, subgroup) {
  var container = document.createElement('div');
  if (!C.taxonomy) return container;
  var rid = buildResultById(results);

  var items = (C.taxonomyByCategory[category] || []).slice().sort(function(a, b) {
    return a.display_order - b.display_order;
  });
  if (subgroup) {
    items = items.filter(function(i) { return i.subgroup === subgroup; });
  }

  var categoryTotal = items.reduce(function(s, i) {
    return s + (rid[i.id] ? rid[i.id].value_pv || 0 : 0);
  }, 0);

  var heading = document.createElement('div');
  heading.className = 'results-section-total';
  var headLabel = document.createElement('div');
  headLabel.className = 'total-label';
  var labelKey = subgroup || category;
  headLabel.textContent = ((C.CATEGORY_LABELS && C.CATEGORY_LABELS[labelKey]) || labelKey) + ' Benefits (PV)';
  var headValue = document.createElement('div');
  headValue.className = 'total-value';
  headValue.textContent = formatCurrency(categoryTotal, 0);
  heading.appendChild(headLabel);
  heading.appendChild(headValue);
  container.appendChild(heading);

  var segments = items.map(function(i) {
    return { label: i.label, value: rid[i.id] ? rid[i.id].value_pv || 0 : 0 };
  }).filter(function(s) { return s.value > 0; });

  if (segments.length > 1) {
    container.appendChild(renderCompositionBar(segments));
    container.appendChild(renderCompositionLegend(segments));
  }

  var cardsWrapper = document.createElement('div');
  cardsWrapper.style.marginTop = '1.25rem';
  items.filter(function(i) {
    return rid[i.id] && (rid[i.id].value_pv || 0) > 0;
  }).forEach(function(item, idx) {
    cardsWrapper.appendChild(renderExpandableCard(item, rid, idx, categoryTotal));
  });
  container.appendChild(cardsWrapper);

  return container;
}

function exclOutputSuffix(groups) {
  const ORDER = ['avoided_emissions', 'emissions', 'line_losses', 'wildfire', 'outage'];
  const MAP = { avoided_emissions: 'avoided_emissions', emissions: 'emissions', line_losses: 'linelosses', wildfire: 'wildfire_risk', outage: 'outage_risk' };
  return ORDER.filter(g => groups.includes(g)).map(g => MAP[g]).join('_and_');
}

function deriveTaxonomyResultsFromLegacy(results) {
  const bcr = results.bcr || {};
  const costs = results.costs || {};
  const benefits = results.benefits || {};
  const cc = benefits.congestion || {};
  const rev = benefits.revenue || {};
  const wf = costs.wildfire || {};
  const out = costs.outage || {};
  const em = costs.emissions || {};
  const fac = benefits.facilitated_emissions || {};
  const ll = costs.line_loss || {};
  const build = costs.build || {};
  const row = costs.row || {};
  const env = costs.environmental || {};
  const om = costs.oandm || {};
  const ins = costs.insurance || {};
  const delay = costs.delay || {};
  const totalBuildNom = build.total_nominal || 0;
  function proportional(compNom, totalNom, totalPV) {
    return totalNom ? totalPV * compNom / totalNom : 0;
  }
  return [
    { taxonomy_id: 'build_conductor', value_pv: proportional(build.conductor_nominal||0, totalBuildNom, build.total_pv||0), value_nominal: build.conductor_nominal||0, detail: [] },
    { taxonomy_id: 'build_structure', value_pv: proportional(build.structure_nominal||0, totalBuildNom, build.total_pv||0), value_nominal: build.structure_nominal||0, detail: [] },
    { taxonomy_id: 'build_converter', value_pv: proportional(build.converter_nominal||0, totalBuildNom, build.total_pv||0), value_nominal: build.converter_nominal||0, detail: [] },
    { taxonomy_id: 'row_acquisition', value_pv: proportional(row.acquisition_nominal||0, row.row_capital_nominal||0, row.row_capital_pv||0), value_nominal: row.acquisition_nominal||0, detail: [] },
    { taxonomy_id: 'row_holding', value_pv: proportional(row.holding_nominal||0, row.row_capital_nominal||0, row.row_capital_pv||0), value_nominal: row.holding_nominal||0, detail: [] },
    { taxonomy_id: 'env_mitigation', value_pv: env.total_pv||0, value_nominal: env.total_nominal||0, detail: [] },
    { taxonomy_id: 'oandm', value_pv: om.total_pv||0, value_nominal: om.total_nominal||0, value_annual: om.total_annual||null, detail: [] },
    { taxonomy_id: 'insurance', value_pv: ins.pv_total||0, value_nominal: ins.nominal_lifetime_cost||0, value_annual: ins.annual_premium||null, detail: [] },
    { taxonomy_id: 'row_rent', value_pv: row.row_rent_pv||0, value_nominal: row.row_rent_nominal||0, detail: [] },
    { taxonomy_id: 'line_loss_conductor', value_pv: ll.line_cost_pv||0, value_nominal: ll.line_nominal_total||0, value_annual: ll.line_annual_cost||null, detail: [] },
    { taxonomy_id: 'line_loss_converter', value_pv: ll.converter_cost_pv||0, value_nominal: ll.converter_nominal_total||0, value_annual: ll.converter_annual_cost||null, detail: [] },
    { taxonomy_id: 'base_delay', value_pv: delay.total_pv||0, value_nominal: delay.total_nominal||0, detail: [] },
    { taxonomy_id: 'congestion_delay', value_pv: cc.congestion_delay_cost_pv||0, value_nominal: cc.congestion_delay_cost_nominal||0, detail: [] },
    { taxonomy_id: 'wildfire_eac', value_pv: wf.pv_cost||0, value_nominal: wf.nominal_total||0, value_annual: wf.EAL||null, detail: [] },
    { taxonomy_id: 'outage_eac', value_pv: out.pv_cost||0, value_nominal: out.nominal_total||0, value_annual: out.expected_annual_loss||null, detail: [
      { dimension: 'component', dimension_key: 'load_shed_per_event', value_pv: 0, value_annual: out.cost_loadshed || 0 },
      { dimension: 'component', dimension_key: 'redispatch_per_event', value_pv: 0, value_annual: out.cost_redispatch || 0 },
    ] },
    { taxonomy_id: 'emissions_comp', value_pv: em.total_pv||0, value_nominal: em.total_nominal||0, value_annual: em.annual_cost||null, detail: [] },
    { taxonomy_id: 'emissions_fac', value_pv: fac.fac_emissions_project_pv||0, value_nominal: fac.fac_emissions_project_nominal||0, detail: [] },
    { taxonomy_id: 'congestion_benefit', value_pv: cc.congestion_benefit_pv||0, value_nominal: cc.congestion_benefit_nominal||0, value_annual: cc.congestion_benefit_annual||null, detail: [] },
    { taxonomy_id: 'delivered_energy_benefit', value_pv: cc.delivered_benefit_pv||0, value_nominal: cc.delivered_benefit_nominal||0, value_annual: cc.delivered_benefit_annual||null, detail: [] },
    { taxonomy_id: 'revenue', value_pv: rev.revenue_pv||0, value_nominal: rev.revenue_nominal||0, value_annual: rev.annual_revenue||null, detail: [] },
    { taxonomy_id: 'avoided_emissions_benefit', value_pv: fac.displacement_avoided_benefit_pv||0, value_nominal: fac.displacement_avoided_benefit_nominal||0, detail: [] },
  ];
}

function renderSensitivityByTaxonomy(results) {
  const container = document.createElement('div');
  if (!C.taxonomy) return container;
  const bcr = results.bcr || {};
  const totalCostsPV = bcr.total_costs_pv || 0;
  const totalBenefitsPV = bcr.total_benefits_pv || 0;

  const exclDefs = Object.values(C.taxonomy.bcr_definitions)
    .filter(d => d.exclude_groups.length > 0)
    .sort((a, b) => a.display_order - b.display_order);

  const mainRows = [];
  const moreRows = [];

  exclDefs.forEach(def => {
    const suffix = exclOutputSuffix(def.exclude_groups);
    const exclCosts = bcr[`total_costs_excluding_${suffix}_pv`] || 0;
    const exclBenefits = bcr[`total_benefits_excluding_${suffix}_pv`] || 0;
    const row = {
      label: def.label,
      bcr: bcr[`bcr_excluding_${suffix}`] || 0,
      nb: bcr[`net_benefit_excluding_${suffix}_pv`] || 0,
      excludedCosts: totalCostsPV - exclCosts,
      excludedBenefits: totalBenefitsPV - exclBenefits,
    };
    const hasWf = def.exclude_groups.includes('wildfire');
    const hasOut = def.exclude_groups.includes('outage');
    if (hasWf === hasOut) mainRows.push(row); else moreRows.push(row);
  });

  function buildSensTable(rows) {
    const table = document.createElement('table');
    table.className = 'sensitivity-table';
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Exclusion</th><th>BCR</th><th>Net Benefit (PV)</th><th>Excluded Costs (PV)</th><th>Excluded Benefits (PV)</th></tr>';
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    rows.forEach(r => {
      const tr = document.createElement('tr');
      [r.label, formatNumber(r.bcr, 3), formatCurrency(r.nb, 0), formatCurrency(r.excludedCosts, 0), formatCurrency(r.excludedBenefits, 0)].forEach((text, i) => {
        const td = document.createElement('td');
        td.textContent = text;
        if (i === 2 && r.nb < 0) td.className = 'negative';
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    return table;
  }

  container.appendChild(buildSensTable(mainRows));

  if (moreRows.length > 0) {
    const trigger = document.createElement('div');
    trigger.className = 'collapsible-trigger';
    trigger.innerHTML = '<span class="arrow">&#9654;</span> More Sensitivity (By Risk Type)';
    const moreContent = document.createElement('div');
    moreContent.className = 'collapsible-content';
    trigger.addEventListener('click', () => {
      trigger.classList.toggle('expanded');
      moreContent.classList.toggle('expanded');
    });
    moreContent.appendChild(buildSensTable(moreRows));
    container.appendChild(trigger);
    container.appendChild(moreContent);
  }

  return container;
}

function renderCustomBCRByTaxonomy(results) {
  const container = document.createElement('div');
  if (!C.taxonomy) return container;
  const bcr = results.bcr || {};
  const resultById = buildResultById(results);
  const totalBenefitsPV = bcr.total_benefits_pv || 0;
  const totalCostsPV = bcr.total_costs_pv || 0;

  const toggles = [];
  Object.entries(C.taxonomy.excludable_groups).forEach(([gid, group]) => {
    const groupPV = group.taxonomy_ids.reduce((sum, tid) => sum + (resultById[tid]?.value_pv || 0), 0);
    toggles.push({ id: `custom-exc-${gid}`, label: `Exclude ${group.label}`, pv: groupPV });
  });

  container.appendChild(createNote('Societal BCR with selected cost components excluded.'));

  const togglesDiv = document.createElement('div');
  togglesDiv.className = 'custom-bcr-toggles';
  toggles.forEach(t => {
    const lbl = document.createElement('label');
    lbl.className = 'custom-bcr-toggle';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = t.id;
    lbl.appendChild(cb);
    lbl.appendChild(document.createTextNode(t.label));
    togglesDiv.appendChild(lbl);
  });
  container.appendChild(togglesDiv);

  const resultBox = document.createElement('div');
  resultBox.className = 'custom-bcr-result forge-card forge-card--success';
  const bcrMetric = document.createElement('div');
  bcrMetric.className = 'custom-bcr-metric';
  bcrMetric.innerHTML = '<div class="label">Custom BCR</div><div class="value" id="custom-bcr-value">' + formatNumber(totalCostsPV > 0 ? totalBenefitsPV / totalCostsPV : 0, 3) + '</div>';
  const nbMetric = document.createElement('div');
  nbMetric.className = 'custom-bcr-metric';
  nbMetric.innerHTML = '<div class="label">Custom Net Benefit (PV)</div><div class="value" id="custom-nb-value">' + formatCurrency(totalBenefitsPV - totalCostsPV, 0) + '</div>';
  resultBox.appendChild(bcrMetric);
  resultBox.appendChild(nbMetric);
  container.appendChild(resultBox);

  function recompute() {
    let customCosts = totalCostsPV;
    toggles.forEach(t => {
      const cb = document.getElementById(t.id);
      if (cb && cb.checked) customCosts -= t.pv;
    });
    const customBCR = customCosts > 0 ? totalBenefitsPV / customCosts : 0;
    const customNB = totalBenefitsPV - customCosts;
    const bcrEl = document.getElementById('custom-bcr-value');
    const nbEl = document.getElementById('custom-nb-value');
    if (bcrEl) bcrEl.textContent = formatNumber(customBCR, 3);
    if (nbEl) {
      nbEl.textContent = formatCurrency(customNB, 0);
      nbEl.style.color = customNB < 0 ? '#b00020' : '#0066cc';
    }
  }

  setTimeout(() => {
    toggles.forEach(t => {
      const cb = document.getElementById(t.id);
      if (cb) cb.addEventListener('change', recompute);
    });
  }, 0);

  return container;
}

function updateROWCostPanel(results) {
  const panel = document.getElementById('row-cost-panel');
  if (!panel) return;
  const byId = buildResultById(results);
  const fmt = v => '$' + Math.round(v).toLocaleString();

  const hold = byId['row_holding'];
  if (hold) {
    panel.querySelector('[data-row-cost="holding_nominal"]').textContent = fmt(hold.value_nominal);
    panel.querySelector('[data-row-cost="holding_pv"]').textContent = fmt(hold.value_pv);
  }

  const acq = byId['row_acquisition'];
  if (acq) {
    panel.querySelector('[data-row-cost="acquisition_nominal"]').textContent = fmt(acq.value_nominal);
    panel.querySelector('[data-row-cost="acquisition_pv"]').textContent = fmt(acq.value_pv);
  }

  const rent = byId['row_rent'];
  if (rent) {
    panel.querySelector('[data-row-cost="rent_nominal"]').textContent = fmt(rent.value_nominal);
    panel.querySelector('[data-row-cost="rent_pv"]').textContent = fmt(rent.value_pv);
  }

  const capNom = (hold?.value_nominal || 0) + (acq?.value_nominal || 0) + (rent?.value_nominal || 0);
  const capPv = (hold?.value_pv || 0) + (acq?.value_pv || 0) + (rent?.value_pv || 0);
  panel.querySelector('[data-row-cost="capital_nominal"]').textContent = fmt(capNom);
  panel.querySelector('[data-row-cost="capital_pv"]').textContent = fmt(capPv);

  const gf = isGreenfieldROW();
  panel.querySelectorAll('.greenfield-only').forEach(el => el.style.display = gf ? '' : 'none');
  panel.querySelectorAll('.rent-only').forEach(el => el.style.display = gf ? 'none' : '');

  const ind = document.getElementById('rcp-computing');
  if (ind) ind.style.display = 'none';
}

function updateDelayCostPanel(results) {
  const panel = document.getElementById('delay-cost-panel');
  if (!panel) return;
  const byId = buildResultById(results);
  const fmt = v => '$' + Math.round(v).toLocaleString();

  const base = byId['base_delay'];
  const parsedDelayYears = parseInt(document.querySelector('[data-path*="delay_years"]')?.value);
  const delayYears = Number.isFinite(parsedDelayYears) ? parsedDelayYears : null;

  if (base) {
    panel.querySelector('[data-delay-cost="base_nominal"]').textContent = fmt(base.value_nominal);
    panel.querySelector('[data-delay-cost="base_pv"]').textContent = fmt(base.value_pv);
    const baseAnnualEl = panel.querySelector('[data-delay-cost="base_annual"]');
    if (baseAnnualEl) {
      const nominal = base.value_nominal || 0;
      baseAnnualEl.textContent = delayYears != null ? fmt(nominal / delayYears) : '\u2014';
    }
  }
  let baseCtx = document.querySelector('#dcp-base .period-context');
  if (!baseCtx) {
    baseCtx = document.createElement('div');
    baseCtx.className = 'period-context';
    baseCtx.style.cssText = 'font-size:0.75rem;color:#6b7280;margin-top:-0.25rem;padding-left:0;';
    document.querySelector('#dcp-base')?.appendChild(baseCtx);
  }
  baseCtx.textContent = delayYears != null ? `(${delayYears} yr \u00d7 annual)` : '\u2014';

  const cong = byId['congestion_delay'];
  if (cong) {
    panel.querySelector('[data-delay-cost="cong_nominal"]').textContent = fmt(cong.value_nominal);
    panel.querySelector('[data-delay-cost="cong_pv"]').textContent = fmt(cong.value_pv);
  }

  const allNom = (base?.value_nominal || 0) + (cong?.value_nominal || 0);
  const allPv = (base?.value_pv || 0) + (cong?.value_pv || 0);
  panel.querySelector('[data-delay-cost="all_nominal"]').textContent = fmt(allNom);
  panel.querySelector('[data-delay-cost="all_pv"]').textContent = fmt(allPv);

  const ind = document.getElementById('dcp-computing');
  if (ind) ind.style.display = 'none';
}

function updateEnergyImpactPanel(results) {
  const panel = document.getElementById('energy-impact-panel');
  if (!panel) return;
  const byId = buildResultById(results);
  const fmt = v => '$' + Math.round(v).toLocaleString();

  const llCond = byId['line_loss_conductor'];
  const llConv = byId['line_loss_converter'];
  const llNom = (llCond?.value_nominal || 0) + (llConv?.value_nominal || 0);
  const llPv = (llCond?.value_pv || 0) + (llConv?.value_pv || 0);
  const nomEl = panel.querySelector('[data-energy-cost="ll_nominal"]');
  const pvEl = panel.querySelector('[data-energy-cost="ll_pv"]');
  if (nomEl) nomEl.textContent = fmt(llNom);
  if (pvEl) pvEl.textContent = fmt(llPv);

  const deliveredEl = document.querySelector('[data-energy-cost="delivered_gwh"]');
  if (deliveredEl) {
    const gwh = getEnergyDeliveredGWh();
    deliveredEl.textContent = gwh > 0 ? gwh.toLocaleString(undefined, {maximumFractionDigits: 0}) + ' GWh' : '---';
  }

  updateFuelMixChart();
  const ind = document.getElementById('eip-computing');
  if (ind) ind.style.display = 'none';
}

function updateEmissionsImpactPanel(results) {
  const panel = document.getElementById('emissions-impact-panel');
  if (!panel) return;
  const byId = buildResultById(results);
  const fmt = v => '$' + Math.round(v).toLocaleString();

  const gwh = getEnergyDeliveredGWh();
  const initialShares = readFuelShares('initial');
  const preCodRates = readFuelRates('rate_pre_cod');
  const postCodRates = readFuelRates('rate_post_cod');
  const lifetimeRaw = document.querySelector('[data-path="01_project_technical_details.project.project_lifetime"]')?.value;
  const parsedLifetime = lifetimeRaw ? parseFloat(lifetimeRaw.replace(/,/g, '')) : NaN;
  const lifetime = Number.isFinite(parsedLifetime) ? parsedLifetime : null;

  const setVal = (key, val) => { const el = panel.querySelector(`[data-emis-cost="${key}"]`); if (el) el.textContent = val; };

  ['co2', 'sox', 'nox'].forEach(p => {
    if (lifetime == null) {
      setVal(`${p}_project`, '\u2014');
      setVal(`${p}_counterfact`, '\u2014');
      setVal(`${p}_avoided`, '\u2014');
      return;
    }

    const intensities = {};
    C.FUEL_SOURCES.forEach(f => {
      const inp = document.querySelector(`[data-path*="${p}_intensity_kg_per_mwh.${f}"]`);
      intensities[f] = inp ? (parseFloat(inp.value) || 0) : 0;
    });

    let postCodLifetime = 0, preCodLifetime = 0;
    const years = Array.from({ length: Math.min(lifetime, 60) + 1 }, (_, i) => i);
    let postCum = 0, preCum = 0;
    const postCumData = [], preCumData = [];

    years.forEach(y => {
      if (y > 0) {
        const postMix = projectFuelMix(initialShares, postCodRates, y);
        const preMix = projectFuelMix(initialShares, preCodRates, y);
        let postAnn = 0, preAnn = 0;
        C.FUEL_SOURCES.forEach(f => {
          postAnn += (postMix[f] || 0) * intensities[f] * gwh;
          preAnn += (preMix[f] || 0) * intensities[f] * gwh;
        });
        const scale = p === 'co2' ? 1000 : 1;
        postCum += postAnn / scale;
        preCum += preAnn / scale;
        postCodLifetime += postAnn / scale;
        preCodLifetime += preAnn / scale;
      }
      postCumData.push(postCum);
      preCumData.push(preCum);
    });

    const unit = p === 'co2' ? ' kt' : ' t';
    const fmtU = v => v >= 10000 ? (v / 1000).toFixed(1) + ' M' + unit.trim().charAt(unit.trim().length - 1) : v.toFixed(1) + unit;
    setVal(`${p}_project`, fmtU(postCodLifetime));
    setVal(`${p}_counterfact`, fmtU(preCodLifetime));
    setVal(`${p}_avoided`, fmtU(preCodLifetime - postCodLifetime));

    const canvasId = `emissions-chart-${p}`;
    const canvas = document.getElementById(canvasId);
    if (canvas && typeof Chart !== 'undefined') {
      const yLabel = p === 'co2' ? 'Cumulative CO₂ (kt)' : p === 'sox' ? 'Cumulative SOₓ (t)' : 'Cumulative NOₓ (t)';
      if (C.emissionsChartInstances[p]) {
        C.emissionsChartInstances[p].data.labels = years;
        C.emissionsChartInstances[p].data.datasets[0].data = preCumData;
        C.emissionsChartInstances[p].data.datasets[1].data = postCumData;
        C.emissionsChartInstances[p].update();
      } else {
        C.emissionsChartInstances[p] = new Chart(canvas, {
          type: 'line',
          data: {
            labels: years,
            datasets: [
              { label: 'Without line (pre-COD)', data: preCumData, borderColor: '#9ca3af', backgroundColor: 'rgba(156,163,175,0.2)', fill: 'origin', tension: 0.1, pointRadius: 0 },
              { label: 'With line (post-COD)', data: postCumData, borderColor: '#14b8a6', backgroundColor: 'rgba(20,184,166,0.2)', fill: 'origin', tension: 0.1, pointRadius: 0 },
            ],
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            scales: { x: { title: { display: true, text: 'Year' } }, y: { title: { display: true, text: yLabel } } },
            plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } } },
          },
        });
      }
    }
  });

  const emisComp = byId['emissions_comp'];
  const emisFac = byId['emissions_fac'];
  const displ = byId['avoided_emissions_benefit'];
  setVal('comp_cost_nominal', fmt(emisComp?.value_nominal || 0));
  setVal('comp_cost_pv', fmt(emisComp?.value_pv || 0));
  setVal('fac_cost_nominal', fmt(emisFac?.value_nominal || 0));
  setVal('fac_cost_pv', fmt(emisFac?.value_pv || 0));
  setVal('displ_nominal', fmt(displ?.value_nominal || 0));
  setVal('displ_pv', fmt(displ?.value_pv || 0));

  const ind = document.getElementById('emip-computing');
  if (ind) ind.style.display = 'none';
}

function renderBCRHeadline(results) {
  const container = document.createElement('div');
  const bcr = results.bcr || {};

  const coreDefs = [
    { id: 'bcr_societal', label: 'Societal BCR', family: 'societal' },
    { id: 'bcr_utility', label: 'Utility BCR', family: 'firm' },
    { id: 'bcr_ratepayer', label: 'Ratepayer BCR', family: 'firm' },
  ];

  const families = C.taxonomy?.bcr_families || {
    societal: { label: 'Societal', order: 1 },
    firm: { label: 'Firm', order: 2 },
  };
  const familyOrder = Object.keys(families).sort((a, b) => families[a].order - families[b].order);

  const cards = document.createElement('div');
  cards.className = 'bcr-headline-cards';

  familyOrder.forEach(fam => {
    const group = document.createElement('div');
    group.className = 'bcr-family-group';

    const header = document.createElement('div');
    header.className = 'bcr-family-header';
    header.textContent = families[fam].label;
    group.appendChild(header);

    const groupCards = document.createElement('div');
    groupCards.className = 'bcr-family-cards';

    coreDefs.filter(d => d.family === fam).forEach(m => {
      const card = document.createElement('div');
      card.className = 'bcr-headline-card forge-card';
      const lbl = document.createElement('div');
      lbl.className = 'label';
      lbl.textContent = m.label;
      const val = document.createElement('div');
      val.className = 'value';
      const num = Number(bcr[m.id] || 0);
      val.textContent = formatNumber(num, 3);
      if (num < 0) val.style.color = '#b00020';
      card.appendChild(lbl);
      card.appendChild(val);
      groupCards.appendChild(card);
    });

    group.appendChild(groupCards);
    cards.appendChild(group);
  });

  container.appendChild(cards);
  return container;
}

function renderPerspectivesTable(results) {
  const container = document.createElement('div');
  const bcr = results.bcr || {};
  const cc = results.benefits?.congestion || {};

  const grid = document.createElement('div');
  grid.className = 'persp-grid';

  // Header row
  ['Perspective', 'Benefits (PV)', 'Costs (PV)', 'BCR', 'Net Benefit (PV)'].forEach((h, i) => {
    const cell = document.createElement('div');
    cell.className = 'persp-hdr';
    cell.textContent = h;
    grid.appendChild(cell);
  });

  // Per-perspective numerators and denominators (must match bcr_calculator.py)
  const allBenefits = bcr.total_benefits_pv || 0;
  const allCosts = bcr.total_costs_pv || 0;
  const remedialBenefits = bcr.benefits_remedial_pv || 0;
  const hardCosts = bcr.hard_costs_pv || 0;
  const operationalCosts = bcr.operational_costs_pv || 0;
  const energyLosses = bcr.energy_losses_pv || 0;
  const allDelayCosts = bcr.delay_costs_pv || 0;
  const baseDelayCost = bcr.delay_cost_pv || 0;
  const utilityCosts = hardCosts + baseDelayCost + operationalCosts;
  const ratepayerBenefits = allBenefits;
  const ratepayerCosts = (bcr.revenue_pv || 0) + energyLosses;
  const capitalDelayCosts = hardCosts + allDelayCosts;

  const families = C.taxonomy?.bcr_families || {
    societal: { label: 'Societal', order: 1 },
    firm: { label: 'Firm', order: 2 },
  };
  const familyOrder = Object.keys(families).sort((a, b) => families[a].order - families[b].order);

  const rowsByFamily = {
    societal: [
      { name: 'Societal', benefits: allBenefits, costs: allCosts, bcrVal: bcr.bcr_societal || 0, netBenefit: bcr.net_benefit_pv || 0 },
    ],
    firm: [
      { name: 'Utility / Transm. Service Provider', benefits: bcr.revenue_pv || 0, costs: utilityCosts, bcrVal: bcr.bcr_utility || 0, netBenefit: bcr.net_benefit_utility_pv || 0, tooltip: 'Benefits = revenue (the regulated return). Revenue is a transfer from ratepayers; not a net social benefit.' },
      { name: 'Ratepayer', benefits: ratepayerBenefits, costs: ratepayerCosts, bcrVal: bcr.bcr_ratepayer || 0, netBenefit: bcr.net_benefit_ratepayer_pv || 0, tooltip: 'Costs include revenue (what ratepayers pay the utility) plus energy losses passed through.' },
    ],
  };

  let dataRowIdx = 0;
  familyOrder.forEach(fam => {
    const famRows = rowsByFamily[fam] || [];
    if (famRows.length === 0) return;

    // Family header row (spans all 5 columns)
    const famHeader = document.createElement('div');
    famHeader.className = 'persp-family-header';
    famHeader.textContent = families[fam].label;
    grid.appendChild(famHeader);

    famRows.forEach(r => {
      const evenClass = dataRowIdx % 2 === 1 ? ' persp-row-even' : '';
      const vals = [
        { text: r.name, isLabel: true },
        { text: formatCurrency(r.benefits, 0) },
        { text: formatCurrency(r.costs, 0) },
        { text: formatNumber(r.bcrVal, 3) },
        { text: formatCurrency(r.netBenefit, 0), negative: r.netBenefit < 0 },
      ];
      vals.forEach(v => {
        const cell = document.createElement('div');
        cell.className = 'persp-cell' + evenClass + (v.isLabel ? ' persp-label' : '') + (v.negative ? ' negative' : '');
        cell.textContent = v.text;
        if (v.isLabel && r.tooltip) cell.title = r.tooltip;
        grid.appendChild(cell);
      });
      dataRowIdx++;
    });
  });

  container.appendChild(grid);
  container.appendChild(createNote('Societal: full welfare (all real resource costs & benefits). System: congestion relief vs grid costs. Firm: utility revenue vs costs; ratepayer benefits vs charges. Capital Screening: benefits vs hard-cost-only denominators.'));
  return container;
}

// ============================================================
// Results Sidebar View — per-section rendering
// ============================================================

function renderResultsOverview(results) {
  var container = document.createElement('div');
  var bcr = results.bcr || {};

  var heroGrid = document.createElement('div');
  heroGrid.style.cssText = 'display:grid;grid-template-columns:repeat(2,1fr);gap:1rem;margin-bottom:1.5rem';

  var rid = buildResultById(results);
  var totalCostPV = C.COST_CATEGORY_ORDER.reduce(function(sum, b) {
    return sum + (C.taxonomyByCategory[b] || []).reduce(function(s, i) {
      return s + (rid[i.id] ? rid[i.id].value_pv || 0 : 0);
    }, 0);
  }, 0);
  var totalBenefitsPV = bcr.total_benefits_pv || 0;
  var netBenefit = bcr.net_benefit_pv != null ? bcr.net_benefit_pv : (totalBenefitsPV - totalCostPV);
  var societalBCR = bcr.bcr_societal || 0;

  [
    { label: 'Total Costs (PV)', text: formatCurrency(totalCostPV, 0) },
    { label: 'Total Benefits (PV)', text: formatCurrency(totalBenefitsPV, 0) },
    { label: 'Net Benefit (PV)', text: formatCurrency(netBenefit, 0), color: netBenefit >= 0 ? '#10b981' : '#b00020' },
    { label: 'Societal BCR', text: formatNumber(societalBCR, 3), color: societalBCR >= 1 ? '#10b981' : '#b00020' },
  ].forEach(function(m) {
    var card = document.createElement('div');
    card.className = 'results-summary-card highlight forge-card forge-card--highlight';
    var lbl = document.createElement('div');
    lbl.className = 'results-summary-label';
    lbl.textContent = m.label;
    var val = document.createElement('div');
    val.className = 'results-summary-value large';
    val.textContent = m.text;
    if (m.color) val.style.color = m.color;
    card.appendChild(lbl);
    card.appendChild(val);
    heroGrid.appendChild(card);
  });
  container.appendChild(heroGrid);

  var costSegments = C.COST_CATEGORY_ORDER.map(function(b) {
    var pv = (C.taxonomyByCategory[b] || []).reduce(function(s, i) {
      return s + (rid[i.id] ? rid[i.id].value_pv || 0 : 0);
    }, 0);
    return { label: C.CATEGORY_LABELS[b] || b, value: pv };
  }).filter(function(s) { return s.value > 0; });

  var benefitCategories = ['remedial', 'enabling', 'avoided_emissions'];
  var benefitSegments = benefitCategories.map(function(b) {
    var pv = (C.taxonomyByCategory[b] || []).reduce(function(s, i) {
      return s + (rid[i.id] ? rid[i.id].value_pv || 0 : 0);
    }, 0);
    return { label: C.CATEGORY_LABELS[b] || b, value: pv };
  }).filter(function(s) { return s.value > 0; });

  if (costSegments.length > 0) {
    var costBarSection = document.createElement('div');
    costBarSection.style.marginBottom = '1.25rem';
    var costLabel = document.createElement('div');
    costLabel.style.cssText = 'font-size:0.7rem;font-weight:600;color:#555;margin-bottom:0.4rem;text-transform:uppercase;letter-spacing:0.03em';
    costLabel.textContent = 'Cost Composition';
    costBarSection.appendChild(costLabel);
    costBarSection.appendChild(renderCompositionBar(costSegments));
    costBarSection.appendChild(renderCompositionLegend(costSegments));
    container.appendChild(costBarSection);
  }

  if (benefitSegments.length > 0) {
    var benBarSection = document.createElement('div');
    benBarSection.style.marginBottom = '1.5rem';
    var benLabel = document.createElement('div');
    benLabel.style.cssText = 'font-size:0.7rem;font-weight:600;color:#555;margin-bottom:0.4rem;text-transform:uppercase;letter-spacing:0.03em';
    benLabel.textContent = 'Benefit Composition';
    benBarSection.appendChild(benLabel);
    benBarSection.appendChild(renderCompositionBar(benefitSegments));
    benBarSection.appendChild(renderCompositionLegend(benefitSegments));
    container.appendChild(benBarSection);
  }

  var bcrHeading = document.createElement('div');
  bcrHeading.className = 'results-section-heading';
  var bcrTitle = document.createElement('div');
  bcrTitle.className = 'results-section-title';
  bcrTitle.textContent = 'Benefit-Cost Ratios';
  bcrHeading.appendChild(bcrTitle);
  container.appendChild(bcrHeading);
  container.appendChild(renderBCRHeadline(results));

  var perspHeading = document.createElement('div');
  perspHeading.className = 'results-section-heading';
  perspHeading.style.marginTop = '1.5rem';
  var perspTitle = document.createElement('div');
  perspTitle.className = 'results-section-title';
  perspTitle.textContent = 'Perspectives';
  var perspSub = document.createElement('div');
  perspSub.className = 'results-section-subtitle';
  perspSub.textContent = 'Present Value';
  perspHeading.appendChild(perspTitle);
  perspHeading.appendChild(perspSub);
  container.appendChild(perspHeading);
  container.appendChild(renderPerspectivesTable(results));

  return container;
}

function renderResultsBCRPanel(results) {
  var container = document.createElement('div');
  container.appendChild(renderBCRHeadline(results));
  container.appendChild(createCategory('Societal BCR with Exclusions', renderSensitivityByTaxonomy(results)));
  container.appendChild(createCategory('Custom Societal BCR', renderCustomBCRByTaxonomy(results)));
  return container;
}

function renderResultsSubItem(subItemId) {
  var contentPanel = document.getElementById('content-panel');
  if (!contentPanel) return;

  var results = C.latestValidResults;
  if (!results) {
    contentPanel.innerHTML = '';
    var msg = document.createElement('div');
    msg.style.cssText = 'display:flex;align-items:center;justify-content:center;min-height:300px;text-align:center;color:#666';
    msg.innerHTML =
      '<div>' +
        '<div style="font-size:2rem;margin-bottom:0.75rem">&#x1F4CA;</div>' +
        '<p style="font-size:1rem;margin-bottom:1rem">No results available.</p>' +
        '<p style="font-size:0.85rem;color:#999;margin-bottom:1rem">Edit inputs and calculate first.</p>' +
        '<button type="button" ' +
          'onclick="window.switchSidebarView&&window.switchSidebarView(\'inputs\')" ' +
          'style="padding:0.5rem 1.25rem;background:#3b82f6;color:white;border:none;border-radius:0.375rem;cursor:pointer;font-size:0.9rem">' +
          'Go to Inputs' +
        '</button>' +
      '</div>';
    contentPanel.appendChild(msg);
    return;
  }

  if (!results.taxonomy_results || results.taxonomy_results.length === 0) {
    results.taxonomy_results = deriveTaxonomyResultsFromLegacy(results);
  }

  contentPanel.innerHTML = '';
  var wrapper = document.createElement('div');
  wrapper.style.padding = '1.5rem';

  var el;
  if (subItemId === 'r-overview') {
    el = renderResultsOverview(results);
  } else if (subItemId === 'r-bcr') {
    el = renderResultsBCRPanel(results);
  } else if (subItemId === 'r-capital') {
    el = renderDetailDrillIn(results, ['hard']);
  } else if (subItemId === 'r-operational') {
    el = renderDetailDrillIn(results, ['soft']);
  } else if (subItemId === 'r-risk-costs') {
    el = renderDetailDrillIn(results, ['risk']);
  } else if (subItemId === 'r-emissions-costs') {
    el = renderDetailDrillIn(results, ['emissions']);
  } else if (subItemId === 'r-remedial') {
    el = renderBenefitDrillIn(results, 'remedial');
  } else if (subItemId === 'r-congestion') {
    el = renderBenefitDrillIn(results, 'remedial', 'congestion');
  } else if (subItemId === 'r-loss-comp') {
    el = renderBenefitDrillIn(results, 'enabling');
  } else if (subItemId === 'r-costs-overview') {
    el = renderSectionOverview(results, 'costs');
  } else if (subItemId === 'r-benefits-overview') {
    el = renderSectionOverview(results, 'benefits');
  } else {
    el = document.createElement('div');
    el.textContent = 'Unknown results section: ' + subItemId;
  }

  if (el) wrapper.appendChild(el);
  contentPanel.appendChild(wrapper);
}

// Public API
window.populateDesignCmpDropdowns = populateDesignCmpDropdowns;
window.renderBCRHeadline = renderBCRHeadline;
window.renderDesignComparison = renderDesignComparison;
window.renderPerspectivesTable = renderPerspectivesTable;
window.updateDelayCostPanel = updateDelayCostPanel;
window.updateDesignCmpPrimaryReadout = updateDesignCmpPrimaryReadout;
window.updateDesignCmpRunButton = updateDesignCmpRunButton;
window.updateEmissionsImpactPanel = updateEmissionsImpactPanel;
window.updateEnergyImpactPanel = updateEnergyImpactPanel;
window.updateROWCostPanel = updateROWCostPanel;
window.renderResultsSubItem = renderResultsSubItem;
})();
