(function () {
  'use strict';
  var C = window.FORGE;

  /* ── private helpers ── */

  function menuClose() {
    var m = document.getElementById('split-save-menu');
    if (m) m.style.display = 'none';
  }

  async function executeSave() {
    if (!C.activeScenarioId) { showToast('No active scenario to save.'); return; }
    var scenario = C.sessionScenarios.find(function (s) { return s.id === C.activeScenarioId; });
    if (!scenario) return;
    scenario.inputs = collectJsonData();
    scenario.results = C.lastRunResults;
    scenario.metadata.timestamp = new Date().toISOString();
    scenario.metadata.source = 'manual';
    if (typeof window.renderScenarioList === 'function') window.renderScenarioList();
    await saveScenarioToDB(scenario);
    C.unsavedChanges = false;
    updateSaveState();
    showToast('Saved');
  }

  /* ── inline rename ── */

  function startInlineRename() {
    var nameEl = document.getElementById('scenario-name-display');
    if (!nameEl || !C.activeScenarioId) return;
    // Don't double-nest if already editing
    if (nameEl.querySelector('input')) return;

    var original = C.activeScenarioName;
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'scenario-name-input';
    input.value = original;
    nameEl.textContent = '';
    nameEl.appendChild(input);
    input.focus();
    input.select();

    var committed = false;

    async function commit() {
      if (committed) return;
      committed = true;
      var newName = input.value.trim() || original;
      nameEl.textContent = newName;
      if (newName !== original) {
        C.activeScenarioName = newName;
        var s = C.sessionScenarios.find(function (sc) { return sc.id === C.activeScenarioId; });
        if (s) s.customName = newName;
        await _sb.from('scenario').update({ name: newName }).eq('id', C.activeScenarioId);
        if (typeof updateScenarioBreadcrumb === 'function') updateScenarioBreadcrumb();
      }
    }

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') {
        committed = true;
        input.removeEventListener('blur', commit);
        nameEl.textContent = original;
      }
    });
  }

  /* ── exported: state sync ── */

  function updateSaveState() {
    var container = document.getElementById('split-save');
    var mainBtn   = document.getElementById('split-save-main');
    var dot       = document.getElementById('mod-dot');
    if (!container || !mainBtn || !dot) return;
    if (C.unsavedChanges) {
      container.classList.add('unsaved');
      container.classList.remove('saved');
      mainBtn.textContent = 'Save';
      dot.style.display = '';
    } else {
      container.classList.add('saved');
      container.classList.remove('unsaved');
      mainBtn.textContent = 'Saved \u2713';
      dot.style.display = 'none';
    }
  }

  function updateCalcTime(text) {
    var el = document.getElementById('calc-time');
    if (el) el.textContent = text;
  }

  function updateScenarioNameDisplay(name) {
    var el = document.getElementById('scenario-name-display');
    if (el && !el.querySelector('input')) el.textContent = name;
  }

  /* ── init ── */

  function initWorkspaceHeader() {
    /* 1. Main save button */
    var mainBtn = document.getElementById('split-save-main');
    if (mainBtn) {
      mainBtn.addEventListener('click', function () {
        var container = document.getElementById('split-save');
        if (container && container.classList.contains('saved')) return;
        executeSave();
      });
    }

    /* 2. Dropdown chevron toggles menu */
    var dropBtn = document.getElementById('split-save-drop');
    if (dropBtn) {
      dropBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        var menu = document.getElementById('split-save-menu');
        if (!menu) return;
        menu.style.display = (menu.style.display === 'none' || menu.style.display === '') ? 'block' : 'none';
      });
    }

    /* 3. Menu item actions */
    document.querySelectorAll('.split-menu-item').forEach(function (item) {
      item.addEventListener('click', function () {
        var action = item.dataset.action;
        menuClose();
        if (action === 'save') {
          executeSave();
        } else if (action === 'save-copy') {
          if (!C.activeScenarioId) { showToast('No active scenario to copy.'); return; }
          var copyName = C.activeScenarioName + ' (copy)';
          addScenarioToSession(collectJsonData(), C.lastRunResults,
            { timestamp: new Date().toISOString(), source: 'manual' }, copyName);
          showToast('Saved as \u201c' + copyName + '\u201d.');
        } else if (action === 'rename') {
          startInlineRename();
        } else if (action === 'export-forge') {
          var sc = C.sessionScenarios.find(function (s) { return s.id === C.activeScenarioId; });
          if (sc) exportAsForge(sc);
        } else if (action === 'export-csv') {
          var sc = C.sessionScenarios.find(function (s) { return s.id === C.activeScenarioId; });
          if (sc) exportAsCsv(sc);
        }
      });
    });

    /* 4. Scenario name click → inline rename */
    var nameEl = document.getElementById('scenario-name-display');
    if (nameEl) nameEl.addEventListener('click', startInlineRename);

    /* 5. View toggle buttons */
    document.querySelectorAll('.view-toggle-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.view-toggle-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        if (typeof switchSidebarView === 'function') switchSidebarView(btn.dataset.view);
      });
    });

    /* 6. Global keyboard: ⌘S / Ctrl+S saves; Escape closes menu */
    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        executeSave();
      }
      if (e.key === 'Escape') menuClose();
    });

    /* 7. Close menu when clicking outside the split-save container */
    document.addEventListener('click', function (e) {
      var menu = document.getElementById('split-save-menu');
      if (!menu || menu.style.display === 'none' || menu.style.display === '') return;
      var container = document.getElementById('split-save');
      if (container && !container.contains(e.target)) menuClose();
    });
  }

  /* ── public API ── */
  window.initWorkspaceHeader      = initWorkspaceHeader;
  window.updateSaveState          = updateSaveState;
  window.updateCalcTime           = updateCalcTime;
  window.updateScenarioNameDisplay = updateScenarioNameDisplay;

})();
