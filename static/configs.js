// FORGE Config Objects
// Extracted from index.html — loaded via <script src="/static/configs.js"> before the main inline script.

// =============================================
// Comparison Metric Configs
// =============================================

      const COMPARISON_METRICS = [
        { group: 'Project Parameters', metrics: [
          { key: 'ac_dc', label: 'AC / DC', path: 'technical_parameters.ac_dc', format: 'text' },
          { key: 'baseline_price_mwh', label: 'Value of load ($/MWh)', path: 'technical_parameters.value_of_load_per_mwh', format: 'number2' },
          { key: 'capacity_mw', label: 'Capacity (MW)', path: 'technical_parameters.capacity_mw', format: 'number' },
          { key: 'conductor_type', label: 'Conductor type', path: 'technical_parameters.conductor_type', format: 'text' },
          { key: 'construction_years', label: 'Construction (yr)', path: 'technical_parameters.construction_years', format: 'number' },
          { key: 'construction_type', label: 'Construction type', path: 'technical_parameters.construction_type', format: 'text' },
          { key: 'converter_type', label: 'Converter type', path: 'technical_parameters.converter_type', format: 'text' },
          { key: 'delay_years', label: 'Delay (yr)', path: 'technical_parameters.delay_years', format: 'number' },
          { key: 'lifetime', label: 'Lifetime (yr)', path: 'technical_parameters.project_lifetime_years', format: 'number' },
          { key: 'line_length', label: 'Line length (mi)', path: 'technical_parameters.line_length_miles', format: 'number2' },
          { key: 'line_utilization', label: 'Line utilization', path: 'technical_parameters.line_utilization', format: 'number2' },
        ]},
        { group: 'BCR — Societal', metrics: [
          { key: 'bcr_societal', label: 'BCR Societal', path: 'bcr.bcr_societal', format: 'number3' },
        ]},
        { group: 'BCR — Firm', metrics: [
          { key: 'bcr_utility', label: 'BCR Utility', path: 'bcr.bcr_utility', format: 'number3' },
          { key: 'bcr_ratepayer', label: 'BCR Ratepayer', path: 'bcr.bcr_ratepayer', format: 'number3' },
        ]},
        { group: 'BCR — Custom', metrics: [
          { key: 'custom_bcr', label: 'Custom BCR', path: '__custom__', format: 'number3' },
        ]},
        { group: 'Costs (PV)', metrics: [
          { key: 'build_pv', label: 'Build Cost', path: 'costs.build.total_pv', format: 'currency' },
          { key: 'env_pv', label: 'Environmental Cost', path: 'costs.environmental.total_pv', format: 'currency' },
          { key: 'insurance_pv', label: 'Insurance Cost', path: 'costs.insurance.pv_total', format: 'currency', zeroIfMissing: true },
          { key: 'row_capital_pv', label: 'ROW Capital Cost', path: 'costs.row.row_capital_pv', format: 'currency' },
          { key: 'row_rent_pv', label: 'ROW Rent Cost', path: 'costs.row.row_rent_pv', format: 'currency' },
          { key: 'total_capital_pv', label: 'Total Capital Cost', path: 'summary.total_capital_pv', format: 'currency' },
          { key: 'total_operational_pv', label: 'Total Operational Cost', path: 'summary.total_operational_pv', format: 'currency' },
          { key: 'grand_total_pv', label: 'Total System Cost', path: 'summary.total_costs_pv', format: 'currency' },
        ]},
        { group: 'Benefits', metrics: [
          { key: 'benefits_remedial_pv', label: 'Remedial Benefits', path: 'bcr.benefits_remedial_pv', format: 'currency' },
          { key: 'benefits_enabling_pv', label: 'Enabling Benefits', path: 'bcr.benefits_enabling_pv', format: 'currency' },
          { key: 'benefits_avoided_emissions_pv', label: 'Avoided Emissions Benefits', path: 'bcr.benefits_avoided_emissions_pv', format: 'currency', zeroIfMissing: true },
          { key: 'congestion_pv', label: 'Congestion Benefits', path: 'bcr.congestion_benefit_pv', format: 'currency' },
          { key: 'custom_nb', label: 'Custom Net Benefit', path: '__custom__', format: 'currency' },
          { key: 'net_benefit_ratepayer_pv', label: 'Net Benefit (Ratepayer)', path: 'bcr.net_benefit_ratepayer_pv', format: 'currency' },
          { key: 'net_benefit_pv', label: 'Net Benefit (System)', path: 'bcr.net_benefit_pv', format: 'currency' },
          { key: 'net_benefit_utility_pv', label: 'Net Benefit (Utility)', path: 'bcr.net_benefit_utility_pv', format: 'currency' },
          { key: 'revenue_pv', label: 'Revenue', path: 'bcr.revenue_pv', format: 'currency' },
          { key: 'total_benefits_pv', label: 'Total Benefits', path: 'bcr.total_benefits_pv', format: 'currency' },
        ]},
        { group: 'Cost Categories (PV)', metrics: [
          { key: 'hard_costs_pv', label: 'Hard Costs', path: 'bcr.hard_costs_pv', format: 'currency' },
          { key: 'soft_costs_pv', label: 'Soft Costs', path: 'bcr.soft_costs_pv', format: 'currency' },
          { key: 'emissions_costs_pv', label: 'Line Loss Compensation Emissions', path: 'bcr.emissions_costs_pv', format: 'currency' },
        ]},
        { group: 'Risk Costs (PV)', metrics: [
          { key: 'outage_pv', label: 'Outage Cost', path: 'costs.outage.pv_cost', format: 'currency', zeroIfMissing: true },
          { key: 'outage_loadshed_per_event', label: 'Outage Load-Shed Cost/Event', path: 'costs.outage.cost_loadshed', format: 'currency', zeroIfMissing: true },
          { key: 'outage_redispatch_per_event', label: 'Outage Redispatch Cost/Event', path: 'costs.outage.cost_redispatch', format: 'currency', zeroIfMissing: true },
          { key: 'outage_rho', label: 'Load-Shed Fraction (\u03C1)', path: 'costs.outage.rho', format: 'number2', zeroIfMissing: true },
          { key: 'total_risk_pv', label: 'Total Risk Cost', path: 'summary.total_risk_pv', format: 'currency' },
          { key: 'wildfire_pv', label: 'Wildfire Cost', path: 'costs.wildfire.pv_cost', format: 'currency', zeroIfMissing: true },
        ]},
        { group: 'Delay Costs (PV)', metrics: [
          { key: 'delay_pv', label: 'Base Delay Cost', path: 'costs.delay.total_pv', format: 'currency', zeroIfMissing: true },
        ]},
        { group: 'Energy / Emissions (PV)', metrics: [
          { key: 'emissions_pv', label: 'Line Loss Compensation Emissions', path: 'costs.emissions.total_pv', format: 'currency', zeroIfMissing: true },
          { key: 'fac_emissions_pv', label: 'Facilitated Emissions (intermediate)', path: 'bcr.fac_emissions_project_pv', format: 'currency', zeroIfMissing: true, description: 'Intermediate quantity. Social cost of generation emissions for energy delivered by this project path. Not a BCR cost or benefit.' },
          { key: 'line_loss_pv', label: 'Line Loss Cost', path: 'costs.line_loss.total_pv', format: 'currency', zeroIfMissing: true },
          { key: 'total_energy_emissions_pv', label: 'Line Loss + Line Loss Compensation Emissions', path: 'summary.total_energy_emissions_pv', format: 'currency', description: 'Sum of line loss costs and line loss compensation emissions. Does not include facilitated emissions or avoided emissions.' },
        ]},
        { group: 'BCR — Societal Exclusions', metrics: [
          { key: 'bcr_excl_av_em', label: 'BCR excl. Avoided Emissions', path: 'bcr.bcr_excluding_avoided_emissions', format: 'number3' },
          { key: 'bcr_excl_wf', label: 'BCR excl. Wildfire', path: 'bcr.bcr_excluding_wildfire_risk', format: 'number3' },
          { key: 'bcr_excl_wf_out', label: 'BCR excl. Wildfire + Outage', path: 'bcr.bcr_excluding_wildfire_risk_and_outage_risk', format: 'number3' },
        ]},
      ];

      /** Maps each COMPARISON_METRICS `group` to a super-group for the hierarchical add-column picker. */
      const COMPARISON_GROUP_SUPERGROUP = {
        'Project Parameters': 'project',
        'BCR — Societal': 'bcr',
        'BCR — System': 'bcr',
        'BCR — Firm': 'bcr',
        'BCR — Capital Screening': 'bcr',
        'Costs (PV)': 'costs',
        'Cost Categories (PV)': 'costs',
        'Benefits': 'benefits',
        'Risk Costs (PV)': 'costs',
        'Delay Costs (PV)': 'costs',
        'Energy / Emissions (PV)': 'costs',
        'BCR — Societal Exclusions': 'sensitivity',
      };

      const COMPARISON_SUPERGROUP_ORDER = ['project', 'bcr', 'costs', 'benefits', 'sensitivity'];
      const COMPARISON_SUPERGROUP_LABEL = {
        project: 'Project Information',
        bcr: 'Benefit-Cost Ratio (BCR)',
        costs: 'Costs',
        benefits: 'Benefits',
        sensitivity: 'BCR — Societal Exclusions',
      };

      const CMP_PICKER_STORAGE_KEY = 'forge-cmp-picker-details';

      // Comparison catalog: group order is fixed (BCR — Societal Exclusions last); within each group,
      // metrics are alphabetical by label. Flatten order drives sortComparisonColumnsByCatalog(); add-column UI is the
      // hierarchical popover (super-groups → catalog group → metric buttons), not a flat <select>.
      const COMPARISON_METRIC_KEY_ORDER = (() => {
        const order = new Map();
        let idx = 0;
        for (const g of COMPARISON_METRICS) {
          for (const m of g.metrics) {
            if (!order.has(m.key)) order.set(m.key, idx++);
          }
        }
        return order;
      })();

      const UNKNOWN_METRIC_CATALOG_INDEX = Number.MAX_SAFE_INTEGER;

      const CONDUCTOR_TYPE_BY_CONSTRUCTION = {
        'Overhead': ['Standard Aluminum Conductor', 'Advanced Aluminum Conductor'],
        'Underground Direct-Buried': ['Underground Copper Conductor'],
        'Underground Tunnel': ['Underground Copper Conductor'],
        'Subsea': ['Subsea Copper Conductor']
      };

      const CAPACITY_OPTIONS_BY_AC_DC = {
        'AC': [140, 329, 394, 460, 657, 1792, 2598, 6625],
        'DC': [500, 1500, 2000, 2400, 6000]
      };

// =============================================
// Input Form Configs — DELETED in Phase 4
// TAB_CONFIG, TAB_HIERARCHY, FIELD_METADATA, FIELD_CONFIG, CONDITIONAL_FIELDS,
// SECTION_FIELD_ORDER, FIELD_LABEL_RENAME all replaced by taxonomy-driven
// input_metadata (served via GET /api/input_metadata).
// =============================================
