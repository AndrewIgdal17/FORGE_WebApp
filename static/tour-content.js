var TOUR_STEPS = (function () {

  // ── Section 2: Scenarios — Manage (full-tour first visit) ──

  var manageSteps = [
    {
      target: '#scenario-subtabs',
      title: 'Scenario Manager',
      body: 'This page is your hub for organizing saved scenarios and comparing alternatives side by side.',
      position: 'bottom'
    },
    {
      target: '#scenario-subtabs',
      title: 'Page Tabs',
      body: 'Switch between Manage (your scenario library), Compare (side-by-side metrics), and What-If (links to Workspace for live analysis).',
      position: 'bottom'
    },
    {
      target: '.pill-tab[data-scenario-tab="manage"]',
      title: 'Manage Tab',
      body: 'The Manage tab lists every scenario in your account. This is where you organize, rename, and maintain your library.',
      position: 'bottom'
    },
    {
      target: '.scenario-toolbar',
      title: 'Toolbar',
      body: 'Quick actions for creating new scenarios and importing existing files live at the top of the list.',
      position: 'bottom'
    },
    {
      target: '#new-scenario-btn',
      title: 'New Scenario',
      body: 'Opens the Workspace with a fresh scenario. A creation wizard helps you set key project parameters before diving into detailed inputs.',
      position: 'bottom'
    },
    {
      target: '#scenario-upload-btn',
      title: 'Load from File',
      body: 'Import one or more scenario files (.forge portable JSON or .csv spreadsheet). Imported scenarios appear in the list below.',
      tip: 'You can also reach this from the Load from File button on the Home page.',
      position: 'bottom'
    },
    {
      target: '#scenario-list',
      title: 'Scenario List',
      body: 'Each row shows a saved scenario with its name, key parameters, and source. Use Open to load it in the Workspace, or Duplicate, Remove, and Delete from the action buttons. Click a name to rename it inline.',
      position: 'top'
    },
    {
      target: '.pill-tab[data-scenario-tab="compare"]',
      title: 'Compare Tab',
      body: 'The Compare tab lets you pick scenarios and view benefit-cost metrics side by side. We\u2019ll explore it in detail shortly.',
      position: 'bottom'
    },
    {
      target: '.pill-tab[data-scenario-tab="what-if"]',
      title: 'What-If Tab',
      body: 'What-If redirects to the Workspace where you can run live design-comparison calculations with inputs and results updating in real time.',
      position: 'bottom'
    },
    {
      target: '.app-top-nav-link[data-nav="workspace"]',
      title: 'Continue to Workspace',
      body: 'Now let\u2019s see where the real work happens \u2014 building and analyzing transmission scenarios.',
      position: 'bottom',
      action: { type: 'navigate', url: '/app/workspace' }
    }
  ];

  // ── Section 5: Scenarios — Compare (full-tour second visit) ──

  var compareSteps = [
    {
      target: '.pill-tab[data-scenario-tab="compare"]',
      title: 'Compare Tab',
      body: 'Click the <strong>Compare</strong> tab to see how your scenarios stack up against each other.',
      position: 'bottom',
      action: { type: 'userClick', target: '.pill-tab[data-scenario-tab="compare"]' }
    },
    {
      target: '#compare-scenario-selector',
      title: 'Select Scenarios',
      body: 'Check the scenarios you want to compare. Use Select All to pick every scenario, or choose individually. You can also set one scenario as a baseline for delta columns.',
      position: 'bottom'
    },
    {
      target: '#comparison-section',
      title: 'Comparison Table',
      body: 'Selected scenarios appear here with columns for societal BCR, total PV cost, and more. Use the Add column button in the table header to include additional metrics.',
      position: 'top'
    },
    {
      target: '#compare-baseline-btn',
      title: 'Baseline & Deltas',
      body: 'Set one scenario as a baseline, then toggle Show \u0394 and Show % \u0394 to see how other scenarios differ in absolute and percentage terms. Positive \u0394Cost = project is cheaper (avoided cost); Positive \u0394Benefit = project delivers more benefit.',
      position: 'bottom'
    },
    {
      target: '#copy-table-btn',
      title: 'Copy Table',
      body: 'Copies the visible comparison (including delta rows) as tab-separated values for pasting into Excel or Google Sheets.',
      position: 'bottom'
    },
    {
      target: '#export-png-btn',
      title: 'Export PNG',
      body: 'Downloads the current comparison table as an image file, ready for slides, reports, or email.',
      position: 'bottom'
    },
    {
      target: '#cmp-auto-sort-columns',
      title: 'Auto-sort Columns',
      body: 'When enabled, newly added metric columns snap into the standard catalog order instead of appending at the end.',
      position: 'left'
    },
    {
      target: '.app-top-nav-logo',
      title: 'Tour Complete!',
      body: 'You\u2019ve explored all the key features of FORGE. Create a new scenario from Home, or dive into an existing one from Scenarios.',
      position: 'bottom'
    }
  ];

  return {

    // ── Section 1: Home ──

    home: [
      {
        target: '.app-top-nav',
        title: 'Navigation Bar',
        body: 'This bar stays visible on every page so you can move between Home, Workspace, and Scenarios at any time.',
        position: 'bottom'
      },
      {
        target: '.app-top-nav-logo',
        title: 'Home Link',
        body: 'Click the FORGE logo anywhere in the app to return to this Home page.',
        position: 'bottom'
      },
      {
        target: '.app-top-nav-links',
        title: 'Page Links',
        body: 'Use these links to switch between Home, Workspace, and Scenarios. The active page is highlighted.',
        position: 'bottom'
      },
      {
        target: '#landing-new-scenario-btn',
        title: 'New Scenario',
        body: 'Start building a fresh transmission scenario in the Workspace. A guided wizard helps you set key project choices before diving into detailed inputs.',
        tip: 'The wizard pre-fills inputs so you can refine details in the sidebar afterward.',
        position: 'bottom'
      },
      {
        target: '#landing-load-file-btn',
        title: 'Load from File',
        body: 'Import a previously exported scenario file (.forge or .csv) instead of building from scratch. You\u2019ll land on Scenarios with the upload dialog open.',
        position: 'bottom'
      },
      {
        target: '#landing-tour-btn',
        title: 'Guided Tour',
        body: 'Restart this orientation tour anytime. It walks through every major part of the app page by page.',
        position: 'bottom'
      },
      {
        target: '#landing-goto-scenarios-btn',
        title: 'Go to Scenarios',
        body: 'Open your saved scenarios list. This button enables automatically after you save your first scenario.',
        position: 'bottom'
      },
      {
        target: '.app-top-nav-link[data-nav="scenarios"]',
        title: 'Continue to Scenarios',
        body: 'Let\u2019s head to Scenarios to see how your work is organized.',
        position: 'bottom',
        action: { type: 'navigate', url: '/app/scenarios-manager' }
      }
    ],

    // Per-page tour for scenarios uses all steps (manage + compare).
    // Full tour uses scenarios_manage on first visit, scenarios_compare on second.
    scenarios_manage: manageSteps,
    scenarios_compare: compareSteps,
    scenarios: manageSteps.concat(compareSteps),

    // ── Sections 3 & 4: Workspace — Inputs then Results ──

    workspace: [
      // ── Inputs (steps 0–14) ──
      {
        target: '#scenario-bar',
        title: 'Scenario Bar',
        body: 'This bar identifies the active scenario and gives you quick access to save, rename, and export actions.',
        position: 'bottom'
      },
      {
        target: '#scenario-name-display',
        title: 'Click to Rename',
        body: 'Click the scenario name to rename it inline. Changes are saved to the database when you confirm.',
        tip: 'You can also choose Rename from the save dropdown menu.',
        position: 'bottom'
      },
      {
        target: '#split-save',
        title: 'Save Controls',
        body: 'The split button saves your work. Click the \u25BE chevron to open a menu with Save as Copy, Rename, and export options (.forge and .csv formats).',
        tip: 'Press \u2318S (Mac) or Ctrl+S (Windows) to save from anywhere on the page.',
        position: 'bottom'
      },
      {
        target: '.view-toggle',
        title: 'View Switcher',
        body: 'Switch between Inputs, Results, and Sensitivity views. Each view changes the sidebar and main content area.',
        position: 'bottom'
      },
      {
        target: '.view-toggle-btn[data-view="inputs"]',
        title: 'Inputs View',
        body: 'Build and edit your transmission scenario here. The sidebar lists every input section organized by topic.',
        position: 'bottom'
      },
      {
        target: '#header-breadcrumb',
        title: 'Context Breadcrumb',
        body: 'Shows your current location in the active view, matching the section and sub-item selected in the sidebar.',
        position: 'bottom'
      },
      {
        target: '#calc-time',
        title: 'Last Calculated',
        body: 'Shows when results were last computed. It reads "Not calculated" until you fill required inputs and the model runs automatically.',
        position: 'left'
      },
      {
        target: '#sidebar',
        title: 'Sidebar',
        body: 'The sidebar organizes all input categories into collapsible sections. Field counts and validation badges appear on each sub-item to track completeness.',
        position: 'right'
      },
      {
        target: '#sidebar-search-input',
        title: 'Search Fields',
        body: 'Type to filter sidebar items by name and jump directly to a specific input group without scrolling.',
        position: 'right'
      },
      {
        target: '.sidebar-section[data-section-id="project-identity"] .sidebar-section-header',
        title: 'Sections',
        body: 'Click a section header to expand or collapse its sub-items. Each section has a color dot that matches the content header above the form.',
        position: 'right'
      },
      {
        target: '.sidebar-subitem[data-sub-item-id="technology"]',
        title: 'Sub-Items',
        body: 'Click a sub-item to load its input form in the content panel. Red badges indicate missing required fields that need attention before calculating.',
        position: 'right'
      },
      {
        target: '#content-panel',
        title: 'Content Panel',
        body: 'Input fields render here as forms with dropdowns, number inputs, and toggles. Edits are stored in memory and trigger automatic recalculation when all required fields are filled.',
        position: 'top'
      },
      {
        target: '.view-toggle-btn[data-view="results"]',
        title: 'Switch to Results',
        body: 'Now let\u2019s see what your inputs produce. Click <strong>Results</strong> above to continue.',
        position: 'bottom',
        action: { type: 'userClick', target: '.view-toggle-btn[data-view="results"]' }
      },

      // ── Results (steps 15–22) ──
      {
        target: '#content-panel',
        title: 'Results Overview',
        body: 'The Overview shows total costs and benefits at a glance with summary cards, cost and benefit composition breakdowns, and key ratios.',
        position: 'top'
      },
      {
        target: '.sidebar-subitem[data-sub-item-id="r-overview"]',
        title: 'Overview',
        body: 'The Overview sub-item is selected by default, showing hero metrics and composition charts. Results update whenever inputs change and required fields are filled.',
        position: 'right'
      },
      {
        target: '.sidebar-subitem[data-sub-item-id="r-bcr"]',
        title: 'BCR Analysis',
        body: 'Click <strong>BCR Analysis</strong> in the sidebar to see detailed benefit-cost ratio analysis.',
        position: 'right',
        action: { type: 'userClick', target: '.sidebar-subitem[data-sub-item-id="r-bcr"]' }
      },
      {
        target: '.sidebar-section[data-section-id="r-costs"] .sidebar-section-header',
        title: 'Costs Breakdown',
        body: 'Click a section header to expand it and drill into individual cost categories. Costs includes Capital, Operational, Risk, and Emissions sub-items.',
        position: 'right',
        action: { type: 'click', target: '.sidebar-section[data-section-id="r-costs"] .sidebar-section-header' }
      },
      {
        target: '.sidebar-subitem[data-sub-item-id="r-capital"]',
        title: 'Cost Drill-In',
        body: 'Select any cost sub-item to see a detailed breakdown with line items and present-value totals in the content panel.',
        position: 'right'
      },
      {
        target: '.sidebar-section[data-section-id="r-benefits"] .sidebar-section-header',
        title: 'Benefits Breakdown',
        body: 'The Benefits section works the same way \u2014 expand it to drill into Congestion Reduction, Remedial Benefits, Enabling Benefits, Avoided Emissions, and Line Loss Compensation Emissions.',
        position: 'right'
      },
      {
        target: '.view-toggle-btn[data-view="sensitivity"]',
        title: 'Sensitivity',
        body: 'Sensitivity analysis tools are coming soon \u2014 tornado diagrams, spider plots, and break-even analysis for exploring parameter uncertainty.',
        position: 'bottom'
      },
      {
        target: '.app-top-nav-link[data-nav="scenarios"]',
        title: 'Continue to Compare',
        body: 'Finally, let\u2019s see how to compare multiple scenarios side by side.',
        position: 'bottom',
        action: { type: 'navigate', url: '/app/scenarios-manager?tour=compare' }
      }
    ]

  };
})();
