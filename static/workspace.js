(function() {
'use strict';

      document.addEventListener('DOMContentLoaded', function() {
      const C = window.FORGE;
      const form = document.getElementById("demo-form");
      const resultEl = document.getElementById("result");
      const loadStatus = document.getElementById("load-status");

      C.forgeJsonData = null;
      C.refVersion = 'v1.0';
      /** Cached from GET /api/fuel_mix_presets for Fuel Mixes dropdown. */
      C.cachedFuelMixPresets = [];

      // Taxonomy state (loaded once from GET /api/C.taxonomy)
      C.taxonomy = null;
      C.taxonomyById = {};
      C.taxonomyBySide = {};
      C.taxonomyByCategory = {};

      // Input metadata state (loaded once from GET /api/input_metadata)
      C.inputMetadata = null;
      C.activeTabIndex = 0;

      // Scenario management state
      C.sessionScenarios = [];
      C.activeScenarioId = null;
      C.activeScenarioName = '';
      C.lastRunResults = null;
      C.scenarioCounter = 0;
      C.comparisonScenarioIds = new Set();
      C.comparisonBaselineId = null;
      C.showDeltaVsBaseline = false;
      /** @type {'values_plus_delta'|'delta_only'} */
      C.comparisonDeltaDisplayMode = 'values_plus_delta';
      C.showComparisonPercentDelta = false;
      C.comparisonAutoSort = false;
      C.comparisonColumns = ['bcr_societal', 'grand_total_pv', 'total_capital_pv', 'total_benefits_pv'];

      C.routingValid = true;


      C.latestValidResults = null;
      C.autoCalcInFlight = false;
      C.autoCalcQueued = false;

      const autoCalculate = debounce(async function() {
        if (!C.activeScenarioId) return;
        if (typeof hasRequiredFields === 'function' && !hasRequiredFields()) return;
        if (C.autoCalcInFlight) { C.autoCalcQueued = true; return; }
        C.autoCalcInFlight = true;
        const calcScenarioId = C.activeScenarioId;
        document.dispatchEvent(new CustomEvent('forge-calc-started'));
        try {
          const baseUrl = C.apiBaseUrl;
          const payload = {
            mode: 'calculate',
            input_mode: 'json',
            output_mode: 'json',
            scenario_id: C.activeScenarioId,
            combined_data: collectJsonData()
          };
          const _authToken = await _getAuthToken();
          const _calcHeaders = { 'Content-Type': 'application/json' };
          if (_authToken) _calcHeaders['Authorization'] = 'Bearer ' + _authToken;
          const resp = await fetch(
            new URL('/api/forge/calculate', baseUrl).toString(),
            { method: 'POST', headers: _calcHeaders,
              body: JSON.stringify(payload) }
          );
          const json = await resp.json();
          if (calcScenarioId !== C.activeScenarioId) return;
          if (json.results) {
            C.latestValidResults = json.results;
            C.lastRunResults = json.results;
            markResultsAvailable(0);
            document.dispatchEvent(new CustomEvent('forge-results-updated',
              { detail: { results: json.results } }));
            if (json.results._partial) {
              const warnings = json.results._warnings || [];
              const banner = document.createElement('div');
              banner.className = 'partial-results-banner';
              banner.innerHTML = '\u26a0\ufe0f Partial results \u2014 some modules failed: ' +
                  warnings.join(', ') +
                  ' <button onclick="this.parentElement.remove()" style="margin-left:1rem;cursor:pointer;border:none;background:none;color:#856404;font-weight:600;">Dismiss</button>';
              banner.style.cssText = 'background:#fff3cd;color:#856404;padding:0.75rem 1rem;border-radius:6px;margin-bottom:1rem;font-size:0.9rem;';
              const resultEl = document.getElementById('result');
              if (resultEl) resultEl.insertBefore(banner, resultEl.firstChild);
            }
          } else {
            if (json.error) {
              console.warn('Calculator error:', json.error);
              clearResults();
              const _re = document.getElementById('result');
              if (_re) {
                _re.innerHTML = '<div style="display:flex; align-items:center; justify-content:center; min-height:300px; color:#b00020; font-size:1.1rem; text-align:center;">' +
                  '<div><div style="font-size:2rem; margin-bottom:0.5rem;">&#9888;</div>' +
                  'Calculation error \u2014 check inputs and try again.<br>' +
                  '<span style="font-size:0.85rem; color:#999;">' + (json.error || '') + '</span></div></div>';
              }
            }
          }
        } catch (e) {
          console.error('Auto-calculate error:', e);
        } finally {
          C.autoCalcInFlight = false;
          const ind = document.getElementById('rcp-computing');
          if (ind) ind.style.display = 'none';
          if (C.autoCalcQueued) { C.autoCalcQueued = false; autoCalculate(); }
        }
      }, 300);

      function updateFieldValidation(pulseOnEntry) {
        var invalidFields = typeof getInvalidFields === 'function' ? getInvalidFields() : [];
        var invalidPaths = {};
        for (var i = 0; i < invalidFields.length; i++) {
          invalidPaths[invalidFields[i].path] = invalidFields[i];
        }

        document.querySelectorAll('.form-field--invalid').forEach(function(el) {
          el.classList.remove('form-field--invalid', 'pulse');
          var msg = el.querySelector('.validation-msg');
          if (msg) msg.remove();
        });

        for (var path in invalidPaths) {
          if (path === 'terrain_miles') continue;
          var input = document.querySelector('[data-path="' + path + '"]');
          if (!input) continue;
          var wrapper = input.closest('.form-field');
          if (!wrapper) continue;

          wrapper.classList.add('form-field--invalid');
          if (pulseOnEntry) wrapper.classList.add('pulse');

          if (!wrapper.querySelector('.validation-msg')) {
            var msg = document.createElement('div');
            msg.className = 'validation-msg';
            msg.textContent = '\u26A0 Required';
            wrapper.appendChild(msg);
          }
        }

        if (pulseOnEntry) {
          setTimeout(function() {
            document.querySelectorAll('.form-field--invalid.pulse').forEach(function(el) {
              el.classList.remove('pulse');
            });
          }, 3000);
        }

        if (typeof updateSidebarValidation === 'function') {
          updateSidebarValidation();
        }
      }


      /** Hierarchical add-column picker (fixed popover); see spec Tooling UX 3/23. */


      // Modal dialog — showModal/hideModal now in utils.js
      const modalOverlay = document.getElementById('modal-overlay');
      modalOverlay.addEventListener('click', function(e) {
        if (e.target === modalOverlay) {
          hideModal();
        }
      });

      // =============================================
      // Scenario Management
      // =============================================
      // Comparison: format 'text' / 'boolean' = absolutes only (no Δ / % Δ); see metricSupportsComparisonDelta.


      // --- Scenario Data Layer ---


      // --- Scenario List Rendering ---


      // --- Save & Export ---


      // Save dialog option selection
      document.querySelectorAll('.save-dialog .save-option').forEach(opt => {
        opt.addEventListener('click', () => {
          document.querySelectorAll('.save-dialog .save-option').forEach(o => o.classList.remove('selected'));
          opt.classList.add('selected');
        });
      });

      document.getElementById('save-cancel-btn').addEventListener('click', hideSaveDialog);

      let saveOverlayMouseDownTarget = null;
      document.getElementById('save-overlay').addEventListener('mousedown', function(e) {
        saveOverlayMouseDownTarget = e.target;
      });
      document.getElementById('save-overlay').addEventListener('click', function(e) {
        if (e.target === this && saveOverlayMouseDownTarget === this) hideSaveDialog();
      });

      document.getElementById('save-confirm-btn').addEventListener('click', async function() {
        const selected = document.querySelector('.save-dialog .save-option.selected');
        if (!selected) return;
        const option = selected.dataset.option;
        const currentInputs = collectJsonData();
        const resultsToSave = C.latestValidResults;

        if (option === 'memory') {
          const name = document.getElementById('save-memory-name').value.trim() || C.activeScenarioName || generateScenarioName('Scenario');
          if (C.activeScenarioId) {
            const s = C.sessionScenarios.find(s => s.id === C.activeScenarioId);
            if (s) {
              s.customName = name;
              s.inputs = JSON.parse(JSON.stringify(currentInputs));
              s.results = resultsToSave ? JSON.parse(JSON.stringify(resultsToSave)) : null;
              s.metadata.timestamp = new Date().toISOString();
              C.activeScenarioName = name;
              updateScenarioBreadcrumb();
              renderScenarioList();
              updateScenarioBadge();
              await saveScenarioToDB(s);
            }
          } else {
            addScenarioToSession(currentInputs, resultsToSave,
              { timestamp: new Date().toISOString(), source: 'manual' },
              name);
          }
          hideSaveDialog();
        } else if (option === 'forge') {
          const scenario = {
            customName: document.getElementById('save-memory-name').value.trim() || 'Scenario',
            inputs: currentInputs,
            results: resultsToSave,
          };
          exportAsForge(scenario);
          hideSaveDialog();
        } else if (option === 'csv') {
          const scenario = {
            customName: document.getElementById('save-memory-name').value.trim() || 'Scenario',
            inputs: currentInputs,
            results: resultsToSave,
          };
          exportAsCsv(scenario);
          hideSaveDialog();
        }
      });

      // Smart tooltip positioning (activeTooltip moved to utils.js)


      // Delegate tooltip events to document
      document.addEventListener('mouseenter', function(e) {
        if (e.target && e.target.classList && e.target.classList.contains('help-icon')) {
          showTooltip(e.target);
        }
      }, true);

      document.addEventListener('mouseleave', function(e) {
        if (e.target && e.target.classList && e.target.classList.contains('help-icon')) {
          hideTooltip();
        }
      }, true);


      function showCalculating() {
        if (typeof updateCalcTime === 'function') updateCalcTime('Calculating...');
      }

      function markResultsAvailable(durationMs) {
        var seconds = (durationMs / 1000).toFixed(1);
        if (typeof updateCalcTime === 'function') updateCalcTime('Calculated in ' + seconds + 's');
        var resultsBtn = document.querySelector('.view-toggle-btn[data-view="results"]');
        if (resultsBtn) resultsBtn.classList.add('results-available');
      }

      function hideStatusBar() {
        if (typeof updateCalcTime === 'function') updateCalcTime('Not calculated');
      }

      const DEFAULT_PORT = 8000;

      function initialiseApiBase() {
        C.apiBaseUrl = deriveDefaultApiBase(window.location.href, DEFAULT_PORT);
      }

      function initForgeInputs() {
        if (!C.forgeJsonData) {
          return loadForgeJson();
        }
      }


      async function fetchFinalCombined(baseUrl) {
        const finalUrl = new URL("/api/final_combined", baseUrl).toString();
        const response = await fetch(finalUrl);
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to load final_combined.json: ${response.status} ${response.statusText} ${errorText}`);
        }
        return response.json();
      }

      async function fetchTaxonomy(baseUrl) {
        const resp = await fetch(new URL("/api/taxonomy", baseUrl).toString());
        if (!resp.ok) throw new Error("Failed to load taxonomy: " + resp.status);
        return resp.json();
      }

      async function fetchInputMetadata(baseUrl) {
        const resp = await fetch(new URL("/api/input_metadata", baseUrl).toString());
        if (!resp.ok) throw new Error("Failed to load input_metadata: " + resp.status);
        return resp.json();
      }

      async function fetchFuelMixPresets(baseUrl) {
        const url = new URL("/api/fuel_mix_presets", baseUrl).toString();
        const response = await fetch(url);
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to load fuel_mix_presets: ${response.status} ${response.statusText} ${errorText}`);
        }
        return response.json();
      }


      function switchTab(index) {
        // Tab buttons/contents no longer exist — sidebar handles navigation.
        C.activeTabIndex = index;
      }

      // Expose closure-scoped functions for external modules
      window.autoCalculate = autoCalculate;
      window.updateFieldValidation = updateFieldValidation;
      window.switchTab = switchTab;
      window.collectJsonData = collectJsonData;
      window.markResultsAvailable = markResultsAvailable;
      window.showCalculating = showCalculating;
      window.hideStatusBar = hideStatusBar;
      window.fetchFinalCombined = fetchFinalCombined;
      window.fetchTaxonomy = fetchTaxonomy;
      window.fetchInputMetadata = fetchInputMetadata;
      window.fetchFuelMixPresets = fetchFuelMixPresets;

      function collectJsonData() {
        if (!C.forgeJsonData) return null;

        // Deep clone the original data to preserve nested structures
        const result = JSON.parse(JSON.stringify(C.forgeJsonData));

        // Helper function to set value at path
        function setValueAtPath(path, value) {
          const keys = path.split('.');
          let current = result;

          for (let i = 0; i < keys.length - 1; i++) {
            if (!current[keys[i]]) {
              current[keys[i]] = {};
            }
            current = current[keys[i]];
          }

          current[keys[keys.length - 1]] = value;
        }

        // Collect from content-panel (visible sub-item) and offscreen holder (all others)
        const allInputContainers = [
          document.getElementById('content-panel'),
          document.getElementById('forge-offscreen-inputs')
        ].filter(Boolean);

        // Update with edited values from form inputs
        let inputs = [];
        allInputContainers.forEach(c => { inputs = inputs.concat(Array.from(c.querySelectorAll('input'))); });
        inputs.forEach(input => {
          const path = input.dataset.path;
          if (!path) return;

          let value;
          if (input.type === 'checkbox') {
            value = input.checked;
          } else if (input.type === 'number') {
            value = input.value === '' ? null : parseFloat(input.value);
            // Percent sliders display ×100; convert back to decimal for JSON
            if (value !== null && input.classList.contains('slider-pct')) {
              value = value / 100;
            }
          } else if (input.classList.contains('currency-input')) {
            value = parseCurrencyInput(input.value);
          } else if (input.classList.contains('percentage-input')) {
            value = parsePercentageInput(input.value);
          } else if (input.classList.contains('number-input')) {
            value = parseNumberInput(input.value);
          } else if (input.classList.contains('year-input')) {
            value = input.value === '' ? null : parseInt(input.value, 10);
          } else {
            value = input.value;
          }

          setValueAtPath(path, value);
        });

        // Update with edited values from select dropdowns
        let selects = [];
        allInputContainers.forEach(c => { selects = selects.concat(Array.from(c.querySelectorAll('select'))); });
        selects.forEach(select => {
          const path = select.dataset.path;
          if (!path) return;

          let value = select.value;
          const meta = C.inputMetadata
            ? C.inputMetadata.find(m => m.yaml_section + '.' + m.field_path === path)
            : null;
          if (meta && meta.input_type === 'dynamic_dropdown') {
            const parsed = parseInt(value, 10);
            value = value === '' ? null : (isNaN(parsed) ? value : parsed);
          } else if (meta && meta.validation && Array.isArray(meta.validation.options)
                     && meta.validation.options.some(opt => typeof opt === 'number')) {
            value = value === '' ? null : parseInt(value, 10);
          } else if (value === '') {
            value = null;
          }

          setValueAtPath(path, value);
        });

        // Stamp scenario name as project identifier for calculator output
        if (C.activeScenarioName) {
          setValueAtPath('01_project_technical_details.project.name', C.activeScenarioName);
        }

        return result;
      }


      // ===== Taxonomy-Driven Renderers (Phase 3) =====


      // ===== Taxonomy-Driven Input Form Renderer (Phase 4) =====

      C.INPUT_TAB_ORDER = ['project-identity', 'equipment', 'routing', 'benefits', 'financial', 'capital-costs', 'operating', 'risk', 'emissions', 'energy-mix'];
      C.INPUT_TAB_LABELS = {
        'project-identity': 'Project Identity', 'equipment': 'Equipment',
        'routing': 'Routing & Terrain', 'benefits': 'Benefits',
        'financial': 'Financial', 'capital-costs': 'Capital Costs',
        'operating': 'Operating Costs', 'risk': 'Risk',
        'emissions': 'Emissions', 'energy-mix': 'Energy Mix',
      };
      C.SUB_TAB_LABELS = {
        'terrain-mix': 'Terrain Mix',
        'rights-of-way': 'Rights of Way',
        'conductor': 'Conductor',
        'structure': 'Structure',
        'converter': 'Converter',
        'base-mitigation': 'Base Mitigation',
        'credits': 'Habitat Credits',
        'technology': 'Technology',
        'conductor-details': 'Conductor Details',
        'structure-details': 'Structure Details',
        'converter-details': 'Converter Details',
        'timeline': 'Timeline',
        'routing': 'Routing',
        'operational-insurance': 'Operational Insurance',
        'maintenance-costs': 'Maintenance Costs',
        'vegetation-management': 'Vegetation Management',
        'conductor-maintenance': 'Conductor Maintenance',
        'structure-maintenance': 'Structure Maintenance',
        'converter-maintenance': 'Converter Maintenance',
        'energy-emissions-energy': 'Energy',
        'energy-emissions-emissions': 'Emissions',
        'environmental-mitigation': 'Environmental Mitigation',
        'energy-mix': 'Energy Mix',
        'energy-losses': 'Losses',
        'emission-intensities': 'Intensities',
        'emission-externality-costs': 'Externality Costs',
        'wildfire-risk': 'Wildfire Risk',
        'outage-risk': 'Outage Risk',
        'wf-severity': 'Severity',
        'wf-ignition-profile': 'Ignition Profile',
        'out-exposure': 'Exposure',
        'out-outage-profile': 'Outage Profile',
        'economic-details': 'Economic Details',
        'system-constraints': 'Constraints',
        'congestion': 'Congestion',
        'rates': 'Rates',
        'afudc': 'AFUDC',
      };


      // ============================================================
      // Tab guide banners — contextual onboarding
      // ============================================================


      // emissionsChartInstances defined near renderEmissionsImpactPanel


      document.addEventListener('forge-results-updated', (e) => {
        updateROWCostPanel(e.detail.results);
      });
      document.addEventListener('forge-calc-started', () => {
        const ind = document.getElementById('rcp-computing');
        if (ind) ind.style.display = '';
        const dInd = document.getElementById('dcp-computing');
        if (dInd) dInd.style.display = '';
        const eInd = document.getElementById('eip-computing');
        if (eInd) eInd.style.display = '';
        const emInd = document.getElementById('emip-computing');
        if (emInd) emInd.style.display = '';
      });


      document.addEventListener('forge-results-updated', (e) => {
        updateDelayCostPanel(e.detail.results);
        updateEnergyImpactPanel(e.detail.results);
        updateEmissionsImpactPanel(e.detail.results);
      });


      // ===== Capital Costs tab — Pattern 7 locked cost tables =====


      // ============================================================
      // Operational Costs — Maintenance tables + rebuild functions
      // ============================================================


      // ============================================================
      // Energy and Emissions — render functions
      // ============================================================


      // ============================================================
      // Risk Profiles — render functions
      // ============================================================


      // ============================================================
      // Financial — render functions
      // ============================================================


      // ============================================================
      // System Details — render functions
      // ============================================================


      // ===== BCR Tab Renderers =====


      form.addEventListener("submit", async (event) => {
        event.preventDefault();

        // Pre-run validation: category string (Fix 6)
        const catCheck = validateCategoryString();
        if (!catCheck.valid) {
          showToast('Invalid configuration: ' + catCheck.reason);
          return;
        }

        // Pre-run validation: AFUDC timing patterns (Fix 5)
        if (!validateCostTimingPatterns()) {
          showToast('AFUDC timing invalid: during_delay + during_construction must equal 1.0');
          return;
        }

        if (!C.routingValid) {
          showToast('Cannot run — terrain and zone miles don\'t match');
          return;
        }

        const startTime = performance.now();
        showCalculating();
        resultEl.textContent = "";

        try {
          const baseUrl = C.apiBaseUrl;
          const scenarioId = C.activeScenarioId;

          const payload = {
            mode: "calculate",
            input_mode: "json",
            output_mode: "json",
            scenario_id: scenarioId,
            combined_data: null
          };

          if (C.forgeJsonData) {
            payload.combined_data = collectJsonData();
          } else {
            payload.combined_data = await fetchFinalCombined(baseUrl);
          }

          const endpoint = new URL("/api/forge/calculate", baseUrl).toString();

          const _fAuthToken = await _getAuthToken();
          const _fHeaders = { "Content-Type": "application/json" };
          if (_fAuthToken) _fHeaders["Authorization"] = "Bearer " + _fAuthToken;
          const response = await fetch(endpoint, {
            method: "POST",
            headers: _fHeaders,
            body: JSON.stringify(payload),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`${response.status} ${response.statusText}: ${errorText}`);
          }

          const json = await response.json();

          if (json.results) {
            C.lastRunResults = json.results;
            C.latestValidResults = json.results;
            document.dispatchEvent(new CustomEvent('forge-results-ready'));
          } else {
            resultEl.textContent = JSON.stringify(json, null, 2);
          }

          // Mark results available (but don't switch tabs)
          const endTime = performance.now();
          const duration = endTime - startTime;
          markResultsAvailable(duration);
        } catch (error) {
          showToast('Request failed: ' + error.message);
          resultEl.textContent = error.message;
        }
      });

      C.unsavedChanges = false;
      form.addEventListener('input', () => {
          if (C.activeScenarioId) {
            C.unsavedChanges = true;
            if (typeof updateSaveState === 'function') updateSaveState();
          }
      });
      window.addEventListener('beforeunload', (e) => {
          if (C.unsavedChanges) {
              e.preventDefault();
              e.returnValue = '';
          }
      });

      // Always-solving: auto-calculate on every input change
      form.addEventListener('input', () => { autoCalculate(); updateFieldValidation(false); });
      form.addEventListener('change', () => { autoCalculate(); updateFieldValidation(false); });

      // Initial calculation removed — gated on C.activeScenarioId (§13 Scenarios Tab)

      // =============================================
      // Conditional Field Visibility
      // =============================================

      // Set up event listeners for controlling fields after JSON loads


      // =============================================
      // Post-Render Functions
      // =============================================


      // Change 1: Update dynamic dropdowns (capacity MW) when AC/DC changes


      // createEnvironmentalSubTabs — retired, replaced by metadata-driven sub-tabs in renderInputsFromTaxonomy


      // cleanUpProjectOverviewHeaders() — absorbed into TAB_HIERARCHY engine


      initialiseApiBase();
      var dataReady = initForgeInputs();

      // --- App entry (waits for auth check to resolve) ---
      if (window._authReady) {
        window._authReady.then(async function(auth) {
          if (!auth) return;
          var profile = auth.profile;
          var session = auth.session;

          window.FORGE.userProfile = profile;
          window.FORGE.currentUserId = session.user.id;
          document.querySelectorAll('.forge-user-display').forEach(function(el) {
            el.textContent = profile.username || '';
          });

          await loadScenariosFromDB();
          if (typeof renderScenarioList === 'function') renderScenarioList();

          _sb.from('ref_snapshot').select('id').order('created_at', { ascending: false }).limit(1).single()
            .then(function(res) { if (res.data) loadSnapshot(res.data.id); });

          if (typeof initAssistant === 'function') initAssistant();

          if (dataReady) await dataReady;

          // Wire sidebar navigation after data+rendering are complete
          window.onSubItemSelected = function(sectionId, subItemId) {
            if (subItemId && subItemId.startsWith('r-')) {
              if (typeof window.renderResultsSubItem === 'function') {
                window.renderResultsSubItem(subItemId);
              }
            } else {
              if (typeof window.renderSubItemContent === 'function') {
                window.renderSubItemContent(subItemId);
              }
            }
            if (typeof updateBreadcrumb === 'function') updateBreadcrumb();
            setTimeout(function() { updateFieldValidation(true); }, 100);
          };
          if (typeof initSidebar === 'function') initSidebar();
          if (typeof initSidebarSearch === 'function') initSidebarSearch();
          if (typeof initWorkspaceHeader === 'function') initWorkspaceHeader();
          setTimeout(function() { updateFieldValidation(true); }, 500);

          // Tutorial resume check
          if (typeof checkTutorialResume === 'function' && checkTutorialResume()) return;

          var params = new URLSearchParams(window.location.search);
          if (params.get('new') === '1') {
            if (typeof showWizard === 'function') showWizard();
          } else if (params.get('tutorial') === 'sunzia' && typeof TUTORIAL_STEPS !== 'undefined' && TUTORIAL_STEPS.sunzia) {
            var tutorialScenario = await addScenarioToSession(null, null,
              { timestamp: new Date().toISOString(), source: 'tutorial' },
              'SunZia Southwest (Tutorial)');
            setActiveScenario(tutorialScenario);
            setTimeout(function() {
              startTutorial(TUTORIAL_STEPS.sunzia, tutorialScenario.id);
            }, 500);
          } else if (params.get('scenario')) {
            var scenarioId = params.get('scenario');
            var found = window.FORGE.sessionScenarios.find(function(s) { return s.id === scenarioId; });
            if (found && typeof setActiveScenario === 'function') setActiveScenario(found);
          } else if (window.FORGE.sessionScenarios.length > 0) {
            var userScenarios = window.FORGE.sessionScenarios.filter(function(s) { return s.user_id === session.user.id; });
            var latest = userScenarios.length > 0 ? userScenarios[0] : window.FORGE.sessionScenarios[0];
            if (typeof setActiveScenario === 'function') setActiveScenario(latest);
          }
        });
      }

      }); // End DOMContentLoaded

})();
