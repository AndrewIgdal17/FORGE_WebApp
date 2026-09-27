(function() {
'use strict';

var SIDEBAR_SECTIONS = {
  inputs: [
    { id: 'project-identity', label: 'Project Identity', color: '#3b82f6',
      subItems: [
        { id: 'technology', label: 'Technology' },
        { id: 'timeline', label: 'Timeline' }
      ]
    },
    { id: 'equipment', label: 'Equipment', color: '#6366f1',
      subItems: [
        { id: 'conductor-details', label: 'Conductors' },
        { id: 'converter-details', label: 'Converters' }
      ]
    },
    { id: 'routing', label: 'Routing & Terrain', color: '#0891b2',
      subItems: [
        { id: 'terrain-mix', label: 'Terrain Mix' },
        { id: 'rights-of-way', label: 'Rights of Way' }
      ]
    },
    { id: 'benefits', label: 'Benefits', color: '#10b981',
      subItems: [
        { id: 'economic-details', label: 'Economic Details' },
        { id: 'system-constraints', label: 'System Constraints' }
      ]
    },
    { id: 'financial', label: 'Financial', color: '#f59e0b',
      subItems: [
        { id: 'rates', label: 'Rates & Discounting' },
        { id: 'afudc', label: 'AFUDC' }
      ]
    },
    { id: 'capital-costs', label: 'Capital Costs', color: '#ef4444',
      subItems: [
        { id: 'conductor', label: 'Contingencies' },
        { id: 'base-mitigation', label: 'Base Mitigation' },
        { id: 'credits', label: 'Credits' }
      ]
    },
    { id: 'operating', label: 'Operating Costs', color: '#f97316',
      subItems: [
        { id: 'operational-insurance', label: 'Insurance' },
        { id: 'vegetation-management', label: 'Vegetation Mgmt' },
        { id: 'delay-costs', label: 'Delay Costs' }
      ]
    },
    { id: 'risk', label: 'Risk', color: '#a855f7',
      subItems: [
        { id: 'wildfire-risk', label: 'Wildfire' },
        { id: 'outage-risk', label: 'Outage' }
      ]
    },
    { id: 'emissions', label: 'Emissions', color: '#14b8a6',
      subItems: [
        { id: 'energy-emissions-emissions', label: 'Emissions & Intensities' }
      ]
    },
    { id: 'energy-mix', label: 'Energy Mix', color: '#06b6d4',
      subItems: [
        { id: 'energy-emissions-energy', label: 'Energy Source Mix' }
      ]
    }
  ],
  results: [
    { id: 'r-summary', label: 'Summary', color: '#10b981',
      subItems: [
        { id: 'r-overview', label: 'Overview' },
        { id: 'r-bcr', label: 'BCR Analysis' }
      ]
    },
    { id: 'r-costs', label: 'Costs', color: '#ef4444',
      subItems: [
        { id: 'r-costs-overview', label: 'Overview' },
        { id: 'r-capital', label: 'Capital' },
        { id: 'r-operational', label: 'Operational' },
        { id: 'r-risk-costs', label: 'Risk Costs' },
        { id: 'r-emissions-costs', label: 'Emissions' }
      ]
    },
    { id: 'r-benefits', label: 'Benefits', color: '#3b82f6',
      subItems: [
        { id: 'r-benefits-overview', label: 'Overview' },
        { id: 'r-congestion', label: 'Congestion' },
        { id: 'r-loss-comp', label: 'Loss Compensation' },
        { id: 'r-remedial', label: 'Remedial Actions' }
      ]
    }
  ]
};

var currentView = 'inputs';
var currentSectionId = null;
var currentSubItemId = null;

function getFieldCount(sectionId) {
  var C = window.FORGE;
  if (!C || !C.inputMetadata) return null;
  var count = 0;
  for (var i = 0; i < C.inputMetadata.length; i++) {
    if (C.inputMetadata[i].input_tab === sectionId) count++;
  }
  return count;
}

function findSectionAndSubItem(view, sectionId, subItemId) {
  var sections = SIDEBAR_SECTIONS[view];
  for (var i = 0; i < sections.length; i++) {
    if (sections[i].id !== sectionId) continue;
    var subItems = sections[i].subItems;
    for (var j = 0; j < subItems.length; j++) {
      if (subItems[j].id === subItemId) {
        return { section: sections[i], subItem: subItems[j] };
      }
    }
    return null;
  }
  return null;
}

function updateContentHeader(section, subItem) {
  var header = document.getElementById('content-header');
  if (!header) return;
  header.innerHTML =
    '<span class="sidebar-dot" data-section="' + section.id + '" style="width:10px;height:10px;"></span>' +
    '<h2>' + subItem.label + '</h2>' +
    '<span class="breadcrumb">' + section.label + ' \u2192 ' + subItem.label + '</span>';
}

function applyActiveState(sectionId, subItemId) {
  var prevActive = document.querySelector('.sidebar-subitem.active');
  if (prevActive) prevActive.classList.remove('active');
  var prevHeader = document.querySelector('.sidebar-section-header.section-active');
  if (prevHeader) prevHeader.classList.remove('section-active');

  var sectionEl = document.querySelector('.sidebar-section[data-section-id="' + sectionId + '"]');
  if (sectionEl) {
    sectionEl.classList.add('open');
    var header = sectionEl.querySelector('.sidebar-section-header');
    if (header) header.classList.add('section-active');
  }

  var subEl = document.querySelector('.sidebar-subitem[data-sub-item-id="' + subItemId + '"]');
  if (subEl) subEl.classList.add('active');

  currentSectionId = sectionId;
  currentSubItemId = subItemId;
}

function selectSubItem(sectionId, subItemId) {
  var found = findSectionAndSubItem(currentView, sectionId, subItemId);
  if (!found) return;

  applyActiveState(sectionId, subItemId);
  updateContentHeader(found.section, found.subItem);

  if (typeof window.onSubItemSelected === 'function') {
    window.onSubItemSelected(sectionId, subItemId);
  }
}

function renderSidebarTree(sections, showCounts) {
  var container = document.getElementById('sidebar-tree');
  if (!container) return;
  container.innerHTML = '';

  for (var i = 0; i < sections.length; i++) {
    var section = sections[i];
    var sectionEl = document.createElement('div');
    sectionEl.className = 'sidebar-section';
    sectionEl.setAttribute('data-section-id', section.id);

    var header = document.createElement('div');
    header.className = 'sidebar-section-header';

    var chevron = document.createElement('span');
    chevron.className = 'sidebar-chevron';
    chevron.textContent = '\u25B6';

    var dot = document.createElement('span');
    dot.className = 'sidebar-dot';
    dot.setAttribute('data-section', section.id);

    var label = document.createElement('span');
    label.textContent = section.label;

    header.appendChild(chevron);
    header.appendChild(dot);
    header.appendChild(label);

    if (showCounts) {
      var count = getFieldCount(section.id);
      if (count !== null) {
        var countEl = document.createElement('span');
        countEl.className = 'sidebar-count';
        countEl.textContent = String(count);
        header.appendChild(countEl);
      }
    }

    header.addEventListener('click', (function(el, sec) {
      return function() {
        el.classList.toggle('open');
        if (currentView === 'results' && sec.id.startsWith('r-') && sec.id !== 'r-summary') {
          var overviewId = sec.id + '-overview';
          selectSubItem(sec.id, overviewId);
        }
      };
    })(sectionEl, section));

    var subitemsEl = document.createElement('div');
    subitemsEl.className = 'sidebar-subitems';

    for (var j = 0; j < section.subItems.length; j++) {
      var subItem = section.subItems[j];
      var subEl = document.createElement('div');
      subEl.className = 'sidebar-subitem';
      subEl.setAttribute('data-sub-item-id', subItem.id);
      subEl.textContent = subItem.label;
      subEl.addEventListener('click', (function(sid, subid) {
        return function(e) {
          e.stopPropagation();
          selectSubItem(sid, subid);
        };
      })(section.id, subItem.id));
      subitemsEl.appendChild(subEl);
    }

    sectionEl.appendChild(header);
    sectionEl.appendChild(subitemsEl);
    container.appendChild(sectionEl);
  }

  if (showCounts) {
    setTimeout(updateSidebarValidation, 0);
  }
}

function selectFirstSubItem(sections) {
  if (!sections.length || !sections[0].subItems.length) return;
  selectSubItem(sections[0].id, sections[0].subItems[0].id);
}

function updateMainTabButtons(view) {
  var buttons = document.querySelectorAll('.view-toggle-btn');
  buttons.forEach(function(btn) {
    if (btn.dataset.view === view) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

function initSidebar() {
  currentView = 'inputs';
  renderSidebarTree(SIDEBAR_SECTIONS.inputs, true);
  selectFirstSubItem(SIDEBAR_SECTIONS.inputs);
}

function navigateToSubItem(sectionId, subItemId) {
  selectSubItem(sectionId, subItemId);
}

function switchSidebarView(view) {
  var sensitivityPanel = document.getElementById('sensitivity-panel');
  var mainTabInputs = document.getElementById('main-tab-inputs');

  if (view === 'sensitivity') {
    currentView = view;
    if (mainTabInputs) mainTabInputs.style.display = 'none';
    if (sensitivityPanel) sensitivityPanel.style.display = 'block';
    updateMainTabButtons(view);
    return;
  }

  if (view !== 'inputs' && view !== 'results') return;
  if (mainTabInputs) mainTabInputs.style.display = '';
  if (sensitivityPanel) sensitivityPanel.style.display = 'none';
  currentView = view;
  renderSidebarTree(SIDEBAR_SECTIONS[view], view === 'inputs');
  updateMainTabButtons(view);
  selectFirstSubItem(SIDEBAR_SECTIONS[view]);
}

function getCurrentSubItem() {
  return { sectionId: currentSectionId, subItemId: currentSubItemId };
}

function updateSidebarValidation() {
  var invalidFields = typeof getInvalidFields === 'function' ? getInvalidFields() : [];

  var bySubTab = {};
  for (var i = 0; i < invalidFields.length; i++) {
    var st = invalidFields[i].subTab;
    if (!bySubTab[st]) bySubTab[st] = [];
    bySubTab[st].push(invalidFields[i]);
  }

  var subItems = document.querySelectorAll('.sidebar-subitem');
  subItems.forEach(function(el) {
    var subId = el.getAttribute('data-sub-item-id');
    var existing = el.querySelector('.missing-badge');
    if (existing) existing.remove();

    if (bySubTab[subId]) {
      var entries = bySubTab[subId];
      var missingFields = entries.filter(function(e) { return e.path.indexOf('routing_mismatch') === -1; });
      var hasMismatch = entries.some(function(e) { return e.path.indexOf('routing_mismatch') !== -1; });

      el.classList.add('sidebar-subitem--invalid');
      var badge = document.createElement('span');
      badge.className = 'missing-badge';

      if (missingFields.length > 0 && hasMismatch) {
        badge.textContent = missingFields.length + ' missing + mismatch';
        el.title = entries.map(function(e) { return e.label; }).join(', ');
      } else if (hasMismatch) {
        badge.textContent = 'Mismatch';
        el.title = entries[0].label;
      } else {
        badge.textContent = missingFields.length + ' missing';
        el.title = missingFields.length + ' missing: ' + missingFields.map(function(e) { return e.label; }).join(', ');
      }
      el.appendChild(badge);
    } else {
      el.classList.remove('sidebar-subitem--invalid');
      el.title = '';
    }
  });
}

window.SIDEBAR_SECTIONS = SIDEBAR_SECTIONS;
window.onSubItemSelected = null;
window.initSidebar = initSidebar;
window.navigateToSubItem = navigateToSubItem;
window.switchSidebarView = switchSidebarView;
window.getCurrentSubItem = getCurrentSubItem;
window.updateSidebarValidation = updateSidebarValidation;
})();
