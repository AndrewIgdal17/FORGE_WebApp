// FORGE Scenario Workspace UI
// Extracted from scenarios.js — loaded only on workspace.html
// Depends on: scenario-data.js, scenario-ui.js, workspace inline globals
// (autoCalculate, switchTab, renderJsonInputs, renderFORGEResults,
//  markResultsAvailable, setSnapshotOriginalData)

(function() {
'use strict';
var C = window.FORGE;

function setActiveScenario(scenario) {
  C.activeScenarioId = scenario.id;
  C.unsavedChanges = false;
  if (typeof updateSaveState === 'function') updateSaveState();
  C.activeScenarioName = scenario.customName;
  if (typeof updateScenarioNameDisplay === 'function') updateScenarioNameDisplay(scenario.customName);
  updateScenarioBreadcrumb();
  if (scenario.ref_snapshot_id && window._snapshotCache[scenario.ref_snapshot_id]) {
    const snap = window._snapshotCache[scenario.ref_snapshot_id];
    if (typeof setSnapshotOriginalData === 'function') {
      setSnapshotOriginalData(snap);
    }
    const full = assembleFullInputs(snap, scenario.overrides, scenario.inputs || {});
    renderJsonInputs(full);
  } else if (scenario.inputs && Object.keys(scenario.inputs).length > 0) {
    renderJsonInputs(scenario.inputs);
  }
  if (scenario.results) {
    C.latestValidResults = scenario.results;
    C.lastRunResults = JSON.parse(JSON.stringify(scenario.results));
    markResultsAvailable(0);
  } else {
    clearResults();
  }
  renderScenarioList();
  renderCompareSelector();
  if (!scenario.results) {
    setTimeout(function() {
      if (hasRequiredFields()) autoCalculate();
    }, 50);
  }
}

function lookupSidebarLabels(view, sectionId, subItemId) {
  var sections = window.SIDEBAR_SECTIONS && window.SIDEBAR_SECTIONS[view];
  if (!sections || !sectionId) return null;
  for (var i = 0; i < sections.length; i++) {
    if (sections[i].id !== sectionId) continue;
    var section = sections[i];
    if (!subItemId) return { section: section, subItem: null };
    for (var j = 0; j < section.subItems.length; j++) {
      if (section.subItems[j].id === subItemId) {
        return { section: section, subItem: section.subItems[j] };
      }
    }
    return { section: section, subItem: null };
  }
  return null;
}

function updateBreadcrumb() {
  if (typeof updateScenarioNameDisplay === 'function') {
    updateScenarioNameDisplay(C.activeScenarioName || '');
  }

  var headerCrumb = document.getElementById('header-breadcrumb');
  if (!headerCrumb) return;

  if (typeof getCurrentSubItem !== 'function') {
    headerCrumb.textContent = '';
    return;
  }

  var current = getCurrentSubItem();
  var labels = lookupSidebarLabels('inputs', current.sectionId, current.subItemId)
    || lookupSidebarLabels('results', current.sectionId, current.subItemId);

  if (labels && labels.section) {
    headerCrumb.textContent = labels.subItem
      ? labels.section.label + ' \u203a ' + labels.subItem.label
      : labels.section.label;
  } else {
    headerCrumb.textContent = '';
  }
}

function updateScenarioBreadcrumb() { updateBreadcrumb(); }


async function createNewScenario(name) {
  const trimmed = name.trim();
  if (!trimmed) return;
  const scenario = await addScenarioToSession(null, null,
    { timestamp: new Date().toISOString(), source: 'new' },
    trimmed
  );
  setActiveScenario(scenario);
  if (typeof switchSidebarView === 'function') switchSidebarView('inputs');
  if (typeof navigateToSubItem === 'function') {
    navigateToSubItem('project-identity', 'technology');
  }
}

window.setActiveScenario = setActiveScenario;
window.createNewScenario = createNewScenario;
window.updateBreadcrumb = updateBreadcrumb;
window.updateScenarioBreadcrumb = updateScenarioBreadcrumb;

})();
