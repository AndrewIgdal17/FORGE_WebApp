/* eslint-disable quotes */
var TUTORIAL_STEPS = {
  sunzia: [
    // ── Section A: Technology ──────────────────────────────────────────
    {
      type: 'info',
      title: 'SunZia Southwest',
      body: 'Let\'s build the SunZia Southwest Transmission Project \u2014 a 550-mile, \u00b1525 kV bipolar HVDC line from Corona, NM to Pinal Central, AZ.',
      position: 'bottom'
    },
    {
      type: 'info',
      target: '#sidebar',
      title: 'The Sidebar',
      body: 'The sidebar organizes every input into collapsible sections. Click a sub-item to load its form. The numbers show how many fields each section contains.',
      position: 'right'
    },
    {
      type: 'goto',
      target: '.sidebar-subitem[data-sub-item-id="technology"]',
      title: 'Navigate to Technology',
      body: 'Click <strong>Technology</strong> in the sidebar to load the first set of inputs.',
      position: 'right'
    },
    {
      type: 'set',
      target: '[data-path="01_project_technical_details.project.construction_type"]',
      title: 'Construction Type',
      body: 'Set to Overhead. SunZia is carried on ~2,200 lattice towers and steel poles.',
      value: 'Overhead',
      expected: 'Overhead',
      position: 'bottom'
    },
    {
      type: 'set',
      target: '[data-path="01_project_technical_details.project.ac_dc"]',
      title: 'AC/DC',
      body: 'Set to DC. SunZia is a \u00b1525 kV bipolar HVDC line using Hitachi HVDC Light VSC technology.',
      value: 'DC',
      expected: 'DC',
      position: 'bottom'
    },
    {
      type: 'set',
      target: '[data-path="01_project_technical_details.project.capacity_mw"]',
      title: 'Capacity (MW)',
      body: 'Enter 2400. SunZia\'s rated capacity is 3,021 MW; 2400 is the closest the model supports.',
      value: '2400',
      expected: 2400,
      displayValue: '2400',
      position: 'bottom'
    },
    {
      type: 'set',
      target: '[data-path="01_project_technical_details.project.line_utilization"]',
      title: 'Line Utilization',
      body: 'Enter 54%. SunZia Wind\'s 3,500 MW at ~46% capacity factor delivers ~1,610 MW average on a 3,000 MW line.',
      value: '54%',
      expected: 54,
      displayValue: '54',
      position: 'bottom'
    },
    {
      type: 'goto',
      target: '.sidebar-subitem[data-sub-item-id="conductor-details"]',
      title: 'Navigate to Conductors',
      body: 'Click <strong>Conductors</strong> in the sidebar to continue.',
      position: 'right'
    },
    {
      type: 'set',
      target: '[data-path="01_project_technical_details.project.conductor_type"]',
      title: 'Conductor Type',
      body: 'Select Standard Aluminum Conductor. SunZia uses 2156 kcmil Bluebird ACSR in three-conductor bundles per pole.',
      value: 'Standard Aluminum Conductor',
      expected: 'Standard Aluminum Conductor',
      position: 'bottom'
    },
    {
      type: 'goto',
      target: '.sidebar-subitem[data-sub-item-id="converter-details"]',
      title: 'Navigate to Converters',
      body: 'Click <strong>Converters</strong> in the sidebar to continue.',
      position: 'right'
    },
    {
      type: 'set',
      target: '[data-path="01_project_technical_details.project.converter_type"]',
      title: 'Converter Type',
      body: 'Select VSC Converter. SunZia uses Hitachi Energy voltage-source converters with MMC topology.',
      value: 'VSC Converter',
      expected: 'VSC Converter',
      position: 'bottom'
    },
    {
      type: 'set',
      target: '[data-path="01_project_technical_details.project.number_of_converters"]',
      title: 'Number of Converters',
      body: 'Enter 2. One converter station at each end (Corona, NM and Pinal Central, AZ).',
      value: '2',
      expected: 2,
      displayValue: '2',
      position: 'bottom'
    },

    // ── Section B: Timeline ────────────────────────────────────────────
    {
      type: 'goto',
      target: '.sidebar-subitem[data-sub-item-id="timeline"]',
      title: 'Navigate to Timeline',
      body: 'Click <strong>Timeline</strong> in the sidebar to continue.',
      position: 'right'
    },

    {
      type: 'set',
      target: '[data-path="01_project_technical_details.timeline.construction_years"]',
      title: 'Construction Years',
      body: 'Enter 3. Construction began September 2023, targeting mid-2026 commercial operations.',
      value: '3',
      expected: 3,
      displayValue: '3',
      position: 'bottom'
    },
    {
      type: 'set',
      target: '[data-path="01_project_technical_details.timeline.delay_years"]',
      title: 'Delay Years',
      body: 'Enter 0. We\'re modeling the no-delay scenario.',
      value: '0',
      expected: 0,
      displayValue: '0',
      position: 'bottom'
    },
    {
      type: 'set',
      target: '[data-path="01_project_technical_details.timeline.project_lifetime"]',
      title: 'Project Lifetime',
      body: 'Enter 40. Standard transmission asset life.',
      value: '40',
      expected: 40,
      displayValue: '40',
      position: 'bottom'
    },

    // ── Section C: Terrain Mix ─────────────────────────────────────────
    {
      type: 'goto',
      target: '.sidebar-subitem[data-sub-item-id="terrain-mix"]',
      title: 'Navigate to Terrain Mix',
      body: 'Click <strong>Terrain Mix</strong> in the sidebar to continue.',
      position: 'right'
    },

    {
      type: 'info',
      title: 'Terrain Mix',
      body: 'SunZia crosses 550 miles from Corona, NM to Pinal Central, AZ. Enter miles by terrain type.',
      position: 'bottom'
    },
    {
      type: 'set',
      target: '[data-path="02_project_physical_details.terrain.terrain_miles.desert_barren"]',
      title: 'Desert/Barren',
      body: 'Enter 350. The route crosses the Chihuahuan Desert through Luna, Grant, Hidalgo, and Sierra counties.',
      value: '350',
      expected: 350,
      displayValue: '350',
      position: 'bottom'
    },
    {
      type: 'set',
      target: '[data-path="02_project_physical_details.terrain.terrain_miles.scrubbed_flat"]',
      title: 'Scrubbed Flat',
      body: 'Enter 100. Central NM grasslands in Socorro and Torrance counties.',
      value: '100',
      expected: 100,
      displayValue: '100',
      position: 'bottom'
    },
    {
      type: 'set',
      target: '[data-path="02_project_physical_details.terrain.terrain_miles.rolling_hills"]',
      title: 'Rolling Hills',
      body: 'Enter 60. Basin-and-range foothills along BLM route modification areas.',
      value: '60',
      expected: 60,
      displayValue: '60',
      position: 'bottom'
    },
    {
      type: 'set',
      target: '[data-path="02_project_physical_details.terrain.terrain_miles.mountain"]',
      title: 'Mountain',
      body: 'Enter 30. Helicopter-only construction zones and terrain-constrained segments.',
      value: '30',
      expected: 30,
      displayValue: '30',
      position: 'bottom'
    },
    {
      type: 'set',
      target: '[data-path="02_project_physical_details.terrain.terrain_miles.farmland"]',
      title: 'Farmland',
      body: 'Enter 10. Rio Grande crossing irrigated areas near Sevilleta NWR.',
      value: '10',
      expected: 10,
      displayValue: '10',
      position: 'bottom'
    },
    {
      type: 'info',
      title: 'Remaining Terrain',
      body: 'Leave all other terrain types at 0.',
      position: 'bottom'
    },

    // ── Section D: Rights of Way ───────────────────────────────────────
    {
      type: 'goto',
      target: '.sidebar-subitem[data-sub-item-id="rights-of-way"]',
      title: 'Navigate to Rights of Way',
      body: 'Click <strong>Rights of Way</strong> in the sidebar to continue.',
      position: 'right'
    },

    {
      type: 'info',
      title: 'Rights of Way',
      body: 'SunZia acquires new right-of-way across federal, state, and private land. BLM issued the ROW grant in January 2015 (confirmed May 2023). Set up 3 zones by land ownership.',
      position: 'bottom'
    },
    {
      type: 'set',
      target: '[data-path="11_project_row_details.right_of_way.zone_1.miles"]',
      title: 'Zone 1 Miles',
      body: 'Enter 183. BLM-administered public lands.',
      value: '183',
      expected: 183,
      displayValue: '183',
      position: 'bottom'
    },
    {
      type: 'set',
      target: '[data-path="11_project_row_details.right_of_way.zone_1.acquisition_cost"]',
      title: 'Zone 1 Acquisition Cost',
      body: 'Enter $299/acre. BLM federal land rate.',
      value: '299',
      expected: 299,
      displayValue: '299',
      position: 'bottom'
    },
    {
      type: 'set',
      target: '[data-path="11_project_row_details.right_of_way.zone_1.hold_cost"]',
      title: 'Zone 1 Holding Cost',
      body: 'Enter $9.70/acre/yr. Annual holding fee during the permitting period.',
      value: '9.70',
      expected: 9.70,
      displayValue: '9.70',
      position: 'bottom'
    },
    {
      type: 'set',
      target: '[data-path="11_project_row_details.right_of_way.zone_2.miles"]',
      title: 'Zone 2 Miles',
      body: 'Enter 220. NM and AZ state trust land.',
      value: '220',
      expected: 220,
      displayValue: '220',
      position: 'bottom'
    },
    {
      type: 'set',
      target: '[data-path="11_project_row_details.right_of_way.zone_2.acquisition_cost"]',
      title: 'Zone 2 Acquisition Cost',
      body: 'Enter $579/acre. State trust land rate.',
      value: '579',
      expected: 579,
      displayValue: '579',
      position: 'bottom'
    },
    {
      type: 'set',
      target: '[data-path="11_project_row_details.right_of_way.zone_2.hold_cost"]',
      title: 'Zone 2 Holding Cost',
      body: 'Enter $18.78/acre/yr. Annual holding fee during the permitting period.',
      value: '18.78',
      expected: 18.78,
      displayValue: '18.78',
      position: 'bottom'
    },
    {
      type: 'set',
      target: '[data-path="11_project_row_details.right_of_way.zone_3.miles"]',
      title: 'Zone 3 Miles',
      body: 'Enter 147. Private and other land.',
      value: '147',
      expected: 147,
      displayValue: '147',
      position: 'bottom'
    },
    {
      type: 'set',
      target: '[data-path="11_project_row_details.right_of_way.zone_3.acquisition_cost"]',
      title: 'Zone 3 Acquisition Cost',
      body: 'Enter $1,132/acre. Private land rate.',
      value: '1132',
      expected: 1132,
      displayValue: '1132',
      position: 'bottom'
    },
    {
      type: 'set',
      target: '[data-path="11_project_row_details.right_of_way.zone_3.hold_cost"]',
      title: 'Zone 3 Holding Cost',
      body: 'Enter $36.72/acre/yr.',
      value: '36.72',
      expected: 36.72,
      displayValue: '36.72',
      position: 'bottom'
    },

    // ── Section E: Financing ───────────────────────────────────────────
    {
      type: 'goto',
      target: '.sidebar-subitem[data-sub-item-id="rates"]',
      title: 'Navigate to Rates & Discounting',
      body: 'Click <strong>Rates & Discounting</strong> in the sidebar to continue.',
      position: 'right'
    },

    {
      type: 'set',
      target: '[data-path="03_financing.financial.wacc_nominal"]',
      title: 'WACC (Nominal)',
      body: 'Enter 7.5%. Pattern Energy\'s $11B financing is non-recourse bank debt; no public cost-of-capital disclosure. Typical range for 2023 project finance: 7\u20139%.',
      value: '7.5%',
      expected: 7.5,
      displayValue: '7.5',
      position: 'bottom'
    },
    {
      type: 'set',
      target: '[data-path="03_financing.financial.social_discount_rate"]',
      title: 'Social Discount Rate',
      body: 'Enter 3%. OMB Circular A-4 standard for public benefit analysis.',
      value: '3%',
      expected: 3,
      displayValue: '3',
      position: 'bottom'
    },
    {
      type: 'set',
      target: '[data-path="03_financing.financial.inflation_rate"]',
      title: 'Inflation Rate',
      body: 'Enter 3%.',
      value: '3%',
      expected: 3,
      displayValue: '3',
      position: 'bottom'
    },
    {
      type: 'set',
      target: '[data-path="03_financing.financial.base_year"]',
      title: 'Base Year',
      body: 'Enter 2025. Construction midpoint.',
      value: '2025',
      expected: 2025,
      displayValue: '2025',
      position: 'bottom'
    },
    {
      type: 'goto',
      target: '.sidebar-subitem[data-sub-item-id="afudc"]',
      title: 'Navigate to AFUDC',
      body: 'Click <strong>AFUDC</strong> in the sidebar to continue.',
      position: 'right'
    },
    {
      type: 'set',
      target: '[data-path="03_financing.financial.afudc.apply_afudc"]',
      title: 'AFUDC',
      body: 'Enable AFUDC. Standard for multi-year construction projects.',
      value: 'true',
      expected: true,
      displayValue: 'true',
      position: 'bottom'
    },

    // ── Section F: Congestion ────────────────────────────
    {
      type: 'goto',
      target: '.sidebar-subitem[data-sub-item-id="system-constraints"]',
      title: 'Navigate to System Constraints',
      body: 'Click <strong>System Constraints</strong> in the sidebar to continue.',
      position: 'right'
    },

    {
      type: 'info',
      title: 'Congestion',
      body: 'SunZia relieves the NM-to-AZ export constraint. NM currently has a 900 MW firm export limit but 2,000+ MW of installed wind (RETA 2022).',
      position: 'bottom'
    },
    {
      type: 'set',
      target: '[data-path="17_congestion_reductions.greenfield_congestion_reductions.constraints.constrained_hours"]',
      title: 'Constrained Hours',
      body: 'Enter 4000. The NM export constraint binds ~50% of wind-producing hours.',
      value: '4000',
      expected: 4000,
      displayValue: '4000',
      position: 'bottom'
    },
    {
      type: 'set',
      target: '[data-path="17_congestion_reductions.greenfield_congestion_reductions.constraints.average_exceedance"]',
      title: 'Average Exceedance',
      body: 'Enter 500 MW. Flow exceeds the 900 MW firm limit by this amount on average.',
      value: '500',
      expected: 500,
      displayValue: '500',
      position: 'bottom'
    },
    {
      type: 'set',
      target: '[data-path="17_congestion_reductions.greenfield_congestion_reductions.constraints.flow_factor"]',
      title: 'Flow Factor',
      body: 'Enter 1.0. Dedicated point-to-point HVDC link with full deliverability.',
      value: '1.0',
      expected: 1.0,
      displayValue: '1.0',
      position: 'bottom'
    },
    {
      type: 'set',
      target: '[data-path="17_congestion_reductions.greenfield_congestion_reductions.prices.average_congestion_price"]',
      title: 'Congestion Price',
      body: 'Enter $15/MWh. Estimated NM-to-AZ price spread (no organized market LMP pre-EDAM).',
      value: '15',
      expected: 15,
      displayValue: '15',
      position: 'bottom'
    },

    // ── Section G: Energy Source Mix ────────────────────────────────────
    {
      type: 'goto',
      target: '.sidebar-subitem[data-sub-item-id="energy-emissions-energy"]',
      title: 'Navigate to Grid Mix',
      body: 'Click <strong>Energy Source Mix</strong> in the sidebar to continue.',
      position: 'right'
    },

    {
      type: 'info',
      title: 'Grid Mix',
      body: 'Set the regional grid mix at year 0. For SunZia, use the Arizona grid generation profile that delivered energy displaces (EIA Arizona Electricity Profile 2024).',
      position: 'bottom'
    },
    {
      type: 'set',
      target: '[data-path="18_energy_source_mix.grid_mix.initial.natural_gas"]',
      title: 'Natural Gas',
      body: 'Enter 48%. EIA 2024: Arizona is 47.5% natural gas.',
      value: '48',
      expected: 48,
      displayValue: '48',
      position: 'bottom'
    },
    {
      type: 'set',
      target: '[data-path="18_energy_source_mix.grid_mix.initial.nuclear"]',
      title: 'Nuclear',
      body: 'Enter 28%. EIA 2024: 27.9%. Palo Verde baseload.',
      value: '28',
      expected: 28,
      displayValue: '28',
      position: 'bottom'
    },
    {
      type: 'set',
      target: '[data-path="18_energy_source_mix.grid_mix.initial.solar"]',
      title: 'Solar',
      body: 'Enter 9%. EIA 2024: 9.3% utility-scale solar.',
      value: '9',
      expected: 9,
      displayValue: '9',
      position: 'bottom'
    },
    {
      type: 'set',
      target: '[data-path="18_energy_source_mix.grid_mix.initial.coal"]',
      title: 'Coal',
      body: 'Enter 8%. EIA 2024: 8.5%. Cholla retiring 2025; Coronado phasing down.',
      value: '8',
      expected: 8,
      displayValue: '8',
      position: 'bottom'
    },
    {
      type: 'set',
      target: '[data-path="18_energy_source_mix.grid_mix.initial.hydro"]',
      title: 'Hydro',
      body: 'Enter 5%. EIA 2024: 4.6%. Colorado River constrained.',
      value: '5',
      expected: 5,
      displayValue: '5',
      position: 'bottom'
    },
    {
      type: 'set',
      target: '[data-path="18_energy_source_mix.grid_mix.initial.wind"]',
      title: 'Wind',
      body: 'Enter 2%. EIA 2024: 2.2%. Limited AZ wind resource.',
      value: '2',
      expected: 2,
      displayValue: '2',
      position: 'bottom'
    },
    {
      type: 'info',
      title: 'Growth Rates',
      body: 'Leave pre-COD and post-COD growth rates at their defaults for this tutorial. In production scenarios, post-COD rates would reflect how SunZia accelerates regional decarbonization.',
      position: 'bottom'
    },

    // ── Section H: Calculate & View Results ────────────────────────────
    {
      type: 'info',
      title: 'Calculate',
      body: 'All inputs are set. Results calculate automatically.',
      position: 'bottom'
    },
    {
      type: 'info',
      title: 'Calculating\u2026',
      body: 'Wait for calculation to complete.',
      position: 'bottom'
    },
    {
      type: 'info',
      title: 'Tutorial Complete',
      body: 'Your SunZia scenario is complete! Switch to Results to explore your cost-benefit analysis. This scenario is saved to your account.',
      position: 'bottom'
    }
  ]
};
