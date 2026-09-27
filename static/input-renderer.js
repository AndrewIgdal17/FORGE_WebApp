// FORGE Input Form Renderer
// Extracted from index.html — loaded via <script src="/static/input-renderer.js">

(function() {
'use strict';
const C = window.FORGE;

const LOCK_SVG = '<svg width="11" height="11" viewBox="0 0 16 16"><rect x="3" y="7" width="10" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5 7V5a3 3 0 016 0v2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
const UNLOCK_SVG = '<svg width="11" height="11" viewBox="0 0 16 16"><rect x="3" y="7" width="10" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5 7V5a3 3 0 014 0" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
const SOURCE_ICON_SVG = '<svg width="10" height="10" viewBox="0 0 16 16"><path d="M13 1H3a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V3a2 2 0 00-2-2zM5 4h6v1H5V4zm0 3h6v1H5V7zm0 3h4v1H5v-1z" fill="currentColor"/></svg>';

// Field type detection and formatting
function isCurrencyField(path) {
  const lowerPath = path.toLowerCase();

  // Exclude non-currency fields that happen to contain "cost" in their section path
  const excludePatterns = [
    'ignition_rate', 'outage_duration', 'outage_rates',
    'ignition_rate_multiplier', 'outage_duration_multiplier',
    'discount_rate', 'risk_growth_rate',
    'capacity_at_risk_factor',
    'mitigation_uplift_factor'
  ];
  if (excludePatterns.some(pattern => lowerPath.includes(pattern))) {
    return false;
  }

  const currencyPatterns = [
    'severity_per_event',
    'value_of_lost_load',
    'acquisition_cost', 'rent_cost', 'hold_cost',
    '_cost_per_acre',
    'cost_per_kg',
    '_price',
    'annual_delay_costs.',
    'vegetation_management_om_costs.'
  ];

  // Delay cost sub-fields (only match when inside annual_delay_costs)
  if (lowerPath.includes('annual_delay_costs.')) {
    return true;
  }

  return currencyPatterns.some(pattern => lowerPath.includes(pattern));
}

function isPercentageField(path) {
  const lowerPath = path.toLowerCase();
  const percentPatterns = [
    'percent', '_rate', 'rate_', 'contingency', 'factor',
    'utilization',
    'inflation', 'wacc', 'discount', 'return_rate',
    'premium_rate', 'compensation_percent',
    'during_delay', 'during_construction', 'rate_of_change',
    'premium_by_construction_type'
  ];
  // Exclude fields that have "rate" or "percent" but aren't decimal percentages
  const excludePatterns = ['ignition_rate', 'outage_rate'];
  // grid_mix.initial.* is stored as whole numbers (10 = 10%), not decimals
  if (lowerPath.includes('grid_mix.initial.')) {
    return false;
  }
  // Legacy: energy_source_mix.*.percentage is stored as whole numbers (10 = 10%), not decimals
  if (lowerPath.includes('energy_source_mix') && lowerPath.endsWith('.percentage')) {
    return false;
  }
  if (excludePatterns.some(pattern => lowerPath.includes(pattern))) {
    return false;
  }
  return percentPatterns.some(pattern => lowerPath.includes(pattern));
}

function formatCurrencyInput(value) {
  if (value === null || value === undefined || value === '') return '';
  const num = typeof value === 'string' ? parseFloat(value.replace(/[$,]/g, '')) : value;
  if (isNaN(num)) return '';
  return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function parseCurrencyInput(value) {
  if (value === null || value === undefined || value === '') return null;
  const cleaned = String(value).replace(/[$,]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function formatPercentageInput(value) {
  if (value === null || value === undefined || value === '') return '';
  const num = typeof value === 'string' ? parseFloat(value.replace(/[%,]/g, '')) : value;
  if (isNaN(num)) return '';
  // Value is stored as decimal (0.1 = 10%), display as percentage number (no % sign — shown externally)
  const pct = num * 100;
  return pct.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function parsePercentageInput(value) {
  if (value === null || value === undefined || value === '') return null;
  const cleaned = String(value).replace(/[%,]/g, '');
  const num = parseFloat(cleaned);
  if (isNaN(num)) return null;
  // Convert back to decimal (10% = 0.1)
  return num / 100;
}

function formatNumberInput(value) {
  if (value === null || value === undefined || value === '') return '';
  const num = typeof value === 'string' ? parseFloat(value.replace(/,/g, '')) : value;
  if (isNaN(num)) return '';
  return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 6 });
}

function parseNumberInput(value) {
  if (value === null || value === undefined || value === '') return null;
  const cleaned = String(value).replace(/,/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function updateSliderFill(el) {
  const pct = ((el.value - el.min) / (el.max - el.min)) * 100;
  el.style.background = `linear-gradient(to right, #0066cc 0%, #0066cc ${pct}%, #ddd ${pct}%, #ddd 100%)`;
  el.style.backgroundSize = '100% 4px';
  el.style.backgroundPosition = 'center';
  el.style.backgroundRepeat = 'no-repeat';
}

const TAB_GUIDE_CONTENT = {
  // L2 tabs
  'project-technical': {
    oneliner: 'Define the physical, electrical, and geographic characteristics of your transmission project.',
    body: 'Every cost and benefit in the calculator flows from choices on this tab. Construction type, capacity, conductor, and route together form the \u201cproject category\u201d \u2014 the lookup key used for build costs, line losses, and maintenance rates from industry cost databases. An inaccurate project definition cascades into every downstream result.',
    items: ['Construction type, AC/DC, and transfer capacity', 'Route terrain breakdown and right-of-way (ROW) zones', 'Construction timeline and operating lifetime', 'Conductor and converter specifications'],
  },
  'financial': {
    oneliner: 'Define the economic rates and financing assumptions that drive every present-value calculation in your project.',
    body: 'The FORGE converts all costs and benefits to present value so they can be compared on equal footing. The rates you set here \u2014 your weighted average cost of capital (WACC), inflation rate, and social discount rate \u2014 determine how future dollars are translated into today\u2019s dollars. A higher discount rate shrinks distant costs and benefits; a lower one makes them weigh more heavily. These rates also feed the Allowance for Funds Used During Construction (AFUDC) calculation and the revenue requirement. Getting them wrong shifts the entire cost-benefit balance.',
    items: ['Discount and financing rates (WACC, inflation, social discount rate)', 'AFUDC capitalization rules and cost timing', 'Revenue requirement assumptions for the utility perspective'],
  },
  'capital-costs': {
    oneliner: 'Review and adjust the one-time construction costs that make up your project\u2019s capital budget.',
    body: 'Capital costs \u2014 conductors, structures, converters, and environmental mitigation \u2014 are typically the largest expense in a transmission project. They determine the rate base and directly influence revenue requirements and cost-effectiveness. Default values come from an industry cost database matched to your project configuration; you can apply contingency markups or override them with project-specific estimates.',
    items: ['Conductor, structure, and converter cost assumptions', 'Contingency markups for each component', 'Environmental mitigation and habitat credit costs'],
  },
  'operational': {
    oneliner: 'Define the recurring costs of operating and maintaining your transmission line over its lifetime.',
    body: 'Once a transmission line is built, it incurs annual costs for insurance, physical maintenance, and vegetation management \u2014 expenses that continue for decades. These operational costs are discounted to present value and aggregated into the project\u2019s total soft costs. Getting them right matters because even modest per-mile-per-year figures compound over a 40\u201360 year project lifetime into significant sums that affect cost-effectiveness.',
    items: ['Insurance premium rate and which assets to insure', 'Conductor, structure, and converter maintenance costs', 'Vegetation management costs by terrain type'],
  },
  'delay-costs': {
    oneliner: 'Estimate annual out-of-pocket costs during the pre-construction delay period.',
    body: 'Transmission projects often spend years in permitting and regulatory review before construction begins. During that time, direct expenses continue \u2014 legal counsel, staffing, regulatory filings, project management, and more. Enter your total annual pre-construction spend. The calculator multiplies this by the number of delay years you set in Project Details. Foregone congestion benefits during delay are modeled separately in the Benefits tab.',
    items: ['Annual base delay cost (total direct out-of-pocket spend per year of delay)'],
  },
  'risk': {
    oneliner: 'Define the wildfire and outage risk assumptions that drive the project\u2019s expected risk costs.',
    body: 'Transmission lines face two probabilistic risks: wildfires they may ignite and service outages they may experience. The calculator converts your line-level risk assumptions into an expected annual cost for each, then discounts that stream over the project lifetime. These risk costs are societal externalities \u2014 they don\u2019t enter rate base, but they can significantly shift the cost-effectiveness picture between project alternatives.',
    items: ['Wildfire ignition rates and expected loss per event', 'Outage frequency, duration, and network exposure', 'Whether each risk escalates over the project lifetime', 'Construction-type adjustments for each risk domain'],
  },
  'emissions': {
    oneliner: 'Define how your line\u2019s power is generated, how much energy is lost in transit, and what those emissions cost society.',
    body: 'Transmission lines lose energy to electrical resistance, and that lost energy must be replaced by generators. The fuel mix of those generators \u2014 and how it shifts over the project lifetime \u2014 determines the line\u2019s emission profile. This tab links generation sources to emission costs, enabling comparison between build and no-build scenarios.',
    items: ['Regional grid mix (initial shares and pre/post-COD growth rates)', 'Loss compensation rate', 'Emission intensities by fuel source and pollutant', 'Societal externality costs per pollutant'],
  },
  'benefits': {
    oneliner: 'Define the economic values and grid constraints that drive your project\u2019s benefit calculations.',
    body: 'A transmission project\u2019s benefits depend on two things: what electricity is worth and how constrained the grid is today. The economic values you set here \u2014 what served energy is worth, and what unserved energy costs \u2014 propagate across multiple cost and benefit modules throughout the model. The constraint parameters describe the congestion your project is designed to relieve, and determine the annual value of that relief.',
    items: ['Value of delivered energy (Value of Load)', 'Cost of unserved energy by outage duration (Value of Lost Load)', 'Congestion severity on the targeted transmission constraint', 'Congestion pricing'],
  },
  // L3 sub-tabs: Project Details
  'technology': {
    oneliner: 'Set the core engineering choices that define your transmission line.',
    body: 'Construction Type, AC/DC, and Capacity MW together form the \u201cproject category\u201d that determines which cost databases apply. Line Utilization \u2014 the average fraction of nameplate capacity used \u2014 scales energy delivery benefits and line loss costs.',
    items: ['Construction Type, AC/DC, and Capacity MW', 'Line Utilization', 'Reconductoring Project toggle (upgrading an existing line\u2019s conductors)'],
  },
  'timeline': {
    oneliner: 'Set the construction schedule and operating life for your project.',
    body: 'Construction Years controls how build spending is spread and compounded. Delay Years \u2014 the pre-construction permitting period \u2014 drives holding fees and delay costs. Project Lifetime sets the horizon over which annual costs and benefits accumulate. All three directly change net present value.',
    items: ['Construction Years, Delay Years, Project Lifetime'],
  },
  'routing': {
    oneliner: 'Describe the physical path your transmission line follows.',
    body: 'Terrain miles determine cost multipliers for construction, mitigation, and maintenance through \u201cweighted miles.\u201d Right-of-way (ROW) zone miles drive land acquisition, holding, and rent costs. Both must reconcile with your project total for internally consistent results.',
    items: ['Terrain miles by type (Terrain Mix)', 'ROW zone miles and land costs (Rights of Way)'],
  },
  'conductor-details': {
    oneliner: 'Select your conductor and review the resulting electrical parameters.',
    body: 'The conductor determines wire resistance, which drives line loss \u2014 a major lifetime cost. A read-only table shows derived parameters (voltage, phases, resistance) so you can verify the electrical consequences of your choices.',
    items: ['Conductor Type', 'Derived circuit parameters (read-only)'],
  },
  'structure-details': {
    oneliner: 'Review tower and pole density assumptions for your overhead line.',
    body: 'Structure density \u2014 towers per mile \u2014 varies by terrain and drives maintenance costs. Forested and mountainous terrain require more structures per mile, explaining their higher operations and maintenance (O&M) expense. This read-only tab shows the physical assumptions behind those numbers.',
    items: ['Structures per mile by terrain (read-only)', 'Maintenance cost per structure (read-only)'],
  },
  'converter-details': {
    oneliner: 'Configure the converter stations for your DC project.',
    body: 'DC lines need converter stations to transform between AC and DC at each end. Each converter adds capital cost, energy loss (0.75% for Line-Commutated Converters, 1.0% for Voltage Source Converters), and annual maintenance. Converter count and type directly affect both upfront investment and lifetime costs.',
    items: ['Converter Type (LCC or VSC)', 'Number of Converters', 'Derived loss and maintenance rate (read-only)'],
  },
  // L3 sub-tabs: Financial
  'rates': {
    oneliner: 'Set the core economic rates that the calculator uses to discount costs, compound construction spending, and estimate utility revenue.',
    body: 'The nominal WACC is converted to a real (inflation-adjusted) WACC using the Fisher equation \u2014 that real rate discounts all market-valued project cash flows. The social discount rate applies separately to externalities like emissions and risk costs. If you enable the revenue requirement, the allowed return rate determines the annual payment ratepayers owe on the project\u2019s capital base.',
    items: ['Base year for present-value reference', 'Inflation rate and nominal WACC (real WACC is derived automatically)', 'Social discount rate for externalities', 'Revenue requirement toggle and allowed return rate'],
  },
  'afudc': {
    oneliner: 'Control how construction-period spending is capitalized to the commercial operation date.',
    body: 'AFUDC (Allowance for Funds Used During Construction) compounds eligible costs at the WACC rate from the time they are incurred through the end of construction. It reflects the financing cost of capital tied up before the line earns revenue. The cost timing matrix lets you specify when each cost category is incurred \u2014 during the delay period, during construction, or both \u2014 and whether it qualifies for AFUDC.',
    items: ['Master AFUDC toggle (on/off)', 'Whether active work during the delay period earns AFUDC', 'Cost timing fractions (delay vs. construction) for nine cost categories', 'AFUDC eligibility per cost category'],
  },
  // L3 sub-tabs: Capital Costs
  'conductor': {
    oneliner: 'Review the conductor costs the calculator uses for your line configuration.',
    body: 'Conductor costs \u2014 both per-mile and fixed \u2014 are looked up from a national cost database based on your selected type and capacity. You can set a contingency markup and, if needed, override the defaults with your own estimates.',
    items: ['Contingency rate', 'Variable cost per mile and fixed cost'],
  },
  'structure': {
    oneliner: 'Review the support structure costs \u2014 towers, poles, or foundations \u2014 for your transmission line.',
    body: 'Structure costs scale with terrain-adjusted route miles and vary by construction type. This sub-tab appears only for new-build projects; reconductoring projects reuse existing structures.',
    items: ['Contingency rate', 'Variable cost per mile'],
  },
  'converter': {
    oneliner: 'Review converter station costs for your direct current (DC) project.',
    body: 'DC lines require converter stations to transform power between alternating current and direct current \u2014 large fixed-cost facilities often costing tens of millions of dollars each. This sub-tab appears only for new-build DC projects.',
    items: ['Contingency rate', 'Fixed cost per converter station'],
  },
  'environmental-mitigation': {
    oneliner: 'Set the environmental restoration and offset costs incurred during construction.',
    body: 'Construction disturbs land along the route. Mitigation covers base restoration costs by terrain and construction type, plus the purchase of wetland or habitat credits to offset permanent impacts \u2014 both are one-time capital expenditures.',
    items: ['Base restoration costs by terrain', 'Uplift factor for construction footprint beyond the right-of-way', 'Wetland and habitat credit costs'],
  },
  // L3 sub-tabs: Operational Costs
  'operational-insurance': {
    oneliner: 'Set the annual insurance premium rate and choose which asset classes to insure.',
    body: 'Operational insurance covers the replacement value of physical assets \u2014 conductors, structures, and converters \u2014 against loss or damage. The annual premium is a percentage of total insurable value, paid every year from the commercial operation date through end of life. Which components you include and the rate you apply directly determine this recurring cost stream.',
    items: ['Premium rate (percentage of insurable asset value)', 'Which components are insured (conductors, structures, converters)'],
  },
  'maintenance-costs': {
    oneliner: 'Review the maintenance costs for your transmission line.',
    body: 'Maintenance costs depend on construction type. Overhead lines use a component model (conductor + structures + vegetation). Non-overhead lines (underground, tunnel, subsea) use a percentage of line capital cost \u2014 reflecting that published benchmarks report total O&M without component decomposition. Converter maintenance (DC only) is always separate.',
    items: ['Overhead: conductor per-mile + structure density + vegetation by terrain', 'Non-overhead: total line O&M as % of line CAPEX', 'Converter maintenance (DC projects only)'],
  },
  'vegetation-management': {
    oneliner: 'Set the annual per-mile cost of managing vegetation along the transmission corridor, by terrain type.',
    body: 'Vegetation encroachment is a leading cause of transmission outages and wildfire ignition. Maintaining safe clearances requires ongoing trimming, herbicide application, and removal \u2014 costs that vary dramatically by terrain. Forested and mountainous corridors cost far more to manage than desert or farmland. These values are pre-filled for your construction type.',
    items: ['Vegetation management cost for each of the nine terrain types ($/mile/year)'],
  },
  // L3 sub-tabs: Risk Profiles
  'wildfire-risk': {
    oneliner: 'Specify how likely the line is to ignite wildfires and how costly each event would be.',
    body: 'The calculator multiplies line-level ignition rates by expected loss per event to produce an expected annual wildfire cost. Risk varies by construction method \u2014 underground lines nearly eliminate ignition risk, while overhead lines carry the highest exposure.',
    items: ['Loss per wildfire event (severity)', 'Base ignition rate (line-level)', 'Construction-type multipliers on ignition risk'],
  },
  'outage-risk': {
    oneliner: 'Define how often outages occur, how long they last, and how much capacity is at risk.',
    body: 'The calculator combines outage frequency, duration, and capacity exposure to estimate an expected annual outage cost, valued using tiered estimates of what lost electricity costs society (value of lost load).',
    items: ['Network exposure (capacity at risk, load-shed fraction, redispatch cost)', 'Outage rates by construction type', 'Base duration and construction-type duration multipliers'],
  },
  // L3 sub-tabs: Energy and Emissions
  'energy-emissions-energy': {
    oneliner: 'Set the regional grid mix and review the physical parameters that drive transmission energy losses.',
    body: 'The regional generation mix \u2014 and how its shares evolve before and after COD \u2014 determines both the cost of replacing lost energy and the resulting emissions. Loss parameters from your conductor selection quantify how much energy is dissipated in transit.',
    items: ['Initial grid mix and pre/post-COD growth rates', 'Loss compensation fraction', 'Conductor-derived loss parameters (read-only)'],
  },
  'energy-emissions-emissions': {
    oneliner: 'Specify how much each fuel source pollutes and what those pollutants cost society.',
    body: 'Emission intensities convert megawatt-hours of generation into kilograms of CO\u2082, SO\u2093, and NO\u2093. Externality costs convert those kilograms into dollars. Together they determine the societal emission cost of the energy your line carries and the generation it displaces.',
    items: ['Emission intensities per fuel and pollutant', 'Societal cost per kilogram per pollutant'],
  },
  // L3 sub-tabs: System Details
  'economic-details': {
    oneliner: 'Set the economic value of served and unserved electricity on your system.',
    body: 'Value of Load is what each megawatt-hour is worth to end users \u2014 it prices thermal line losses and the benefit of delivered energy. Value of Lost Load captures the cost of power interruptions, tiered by duration (10 tiers from 1h to 30d, based on ERCOT 2024 survey data with extrapolation for longer durations).',
    items: ['Value of Load ($/MWh)', 'Value of Lost Load by outage duration tier'],
  },
  'system-constraints': {
    oneliner: 'Describe the grid congestion your project is designed to relieve.',
    body: 'The model calculates benefits by comparing your project\u2019s effective capacity relief against existing system constraints. These parameters define how severe those constraints are today \u2014 how often the grid is bottlenecked, by how much, and what that congestion costs per megawatt-hour.',
    items: ['Congestion parameters (binding hours, exceedance, pricing)'],
  },
  // L4 sub-sub-tabs: Routing
  'terrain-mix': {
    oneliner: 'Allocate your route miles across the nine terrain types.',
    body: 'Each terrain carries a difficulty multiplier \u2014 mountain and urban terrain cost more per mile than flat farmland. The multiplier-weighted total replaces raw miles in build cost, environmental mitigation, and risk calculations.',
    items: ['Miles per terrain type (e.g., Forested, Urban, Mountain)', 'Terrain cost multipliers (advanced)'],
  },
  'rights-of-way': {
    oneliner: 'Define the land cost zones along your route.',
    body: 'Right-of-way (ROW) costs \u2014 acquisition, holding fees during permitting, and annual rent \u2014 can dominate project cost on long routes. Whether you\u2019re building on new or existing ROW determines which cost categories apply: new routes incur acquisition and holding; existing routes incur rent.',
    items: ['Zone miles, Acquisition Cost, Hold Cost, and Rent Cost (up to 15 zones)', 'Project Uses Existing ROW toggle'],
  },
  // L4 sub-sub-tabs: Environmental Mitigation
  'base-mitigation': {
    oneliner: 'Set per-acre restoration costs for each terrain type your route crosses.',
    body: 'Costs vary significantly by terrain \u2014 mountain and wetland areas are far more expensive to restore than flat, open land. The uplift factor adjusts for total construction footprint, which typically extends beyond the permanent right-of-way.',
    items: ['Mitigation uplift factor', 'Base cost per acre by terrain type'],
  },
  'credits': {
    oneliner: 'Set per-acre costs for purchasing wetland and habitat mitigation credits.',
    body: 'When construction permanently impacts wetland or habitat areas, regulators typically require purchase of off-site credits from conservation banks. Wetland credits use a single rate; habitat credits vary by terrain. Reconductoring projects incur no credit costs.',
    items: ['Wetland credit cost per acre', 'Habitat credit cost per terrain type'],
  },
  // L4 sub-sub-tabs: Maintenance
  'conductor-maintenance': {
    oneliner: 'Review annual maintenance costs for your transmission line.',
    body: 'For overhead lines, this is the per-mile conductor maintenance cost based on your configuration. For non-overhead lines (underground, tunnel, subsea), total line O&M is computed as a percentage of line capital cost: 0.15% for underground direct-buried, 0.4% for tunnel, 2.5% for subsea. This replaces the component breakdown because no published source supports a conductor/structure split for these construction types.',
    items: ['Overhead: per-mile conductor cost from configuration database', 'Non-overhead: % of line CAPEX (covers all cable + civil infrastructure maintenance)'],
  },
  'structure-maintenance': {
    oneliner: 'Review base line O&M for overhead transmission lines.',
    body: 'Base line O&M covers conductor inspection, structure maintenance, patrol, and all non-vegetation operating costs at $15,636/circuit-mile/year. This rate is derived from FERC Form 1 data (CT Siting Council, 2023: $29,636 total minus $14,000 vegetation management). Vegetation management is modeled separately by terrain type.',
    items: ['Base O&M rate: $15,636/circuit-mile/year', 'Vegetation management: separate, by terrain (see Vegetation Management tab)'],
  },
  'converter-maintenance': {
    oneliner: 'Review the annual maintenance cost for converter stations on DC transmission lines.',
    body: 'DC projects require converter stations at each end of the line to transform between alternating current (AC) and direct current. Converter O&M is expressed as a percentage of station capital cost per year: 0.5% for LCC (thyristor-based, lower maintenance) and 0.7% for VSC (IGBT submodule replacement, water-cooled systems). This cost is independent of line length \u2014 a 50-mile and 500-mile line with the same converters pay the same O&M.',
    items: ['Annual O&M rate applied to converter station CAPEX'],
  },
  // L4 sub-sub-tabs: Energy
  'energy-mix': {
    oneliner: 'Set the regional grid mix at year 0 and how each fuel source evolves before and after the line comes online.',
    body: 'One regional grid starts from a single initial mix. Pre-COD growth rates describe evolution without the line; post-COD rates describe evolution with the line\u2019s influence. The difference drives displacement delay cost and operational displacement benefit.',
    items: ['Initial grid mix (percentages for eight fuel sources)', 'Pre-COD growth rates (grid evolution before COD)', 'Post-COD growth rates (grid evolution after COD)'],
  },
  'energy-losses': {
    oneliner: 'Set the fraction of line losses compensated by new generation and review loss-relevant conductor parameters.',
    body: 'Not all lost energy triggers additional generation \u2014 the compensation rate controls how much does. The conductor\u2019s resistance and operating voltage (read-only, from your earlier selection) determine the physical magnitude of those losses.',
    items: ['Loss compensation rate', 'AC and DC resistance, voltage (read-only from conductor database)'],
  },
  // L4 sub-sub-tabs: Emissions
  'emission-intensities': {
    oneliner: 'Set the emission intensity \u2014 kilograms of pollutant per megawatt-hour \u2014 for each fuel source.',
    body: 'These values convert energy generation into physical emissions. Coal and gas produce far more CO\u2082 per MWh than wind or solar, so the intensities interact directly with your fuel mix to determine the line\u2019s total emission footprint.',
    items: ['CO\u2082, SO\u2093, and NO\u2093 intensity for each of eight fuel sources'],
  },
  'emission-externality-costs': {
    oneliner: 'Set the societal cost per kilogram for each tracked pollutant.',
    body: 'Externality costs translate physical emissions into dollar values that enter the project\u2019s cost-benefit analysis. These are social costs \u2014 the estimated damage each kilogram of pollution imposes on public health and the environment \u2014 not market prices.',
    items: ['Dollar-per-kilogram cost for CO\u2082, SO\u2093, and NO\u2093'],
  },
  // L4 sub-sub-tabs: Risk — Wildfire
  'wf-severity': {
    oneliner: 'Set the expected uninsured financial loss from a single wildfire event.',
    body: 'Severity is the dollar amount per ignition \u2014 it drives the magnitude of annual wildfire cost. One number applies across all terrains; frequency is handled separately in Ignition Profile.',
    items: ['Severity in dollars per event'],
  },
  'wf-ignition-profile': {
    oneliner: 'Define line-level ignition rates and how they vary by construction type.',
    body: 'Ignition rates set the frequency side of wildfire risk. A single base rate applies to the whole line, adjusted by a construction-type multiplier. You can also model escalating risk over time with an optional growth rate.',
    items: ['Base ignition rate (events per mile per year)', 'Construction-type multiplier on ignition rates', 'Optional wildfire risk growth rate'],
  },
  // L4 sub-sub-tabs: Risk — Outage
  'out-exposure': {
    oneliner: 'Set line-level outage exposure parameters.',
    body: 'Capacity-at-risk determines what fraction of capacity is lost per outage. Load-shed fraction splits the impact between load-shedding (VoLL) and redispatch (congestion cost).',
    items: ['Capacity-at-risk factor (1.0 for radial, less for meshed)', 'Load-shed fraction (auto-derived: AC=0.05, DC=0.80)', 'Redispatch cost ($/MWh)'],
  },
  'out-outage-profile': {
    oneliner: 'Define line-level outage rates, durations, and how construction type affects them.',
    body: 'Outage rates set event frequency per mile by construction type; base duration determines how much energy goes unserved per event, scaled by a construction-type multiplier. You can model increasing risk over time with an optional growth rate.',
    items: ['Base outage duration (hrs/event)', 'Construction-type duration multiplier', 'Outage rate by construction type (outages/mi/yr)', 'Optional outage risk growth rate'],
  },
  // L4 sub-sub-tabs: System Details — Constraints (single-constraint, single-price congestion reduction)
  'congestion': {
    oneliner: 'Quantify the transmission constraint your project will relieve.',
    body: 'The single-constraint model captures a targeted constraint that resolves through costlier redispatch (congestion). You\u2019ll specify how many hours per year the constraint binds, the average megawatt exceedance during those hours, and the marginal congestion price \u2014 together, these determine the annual value of relief.',
    items: ['Constrained hours per year', 'Average megawatt exceedance', 'Congestion price ($/MWh)', 'Flow factor (greenfield only)'],
  },
};

function renderTabGuideBanner(tabOrSubTabId, container) {
  const content = TAB_GUIDE_CONTENT[tabOrSubTabId];
  if (!content) return;
  const storageKey = 'forge-tab-guide-dismissed-' + tabOrSubTabId;
  if (localStorage.getItem(storageKey) === 'permanent') return;

  const banner = document.createElement('div');
  banner.className = 'tab-guide-banner';
  banner.dataset.guideId = tabOrSubTabId;

  const oneliner = document.createElement('div');
  oneliner.className = 'tab-guide-banner-oneliner';
  oneliner.textContent = content.oneliner;
  banner.appendChild(oneliner);

  const body = document.createElement('div');
  body.className = 'tab-guide-banner-body';
  body.textContent = content.body;
  banner.appendChild(body);

  if (content.items && content.items.length > 0) {
    const list = document.createElement('ul');
    list.className = 'tab-guide-banner-items';
    content.items.forEach(item => {
      const li = document.createElement('li');
      li.textContent = item;
      list.appendChild(li);
    });
    banner.appendChild(list);
  }

  const dismissBtn = document.createElement('button');
  dismissBtn.className = 'tab-guide-banner-dismiss';
  dismissBtn.type = 'button';
  dismissBtn.textContent = '\u2715';
  dismissBtn.title = 'Dismiss';
  banner.appendChild(dismissBtn);

  const footer = document.createElement('div');
  footer.className = 'tab-guide-banner-footer';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.id = 'guide-perm-' + tabOrSubTabId;
  const lbl = document.createElement('label');
  lbl.htmlFor = cb.id;
  lbl.textContent = "Don\u2019t show this again";
  footer.appendChild(cb);
  footer.appendChild(lbl);
  banner.appendChild(footer);

  dismissBtn.addEventListener('click', () => {
    if (cb.checked) localStorage.setItem(storageKey, 'permanent');
    banner.remove();
  });

  container.prepend(banner);
}

function getValueAtFieldPath(data, yamlSection, fieldPath) {
  const parts = fieldPath.split('.');
  let obj = data?.[yamlSection];
  for (const p of parts) {
    const arrMatch = p.match(/^(.+)\[(\d+)\]$/);
    if (arrMatch) {
      obj = obj?.[arrMatch[1]]?.[parseInt(arrMatch[2])];
    } else {
      obj = obj?.[p];
    }
    if (obj === undefined) return undefined;
  }
  return obj;
}

function createFieldFromMetadata(meta, value) {
  const fieldDiv = document.createElement('div');
  fieldDiv.className = 'form-field';
  const fullPath = meta.yaml_section + '.' + meta.field_path;
  fieldDiv.dataset.fieldPath = fullPath;

  if (meta.condition === 'dc_only' || meta.condition === 'reconductoring_only' || meta.condition === 'old_dc_only') {
    fieldDiv.dataset.conditional = 'true';
  }

  const label = document.createElement('label');
  label.htmlFor = fullPath;
  const labelText = document.createElement('span');
  labelText.textContent = meta.label;
  label.appendChild(labelText);

  if (meta.validation?.required) {
    const req = document.createElement('span');
    req.className = 'required-indicator';
    req.textContent = ' *';
    label.appendChild(req);
  }
  if (meta.unit) {
    const unitSpan = document.createElement('span');
    unitSpan.className = 'unit-label';
    unitSpan.textContent = '(' + meta.unit + ')';
    label.appendChild(unitSpan);
  }
  if (meta.help_text) {
    const helpIcon = document.createElement('span');
    helpIcon.className = 'help-icon';
    helpIcon.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/><text x="8" y="12" text-anchor="middle" font-size="10" fill="currentColor">?</text></svg>';
    helpIcon.dataset.tooltip = meta.help_text;
    label.appendChild(helpIcon);
  }
  fieldDiv.appendChild(label);

  let input;
  const v = meta.validation || {};

  if (meta.input_type === 'dropdown') {
    input = document.createElement('select');
    input.id = fullPath;
    input.dataset.path = fullPath;
    if (value === undefined || value === null) {
      const ph = document.createElement('option');
      ph.value = '';
      ph.textContent = '\u2014 Select \u2014';
      ph.disabled = true;
      ph.selected = true;
      input.appendChild(ph);
    }
    (v.options || []).forEach(opt => {
      const o = document.createElement('option');
      o.value = opt; o.textContent = opt;
      input.appendChild(o);
    });
    if (value !== undefined && value !== null) input.value = String(value);
    fieldDiv.appendChild(input);

  } else if (meta.input_type === 'dynamic_dropdown') {
    input = document.createElement('select');
    input.id = fullPath;
    input.dataset.path = fullPath;
    const needsPlaceholder = (value === undefined || value === null);
    const setOpts = (depVal) => {
      const opts = v.optionSets?.[depVal] || [];
      input.innerHTML = '';
      if (needsPlaceholder || v.allowBlank) {
        const ph = document.createElement('option');
        ph.value = '';
        ph.textContent = needsPlaceholder ? '\u2014 Select \u2014' : '';
        if (needsPlaceholder) { ph.disabled = true; ph.selected = true; }
        input.appendChild(ph);
      }
      opts.forEach(o => input.appendChild(new Option(o + (v.suffix || ''), o)));
    };
    const depPath = v.dependsOn;
    if (depPath) {
      const depEl = () => document.querySelector(`[data-path="${depPath}"]`);
      setTimeout(() => {
        const dep = depEl();
        if (dep) { setOpts(dep.value); dep.addEventListener('change', () => setOpts(dep.value)); }
      }, 0);
    }
    if (value !== undefined && value !== null) {
      setTimeout(() => { input.value = String(value); }, 10);
    }
    fieldDiv.appendChild(input);

  } else if (meta.input_type === 'toggle') {
    const toggleLabel = document.createElement('label');
    toggleLabel.className = 'toggle-switch';
    input = document.createElement('input');
    input.type = 'checkbox';
    input.id = fullPath;
    input.dataset.path = fullPath;
    if (value === true || value === 'true') input.checked = true;
    const slider = document.createElement('span');
    slider.className = 'toggle-slider';
    toggleLabel.appendChild(input);
    toggleLabel.appendChild(slider);
    fieldDiv.appendChild(toggleLabel);

  } else if (meta.input_type === 'percent') {
    const wrapper = document.createElement('div');
    wrapper.className = 'slider-container';
    const pct = v.pct !== false;
    const sliderEl = document.createElement('input');
    sliderEl.type = 'range';
    sliderEl.min = v.min ?? 0; sliderEl.max = v.max ?? 1; sliderEl.step = v.step ?? 0.01;
    sliderEl.value = value ?? 0;
    sliderEl.className = 'slider-input';
    updateSliderFill(sliderEl);
    const numInput = document.createElement('input');
    numInput.type = 'number';
    numInput.className = 'slider-value';
    numInput.id = fullPath;
    numInput.dataset.path = fullPath;
    if (pct) {
      numInput.classList.add('slider-pct');
      numInput.value = ((value ?? 0) * 100).toFixed(1);
      numInput.step = ((v.step ?? 0.01) * 100);
      sliderEl.addEventListener('input', () => { numInput.value = (parseFloat(sliderEl.value) * 100).toFixed(1); updateSliderFill(sliderEl); });
      numInput.addEventListener('input', () => { sliderEl.value = parseFloat(numInput.value) / 100; updateSliderFill(sliderEl); });
    } else {
      numInput.value = value ?? 0;
      numInput.step = v.step ?? 0.01;
      sliderEl.addEventListener('input', () => { numInput.value = sliderEl.value; updateSliderFill(sliderEl); });
      numInput.addEventListener('input', () => { sliderEl.value = numInput.value; updateSliderFill(sliderEl); });
    }
    wrapper.appendChild(sliderEl);
    wrapper.appendChild(numInput);
    fieldDiv.appendChild(wrapper);
    input = numInput;

  } else if (meta.input_type === 'currency') {
    input = document.createElement('input');
    input.type = 'text';
    input.id = fullPath;
    input.dataset.path = fullPath;
    input.className = 'currency-input';
    if (value !== undefined && value !== null) {
      const n = Number(value);
      input.value = isNaN(n) ? value : '$' + n.toLocaleString('en-US', {maximumFractionDigits: 2});
    }
    input.addEventListener('focus', () => {
      const raw = input.value.replace(/[$,]/g, '');
      input.value = raw;
    });
    input.addEventListener('blur', () => {
      const raw = parseFloat(input.value.replace(/[$,]/g, ''));
      if (!isNaN(raw)) input.value = '$' + raw.toLocaleString('en-US', {maximumFractionDigits: 2});
    });
    fieldDiv.appendChild(input);

  } else if (meta.input_type === 'text') {
    input = document.createElement('input');
    input.type = 'text';
    input.id = fullPath;
    input.dataset.path = fullPath;
    if (value !== undefined && value !== null) input.value = String(value);
    fieldDiv.appendChild(input);

  } else if (meta.input_type === 'year') {
    input = document.createElement('input');
    input.type = 'text';
    input.id = fullPath;
    input.dataset.path = fullPath;
    input.className = 'year-input';
    if (value !== undefined && value !== null) input.value = String(value);
    fieldDiv.appendChild(input);

  } else if (meta.input_type === 'fuel_mix_row') {
    input = document.createElement('input');
    input.type = 'number';
    input.id = fullPath;
    input.dataset.path = fullPath;
    input.className = 'number-input';
    if (value !== undefined && value !== null) input.value = value;
    fieldDiv.appendChild(input);

  } else {
    input = document.createElement('input');
    input.type = 'text';
    input.id = fullPath;
    input.dataset.path = fullPath;
    input.className = 'number-input';
    if (value !== undefined && value !== null) {
      const n = Number(value);
      input.value = isNaN(n) ? (value ?? '') : n.toLocaleString('en-US', {maximumFractionDigits: 10});
    }
    input.addEventListener('focus', () => { input.value = input.value.replace(/,/g, ''); });
    input.addEventListener('blur', () => {
      const raw = parseFloat(input.value.replace(/,/g, ''));
      if (!isNaN(raw)) input.value = raw.toLocaleString('en-US', {maximumFractionDigits: 10});
    });
    fieldDiv.appendChild(input);
  }

  if (meta.appendixRef || meta.appendixPage) {
    const pill = document.createElement('span');
    pill.className = 'forge-source-pill';
    const ref = meta.appendixRef || 'Appendix';
    const page = meta.appendixPage;
    pill.innerHTML = '<svg width="8" height="8" viewBox="0 0 16 16"><path d="M13 1H3a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V3a2 2 0 00-2-2zM5 4h6v1H5V4zm0 3h6v1H5V7zm0 3h4v1H5v-1z" fill="currentColor"/></svg> ' + ref + (page ? ' p.\u200b' + page : '');
    if (page) {
      pill.addEventListener('click', function() {
        window.open('/static/appendix.pdf#page=' + page, '_blank');
      });
    }
    fieldDiv.appendChild(pill);
  }

  return fieldDiv;
}

function renderTaxonomySections(container, fields, data, taxById, scopeEl) {
  const groups = {};
  fields.forEach(f => { (groups[f.taxonomy_id] ??= []).push(f); });
  const seenTaxIds = [];
  fields.forEach(f => { if (!seenTaxIds.includes(f.taxonomy_id)) seenTaxIds.push(f.taxonomy_id); });

  seenTaxIds.forEach(taxId => {
    const tFields = groups[taxId];
    if (!tFields || tFields.length === 0) return;
    tFields.sort((a, b) => a.display_order - b.display_order);

    const taxItem = taxById[taxId];
    const sectionLabel = taxItem?.label || taxId;
    const tier = tFields[0].tier || 'working';

    const section = document.createElement('div');
    section.className = 'taxonomy-input-section';
    section.style.marginBottom = '0.75rem';

    const header = document.createElement('div');
    header.className = 'collapsible-header';
    if (tier !== 'advanced') header.classList.add('expanded');
    const chevron = document.createElement('span');
    chevron.className = 'section-chevron';
    chevron.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 3 L5 7 L8 3" fill="none" stroke="#64748b" stroke-width="1.5" stroke-linecap="round"/></svg>';
    header.insertBefore(chevron, header.firstChild);
    const titleSpan = document.createElement('span');
    titleSpan.className = 'section-title';
    titleSpan.style.cssText = 'font-weight:600;color:#0066cc;font-size:0.8rem;letter-spacing:0.05em';
    titleSpan.textContent = sectionLabel;
    header.appendChild(titleSpan);
    section.appendChild(header);

    const content = document.createElement('div');
    content.className = 'collapsible-content';
    if (tier !== 'advanced') content.classList.add('expanded');
    header.addEventListener('click', () => {
      header.classList.toggle('expanded');
      content.classList.toggle('expanded');
    });

    const subGroups = {};
    tFields.forEach(f => {
      const sg = f.section_label || '__default__';
      (subGroups[sg] ??= []).push(f);
    });

    Object.entries(subGroups).forEach(([sgLabel, sgFields]) => {
      if (sgLabel !== '__default__' && Object.keys(subGroups).length > 1) {
        const sgHeader = document.createElement('div');
        sgHeader.className = 'results-subcategory-title';
        sgHeader.style.marginTop = '0.75rem';
        sgHeader.textContent = sgLabel;
        content.appendChild(sgHeader);
      }

      const grid = document.createElement('div');
      grid.className = 'form-grid';

      sgFields.forEach(fieldMeta => {
        const val = getValueAtFieldPath(data, fieldMeta.yaml_section, fieldMeta.field_path);
        const fieldEl = createFieldFromMetadata(fieldMeta, val);
        if (fieldEl) grid.appendChild(fieldEl);
      });

      content.appendChild(grid);
    });

    section.appendChild(content);

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'section-reset-btn btn btn-secondary btn-sm';
    resetBtn.textContent = 'Reset';
    resetBtn.dataset.sectionPath = taxId;
    resetBtn.addEventListener('click', () => {
      const restoreSource = snapshotOriginalData || originalJsonData;
      const origData = restoreSource !== undefined && restoreSource !== null ? restoreSource : data;
      tFields.forEach(f => {
        const origVal = getValueAtFieldPath(origData, f.yaml_section, f.field_path);
        const fullPath = f.yaml_section + '.' + f.field_path;
        const el = scopeEl.querySelector(`[data-path="${fullPath}"]`);
        if (!el) return;
        if (el.type === 'checkbox') { el.checked = origVal === true; }
        else if (el.classList.contains('slider-pct')) {
          el.value = ((origVal || 0) * 100).toFixed(1);
          const slider = el.closest('.slider-container')?.querySelector('input[type="range"]');
          if (slider) { slider.value = origVal || 0; updateSliderFill(slider); }
        } else if (el.classList.contains('currency-input')) {
          const n = Number(origVal);
          el.value = isNaN(n) ? '' : '$' + n.toLocaleString('en-US', {maximumFractionDigits: 2});
        } else if (el.tagName === 'SELECT') {
          el.value = origVal != null ? String(origVal) : '';
        } else {
          const n = Number(origVal);
          el.value = origVal == null ? '' : (isNaN(n) ? origVal : n.toLocaleString('en-US', {maximumFractionDigits: 10}));
          const sliderCont = el.closest('.slider-container');
          if (sliderCont) {
            const rng = sliderCont.querySelector('input[type="range"]');
            if (rng) { rng.value = origVal || 0; updateSliderFill(rng); }
          }
        }
      });
    });
    header.appendChild(resetBtn);

    const restoreBtn = document.createElement('button');
    restoreBtn.type = 'button';
    restoreBtn.className = 'restore-defaults-btn';
    restoreBtn.textContent = 'Restore Defaults';
    restoreBtn.addEventListener('click', () => {
      showRestoreDefaultsDialog('forge-restore-section-' + taxId, 'this section', () => {
        resetSectionToDefaults(taxId);
        showToast('Defaults restored');
      });
    });
    header.appendChild(restoreBtn);

    container.appendChild(section);
  });
}

function makeEquationIcon(eqData) {
  const icon = document.createElement('span');
  icon.className = 'equation-icon';
  icon.textContent = '∑';
  icon.title = 'View equation';
  icon.addEventListener('click', (e) => {
    e.stopPropagation();
    const existing = document.querySelector('.equation-popover');
    if (existing) { existing.remove(); return; }
    const popover = document.createElement('div');
    popover.className = 'equation-popover';
    const eqDiv = document.createElement('div');
    eqDiv.className = 'equation-math';
    if (typeof katex !== 'undefined') {
      try { katex.render(eqData.latex, eqDiv, { displayMode: true, throwOnError: false }); }
      catch (_) { eqDiv.textContent = eqData.latex; }
    } else { eqDiv.textContent = eqData.latex; }
    popover.appendChild(eqDiv);
    if (eqData.context) {
      const ctx = document.createElement('p');
      ctx.className = 'equation-context';
      ctx.textContent = eqData.context;
      popover.appendChild(ctx);
    }
    if (eqData.appendixPage) {
      const link = document.createElement('a');
      link.className = 'equation-appendix-link';
      link.href = '/static/appendix.pdf#page=' + eqData.appendixPage;
      link.target = '_blank';
      link.textContent = '📄 See appendix §' + (eqData.appendixLabel || '') + ' (p.' + eqData.appendixPage + ') →';
      popover.appendChild(link);
    }
    icon.style.position = 'relative';
    icon.appendChild(popover);
    const dismiss = (ev) => { if (!popover.contains(ev.target) && ev.target !== icon) { popover.remove(); document.removeEventListener('click', dismiss); } };
    setTimeout(() => document.addEventListener('click', dismiss), 0);
  });
  return icon;
}

const EQ_WEIGHTED_MILES_TERRAIN = {
  latex: 'M_{\\text{weighted,terrain}} = M_{\\text{terrain}} \\times \\lambda_{\\text{terrain}}',
  appendixPage: 2, appendixLabel: 'Weighted Miles'
};

const EQ_WEIGHTED_MILES_TOTAL = {
  latex: 'M_{\\text{weighted,total}} = \\sum_{\\text{terrain}} M_{\\text{terrain}} \\times \\lambda_{\\text{terrain}}',
  context: 'Total difficulty-adjusted line length. Used as the primary distance measure for build costs (conductor, structure, converter variable costs).',
  appendixPage: 2, appendixLabel: 'Weighted Miles'
};

const EQ_ZONE_AREA = {
  latex: 'A_{\\text{zone}} = \\frac{M_{\\text{zone}} \\times 5280 \\times W_{\\text{ROW}}}{43{,}560}',
  appendixPage: 11, appendixLabel: 'Capital ROW'
};

const EQ_HOLD_ANNUAL = {
  latex: 'C_{\\text{hold,annual}} = \\sum_{\\text{zone}} A_{\\text{zone}} \\, p_{\\text{hold,zone}}',
  appendixPage: 11, appendixLabel: 'Capital ROW'
};

const EQ_ACQUISITION = {
  latex: 'C_{\\text{acquisition}} = \\sum_{\\text{zone}} A_{\\text{zone}} \\, p_{\\text{acquisition,zone}}',
  appendixPage: 11, appendixLabel: 'Capital ROW'
};

const EQ_RENT_ANNUAL = {
  latex: 'C_{\\text{rent,annual}} = \\sum_{\\text{zone}} A_{\\text{zone}} \\, p_{\\text{rent,zone}}',
  appendixPage: 21, appendixLabel: 'Operational ROW Rent'
};

const EQ_HOLD_NOMINAL = {
  latex: 'C_{\\text{hold,total}} = C_{\\text{hold,annual}} \\times T_{\\text{delay}}',
  context: 'Total holding cost over the delay period (nominal). Annual holding × delay years.',
  appendixPage: 11, appendixLabel: 'Capital ROW'
};

const EQ_HOLD_PV = {
  latex: 'C_{\\text{hold}} = \\sum_{t=1}^{T_{\\text{delay}}} \\frac{C_{\\text{hold,annual}}}{(1+r_{\\text{WACC,real}})^t}',
  context: 'Present value of holding costs, discounted at real WACC over the delay period.',
  appendixPage: 11, appendixLabel: 'Capital ROW'
};

const EQ_ACQ_NOMINAL = {
  latex: 'C_{\\text{acquisition}} = \\sum_{\\text{zone}} A_{\\text{zone}} \\, p_{\\text{acquisition,zone}}',
  context: 'Total one-time land acquisition cost across all zones (nominal).',
  appendixPage: 11, appendixLabel: 'Capital ROW'
};

const EQ_ACQ_PV = {
  latex: 'C_{\\text{acquisition,PV}} = \\frac{C_{\\text{acquisition}}}{(1+r_{\\text{WACC,real}})^{T_{\\text{delay}}}}',
  context: 'Present value of acquisition, discounted at real WACC over the delay period.',
  appendixPage: 11, appendixLabel: 'Capital ROW'
};

const EQ_RENT_NOMINAL = {
  latex: 'C_{\\text{rent,nominal}} = \\xi_{\\text{rent}} \\times C_{\\text{rent,annual}} \\times T_{\\text{rent}}',
  context: 'Total rent over the rental period (nominal). Annual rent × years rent is paid.',
  appendixPage: 21, appendixLabel: 'Operational ROW Rent'
};

const EQ_RENT_PV = {
  latex: 'C_{\\text{rent,PV}} = \\xi_{\\text{rent}} \\times \\sum_{t} \\frac{C_{\\text{rent,annual}}}{(1+r_{\\text{WACC,real}})^t}',
  context: 'Present value of the rent stream, discounted at real WACC.',
  appendixPage: 21, appendixLabel: 'Operational ROW Rent'
};

const EQ_ROW_CAPITAL = {
  latex: 'C_{\\text{ROW,capital}} = \\xi_{\\text{acq}} \\cdot C_{\\text{acquisition}} + \\xi_{\\text{hold}} \\cdot C_{\\text{hold}}',
  context: 'Total ROW capital cost (PV). Part of the Hard cost category.',
  appendixPage: 11, appendixLabel: 'Capital ROW'
};

const EQ_DELAY_ANNUAL = {
  latex: 'C_{\\text{delay,annual}} = \\sum_{k \\in \\mathcal{K}} C_{\\text{delay},k}',
  appendixPage: 22, appendixLabel: 'Base Delay'
};

const EQ_DELAY_NOMINAL = {
  latex: 'C_{\\text{delay,nominal}} = C_{\\text{delay,annual}} \\times T_{\\text{delay}}',
  context: 'Total base delay cost (nominal). Annual delay cost \u00d7 delay years.',
  appendixPage: 22, appendixLabel: 'Base Delay'
};

const EQ_DELAY_PV = {
  latex: 'C_{\\text{base,delay}} = C_{\\text{delay,annual}} \\times \\frac{1 - (1+r_{\\text{WACC,real}})^{-T_{\\text{delay}}}}{r_{\\text{WACC,real}}}',
  context: 'Present value of base delay costs \u2014 level annuity over the delay period.',
  appendixPage: 22, appendixLabel: 'Base Delay'
};

const EQ_CONG_DELAY = {
  latex: 'C_{\\text{cong,delay}} = B_{\\text{cong,annual}} \\times \\frac{1 - (1+r)^{-(T_d+T_c)}}{r}',
  context: 'Opportunity cost of congestion not relieved during delay + construction.',
  appendixPage: 23, appendixLabel: 'Congestion Delay'
};

const EQ_ALL_DELAY = {
  latex: 'C_{\\text{delay}} = C_{\\text{base,delay}} + C_{\\text{cong,delay}}',
  context: 'Total delay cost (PV). Part of the Soft cost category.',
  appendixPage: 22, appendixLabel: 'Base Delay'
};

const FUEL_COLORS = {
  coal: '#4a4a4a', oil: '#8b6914', natural_gas: '#3b82f6',
  solar: '#facc15', wind: '#14b8a6', hydro: '#06b6d4',
  nuclear: '#a855f7', other: '#9ca3af'
};

const EQ_LINE_LOSS = {
  latex: 'C_{\\text{loss}} = P_{\\text{loss}} \\times \\bar{p} \\times 8760 \\times T',
  context: 'Cost of energy lost as heat in conductors and converters over the project lifetime.',
  appendixPage: 25, appendixLabel: 'Thermal Loss Costs'
};

const EQ_EMISSIONS = {
  latex: 'C_{\\text{emissions}} = \\sum_{f} s_f \\cdot I_{f,p} \\cdot E_{\\text{loss}} \\cdot c_p',
  context: 'Emissions cost from loss-compensation generation, by fuel source and pollutant.',
  appendixPage: 37, appendixLabel: 'Emissions Costs'
};

const EQ_DISPLACEMENT = {
  latex: 'B_{\\text{avoided,emissions}} = \\sum_{f} (s^{CF}_f - s^{P}_f) \\cdot I_{f,p} \\cdot E \\cdot c_p',
  context: 'Avoided emissions benefit from displacing counterfactual generation with project generation.',
  appendixPage: 49, appendixLabel: 'Displacement'
};

let fuelMixChartInstance = null;

function getEnergyDeliveredGWh() {
  const cap = parseFloat((document.querySelector('[data-path="01_project_technical_details.project.capacity_mw"]')?.value || '0').replace(/,/g, '')) || 0;
  const util = parseFloat((document.querySelector('[data-path="01_project_technical_details.project.line_utilization"]')?.value || '0').replace(/,/g, '')) || 0;
  return cap * (util > 1 ? util / 100 : util) * 8760 / 1000;
}

function readGridMixInputValue(groupKey, fuel) {
  const path = `18_energy_source_mix.grid_mix.${groupKey}.${fuel}`;
  const inp = document.querySelector(`[data-path="${path}"]`);
  if (!inp || inp.value === '') return 0;
  if (inp.classList.contains('percentage-input')) {
    return parsePercentageInput(inp.value) ?? 0;
  }
  return parseNumberInput(inp.value) ?? 0;
}

function readFuelShares(groupKey) {
  const key = groupKey || 'initial';
  const shares = {};
  C.FUEL_SOURCES.forEach(f => {
    shares[f] = readGridMixInputValue(key, f) / 100;
  });
  return shares;
}

function readFuelRates(groupKey) {
  const key = groupKey || 'rate_post_cod';
  const rates = {};
  C.FUEL_SOURCES.forEach(f => {
    rates[f] = readGridMixInputValue(key, f);
  });
  return rates;
}

function projectFuelMix(shares, rates, year) {
  const projected = {};
  let total = 0;
  C.FUEL_SOURCES.forEach(f => {
    projected[f] = Math.max(0, (shares[f] || 0) + (rates[f] || 0) * year);
    total += projected[f];
  });
  if (total > 0) C.FUEL_SOURCES.forEach(f => { projected[f] /= total; });
  return projected;
}

function renderTerrainTable(data) {
  const TERRAINS = [
    'forested', 'scrubbed_flat', 'wetland', 'farmland',
    'desert_barren', 'urban', 'rolling_hills', 'mountain', 'subsea',
  ];
  function terrainLabel(t) {
    return t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
  function makeNumInput(fullPath, value) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'number-input';
    input.dataset.path = fullPath;
    const n = Number(value);
    input.value = (!isNaN(n) && value !== null && value !== undefined)
      ? n.toLocaleString('en-US', {maximumFractionDigits: 10}) : '';
    input.addEventListener('focus', () => { input.value = input.value.replace(/,/g, ''); });
    input.addEventListener('blur', () => {
      const raw = parseFloat(input.value.replace(/,/g, ''));
      if (!isNaN(raw)) input.value = raw.toLocaleString('en-US', {maximumFractionDigits: 10});
    });
    return input;
  }

  const wrapper = document.createElement('div');
  const table = document.createElement('table');
  table.className = 'forge-table forge-table--editable terrain-table';
  const terrainCaption = document.createElement('caption');
  terrainCaption.textContent = 'Terrain Miles';
  terrainCaption.appendChild(makeHelpIcon('Route miles by terrain type. Must sum to project total miles.'));
  table.appendChild(terrainCaption);

  // Header with lock toggle on Multiplier column
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  const thTerrain = document.createElement('th');
  thTerrain.textContent = 'Terrain';
  thTerrain.appendChild(makeHelpIcon('Terrain types along the route. Miles should sum to total project length.'));
  headerRow.appendChild(thTerrain);
  const thMiles = document.createElement('th');
  thMiles.textContent = 'Miles';
  thMiles.appendChild(makeHelpIcon('Route miles through each terrain type. Zero-mile terrains are excluded from cost calculations.'));
  headerRow.appendChild(thMiles);
  const thMult = document.createElement('th');
  thMult.textContent = 'Multiplier ';
  thMult.appendChild(makeHelpIcon('Cost multiplier by terrain type for weighted miles. Sourced from MISO. Click the lock icon to override.'));
  headerRow.appendChild(thMult);
  const thWeighted = document.createElement('th');
  thWeighted.textContent = 'Weighted Miles';
  thWeighted.className = 'computed-column-header';
  thWeighted.appendChild(makeHelpIcon('Miles × Multiplier. Computed automatically.'));
  headerRow.appendChild(thWeighted);
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const multInputs = [];
  let multipliersLocked = true;

  const tbody = document.createElement('tbody');
  TERRAINS.forEach(t => {
    const tr = document.createElement('tr');

    const tdLabel = document.createElement('td');
    tdLabel.textContent = terrainLabel(t);
    tdLabel.style.fontWeight = '500';
    tr.appendChild(tdLabel);

    const milesPath = `02_project_physical_details.terrain.terrain_miles.${t}`;
    const milesVal = getValueAtFieldPath(data, '02_project_physical_details', `terrain.terrain_miles.${t}`) ?? 0;
    const tdMiles = document.createElement('td');
    const milesInput = makeNumInput(milesPath, milesVal);
    milesInput.min = '0';
    milesInput.addEventListener('input', () => { if (parseFloat(milesInput.value) < 0) milesInput.value = '0'; });
    tdMiles.appendChild(milesInput);
    tdMiles.appendChild(makeEquationIcon({...EQ_WEIGHTED_MILES_TERRAIN, context: `This field is M_terrain — miles of route in ${terrainLabel(t)}. Multiplied by the terrain multiplier λ to get weighted miles.`}));
    tr.appendChild(tdMiles);

    const multPath = `02_project_physical_details.terrain.terrain_multipliers.${t}`;
    const multVal = getValueAtFieldPath(data, '02_project_physical_details', `terrain.terrain_multipliers.${t}`) ?? 1;
    const tdMult = document.createElement('td');
    const multInput = makeNumInput(multPath, multVal);
    multInput.readOnly = true;
    multInput.classList.add('locked-cell');
    multInputs.push(multInput);
    tdMult.appendChild(multInput);
    tdMult.appendChild(makeEquationIcon({...EQ_WEIGHTED_MILES_TERRAIN, context: `This field is λ_terrain — the difficulty multiplier for ${terrainLabel(t)}. Higher multiplier = more expensive per mile.`}));
    tr.appendChild(tdMult);

    const tdWeighted = document.createElement('td');
    tdWeighted.className = 'computed-cell';
    tdWeighted.dataset.weightedTerrain = t;
    const mVal = parseFloat(String(milesVal).replace(/,/g, '')) || 0;
    const muVal = parseFloat(String(multVal).replace(/,/g, '')) || 0;
    tdWeighted.textContent = (mVal * muVal).toFixed(1);
    tdWeighted.appendChild(makeEquationIcon({...EQ_WEIGHTED_MILES_TERRAIN, context: `Weighted miles for ${terrainLabel(t)} — the product of miles and multiplier. Summed across all terrains to get total weighted miles.`}));
    tr.appendChild(tdWeighted);

    milesInput.addEventListener('input', updateWeightedMiles);
    multInput.addEventListener('input', updateWeightedMiles);

    tbody.appendChild(tr);
  });

  // Total row
  const totalRow = document.createElement('tr');
  totalRow.className = 'terrain-total-row';
  const tdTotalLabel = document.createElement('td');
  tdTotalLabel.textContent = 'TOTAL';
  tdTotalLabel.style.fontWeight = '700';
  totalRow.appendChild(tdTotalLabel);
  const tdTotalMiles = document.createElement('td');
  tdTotalMiles.className = 'terrain-total-miles';
  totalRow.appendChild(tdTotalMiles);
  const tdTotalMultBlank = document.createElement('td');
  totalRow.appendChild(tdTotalMultBlank);
  const tdTotalWeighted = document.createElement('td');
  tdTotalWeighted.className = 'computed-cell terrain-total-weighted';
  tdTotalWeighted.appendChild(makeEquationIcon(EQ_WEIGHTED_MILES_TOTAL));
  totalRow.appendChild(tdTotalWeighted);
  tbody.appendChild(totalRow);

  function updateWeightedMiles() {
    let milesSum = 0, weightedSum = 0;
    TERRAINS.forEach(t => {
      const mi = parseFloat((table.querySelector(`[data-path$="terrain_miles.${t}"]`)?.value || '0').replace(/,/g, '')) || 0;
      const mu = parseFloat((table.querySelector(`[data-path$="terrain_multipliers.${t}"]`)?.value || '0').replace(/,/g, '')) || 0;
      const w = mi * mu;
      milesSum += mi;
      weightedSum += w;
      const cell = table.querySelector(`[data-weighted-terrain="${t}"]`);
      if (cell) cell.textContent = w.toFixed(1);
    });
    tdTotalMiles.textContent = milesSum.toFixed(1);
    tdTotalWeighted.textContent = weightedSum.toFixed(1);
  }
  setTimeout(updateWeightedMiles, 0);

  function setMultipliersLocked(locked) {
    multipliersLocked = locked;
    multInputs.forEach(input => {
      input.readOnly = locked;
      if (locked) {
        input.classList.add('locked-cell');
      } else {
        input.classList.remove('locked-cell');
      }
    });
    lockPill.className = locked ? 'lock-pill' : 'lock-pill lock-pill--unlocked';
    lockPill.innerHTML = locked
      ? (LOCK_SVG + ' Locked \u2014 click to override')
      : (UNLOCK_SVG + ' Unlocked \u2014 editing');
  }

  table.appendChild(tbody);

  const terrainTableCard = document.createElement('div');
  terrainTableCard.className = 'forge-table-card';

  const terrainCardHeader = document.createElement('div');
  terrainCardHeader.className = 'card-header';
  terrainCardHeader.textContent = 'Terrain Multipliers ';
  const lockPill = document.createElement('span');
  lockPill.className = 'lock-pill';
  lockPill.innerHTML = LOCK_SVG + ' Locked \u2014 click to override';
  lockPill.addEventListener('click', () => {
    if (!multipliersLocked) {
      setMultipliersLocked(true);
      return;
    }
    const suppressed = localStorage.getItem('forge-suppress-multiplier-warning') === 'true';
    if (suppressed) {
      setMultipliersLocked(false);
      return;
    }
    showMultiplierConfirmDialog(wrapper, (suppress) => {
      if (suppress) localStorage.setItem('forge-suppress-multiplier-warning', 'true');
      setMultipliersLocked(false);
    });
  });
  terrainCardHeader.appendChild(lockPill);
  terrainTableCard.appendChild(terrainCardHeader);
  terrainTableCard.appendChild(table);

  const terrainSource = document.createElement('div');
  terrainSource.className = 'forge-source';
  terrainSource.innerHTML = SOURCE_ICON_SVG + ' Multipliers: MISO Transmission Expansion Planning (2023)';
  terrainTableCard.appendChild(terrainSource);

  wrapper.appendChild(terrainTableCard);
  return wrapper;
}

function getInitialVisibleZoneCount(data) {
  let maxZone = 0;
  for (let z = 1; z <= 15; z++) {
    const hasData = ['miles', 'hold_cost', 'acquisition_cost', 'rent_cost'].some(suffix => {
      const val = getValueAtFieldPath(data, '11_project_row_details', `right_of_way.zone_${z}.${suffix}`);
      if (val === null || val === undefined || val === '') return false;
      const n = Number(val);
      return !isNaN(n) && n !== 0;
    });
    if (hasData) maxZone = z;
  }
  return maxZone > 0 ? maxZone : 3;
}

function renderROWZonesTable(data) {
  const wrapper = document.createElement('div');

  const table = document.createElement('table');
  table.className = 'forge-table forge-table--editable row-table-greenfield';
  table.id = 'row-zone-table';
  const rowCaption = document.createElement('caption');
  rowCaption.textContent = 'Right-of-Way Zones';
  rowCaption.appendChild(makeHelpIcon('Per-zone land cost inputs. Zone miles must sum to project total.'));
  table.appendChild(rowCaption);

  const thead = document.createElement('thead');
  const hRow = document.createElement('tr');
  const thZone = document.createElement('th');
  thZone.textContent = 'Zone';
  thZone.appendChild(makeHelpIcon('Zone identifier along the route'));
  hRow.appendChild(thZone);
  const thMi = document.createElement('th');
  thMi.textContent = 'Miles ';
  thMi.appendChild(makeHelpIcon('Route miles through this ROW zone. Zone miles should sum to total project length.'));
  hRow.appendChild(thMi);
  const thAcres = document.createElement('th');
  thAcres.textContent = 'Acres';
  thAcres.className = 'computed-column-header';
  thAcres.appendChild(makeHelpIcon('ROW area = Miles × 5280 × ROW Width / 43,560. Computed from miles and project ROW width.'));
  hRow.appendChild(thAcres);
  const thHold = document.createElement('th');
  thHold.className = 'col-holding';
  thHold.textContent = 'Holding ($/ac/yr) ';
  thHold.appendChild(makeHelpIcon('Annual per-acre holding cost (option fee) during delay period. Greenfield projects only.'));
  hRow.appendChild(thHold);
  const thAcq = document.createElement('th');
  thAcq.className = 'col-acquisition';
  thAcq.textContent = 'Acquisition ($/acre) ';
  thAcq.appendChild(makeHelpIcon('One-time per-acre land acquisition cost. Greenfield projects only.'));
  hRow.appendChild(thAcq);
  const thRent = document.createElement('th');
  thRent.className = 'col-rent';
  thRent.textContent = 'Rent ($/ac/yr) ';
  thRent.appendChild(makeHelpIcon('Annual per-acre rent for existing or leased ROW corridor. Reconductoring / existing ROW projects only.'));
  hRow.appendChild(thRent);
  thead.appendChild(hRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  let visibleZones = getInitialVisibleZoneCount(data);
  for (let z = 1; z <= 15; z++) {
    const tr = document.createElement('tr');
    if (z > visibleZones) tr.style.display = 'none';
    tr.dataset.zone = z;

    const basePath = `11_project_row_details.right_of_way.zone_${z}`;
    const milesVal = getValueAtFieldPath(data, '11_project_row_details', `right_of_way.zone_${z}.miles`) ?? 0;
    const holdVal = getValueAtFieldPath(data, '11_project_row_details', `right_of_way.zone_${z}.hold_cost`) ?? 0;
    const acqVal = getValueAtFieldPath(data, '11_project_row_details', `right_of_way.zone_${z}.acquisition_cost`) ?? 0;
    const rentVal = getValueAtFieldPath(data, '11_project_row_details', `right_of_way.zone_${z}.rent_cost`) ?? 0;

    function makeInput(suffix, value, isCurrency) {
      const input = document.createElement('input');
      input.type = 'text';
      input.dataset.path = basePath + '.' + suffix;
      if (isCurrency) {
        input.className = 'currency-input';
        const n = Number(value);
        input.value = (value !== null && value !== undefined && !isNaN(n)) ? '$' + n.toLocaleString('en-US', {maximumFractionDigits: 2}) : '';
        input.addEventListener('focus', () => { input.value = input.value.replace(/[$,]/g, ''); });
        input.addEventListener('blur', () => {
          const raw = parseFloat(input.value.replace(/[$,]/g, ''));
          if (!isNaN(raw)) input.value = '$' + raw.toLocaleString('en-US', {maximumFractionDigits: 2});
        });
      } else {
        input.className = 'number-input';
        const n = Number(value);
        input.value = (value !== null && value !== undefined && !isNaN(n)) ? n.toLocaleString('en-US', {maximumFractionDigits: 10}) : '';
        input.addEventListener('focus', () => { input.value = input.value.replace(/,/g, ''); });
        input.addEventListener('blur', () => {
          const raw = parseFloat(input.value.replace(/,/g, ''));
          if (!isNaN(raw)) input.value = raw.toLocaleString('en-US', {maximumFractionDigits: 10});
        });
      }
      return input;
    }

    const tdZone = document.createElement('td');
    tdZone.textContent = z;
    tr.appendChild(tdZone);

    const tdMiles = document.createElement('td');
    const zoneMilesInput = makeInput('miles', milesVal, false);
    zoneMilesInput.min = '0';
    zoneMilesInput.addEventListener('input', () => { if (parseFloat(zoneMilesInput.value) < 0) zoneMilesInput.value = '0'; updateZoneAcres(); });
    tdMiles.appendChild(zoneMilesInput);
    tr.appendChild(tdMiles);

    const tdAcres = document.createElement('td');
    tdAcres.className = 'computed-cell';
    tdAcres.dataset.zoneAcres = z;
    const rowW = getRowWidthFeet() || 150;
    const acresVal = milesVal ? milesToAcres(Number(milesVal), rowW) : 0;
    tdAcres.textContent = acresVal > 0 ? acresVal.toFixed(1) : '';
    tdAcres.appendChild(makeEquationIcon({...EQ_ZONE_AREA, context: `Acres of ROW in Zone ${z}. Computed as miles × 5280 × ROW width / 43,560. Per-acre costs (holding, acquisition, rent) multiply this value.`}));
    tr.appendChild(tdAcres);

    const tdHold = document.createElement('td');
    tdHold.className = 'col-holding';
    tdHold.appendChild(makeInput('hold_cost', holdVal, true));
    tdHold.appendChild(makeEquationIcon({...EQ_HOLD_ANNUAL, context: `Annual holding (option fee) per acre for Zone ${z} during the delay/permitting period.`}));
    tr.appendChild(tdHold);

    const tdAcq = document.createElement('td');
    tdAcq.className = 'col-acquisition';
    tdAcq.appendChild(makeInput('acquisition_cost', acqVal, true));
    tdAcq.appendChild(makeEquationIcon({...EQ_ACQUISITION, context: `One-time acquisition cost per acre for Zone ${z}.`}));
    tr.appendChild(tdAcq);

    const tdRent = document.createElement('td');
    tdRent.className = 'col-rent';
    tdRent.appendChild(makeInput('rent_cost', rentVal, true));
    tdRent.appendChild(makeEquationIcon({...EQ_RENT_ANNUAL, context: `Annual rent per acre for Zone ${z}. Applies for reconductoring/existing ROW.`}));
    tr.appendChild(tdRent);

    tbody.appendChild(tr);
  }

  const totalRow = document.createElement('tr');
  totalRow.className = 'row-total-row';
  const tdTotalLabel = document.createElement('td');
  tdTotalLabel.textContent = 'TOTAL';
  tdTotalLabel.style.fontWeight = '700';
  totalRow.appendChild(tdTotalLabel);
  const tdTotalMiles = document.createElement('td');
  tdTotalMiles.id = 'row-total-miles-cell';
  tdTotalMiles.textContent = '0';
  totalRow.appendChild(tdTotalMiles);
  const tdTotalAcresCell = document.createElement('td');
  tdTotalAcresCell.className = 'computed-cell';
  tdTotalAcresCell.id = 'row-total-acres-cell';
  totalRow.appendChild(tdTotalAcresCell);
  const tdTotalHold = document.createElement('td');
  tdTotalHold.className = 'col-holding';
  totalRow.appendChild(tdTotalHold);
  const tdTotalAcq = document.createElement('td');
  tdTotalAcq.className = 'col-acquisition';
  totalRow.appendChild(tdTotalAcq);
  const tdTotalRent = document.createElement('td');
  tdTotalRent.className = 'col-rent';
  totalRow.appendChild(tdTotalRent);
  tbody.appendChild(totalRow);

  function updateZoneAcres() {
    const rowW = getRowWidthFeet() || 150;
    let totalAcres = 0;
    for (let zz = 1; zz <= 15; zz++) {
      const mi = parseFloat((table.querySelector(`input[data-path$="zone_${zz}.miles"]`)?.value || '0').replace(/,/g, '')) || 0;
      const ac = mi > 0 ? milesToAcres(mi, rowW) : 0;
      const cell = table.querySelector(`[data-zone-acres="${zz}"]`);
      if (cell) {
        const eqIcon = cell.querySelector('.equation-icon');
        cell.textContent = ac > 0 ? ac.toFixed(1) : '';
        if (eqIcon) cell.appendChild(eqIcon);
      }
      if (table.querySelector(`tr[data-zone="${zz}"]`)?.style.display !== 'none') totalAcres += ac;
    }
    tdTotalAcresCell.textContent = totalAcres > 0 ? totalAcres.toFixed(1) : '';
  }
  setTimeout(updateZoneAcres, 0);

  table.appendChild(tbody);

  const rowTableCard = document.createElement('div');
  rowTableCard.className = 'forge-table-card';
  rowTableCard.appendChild(table);

  const rowSource = document.createElement('div');
  rowSource.className = 'forge-source';
  rowSource.innerHTML = '<svg width="10" height="10" viewBox="0 0 16 16"><path d="M13 1H3a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V3a2 2 0 00-2-2zM5 4h6v1H5V4zm0 3h6v1H5V7zm0 3h4v1H5v-1z" fill="currentColor"/></svg> BLM ROW Rates, 43 CFR 2806 (2023)';
  rowTableCard.appendChild(rowSource);

  wrapper.appendChild(rowTableCard);

  const footer = document.createElement('div');
  footer.className = 'zone-table-footer';

  const zoneActions = document.createElement('div');
  zoneActions.className = 'zone-table-actions';

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'add-zone-btn';
  addBtn.textContent = '+ Add Zone';
  addBtn.disabled = visibleZones >= 15;
  addBtn.addEventListener('click', () => {
    if (visibleZones >= 15) return;
    visibleZones++;
    const row = tbody.querySelector(`tr[data-zone="${visibleZones}"]`);
    if (row) row.style.display = '';
    addBtn.disabled = visibleZones >= 15;
    removeBtn.disabled = visibleZones <= 1;
    updateZoneAcres();
  });
  zoneActions.appendChild(addBtn);

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'remove-zone-btn';
  removeBtn.textContent = '− Remove Last';
  removeBtn.disabled = visibleZones <= 1;
  removeBtn.addEventListener('click', () => {
    if (visibleZones <= 1) return;
    const row = tbody.querySelector(`tr[data-zone="${visibleZones}"]`);
    if (row) {
      row.querySelectorAll('input[data-path]').forEach(inp => { inp.value = ''; });
      row.style.display = 'none';
    }
    visibleZones--;
    addBtn.disabled = false;
    removeBtn.disabled = visibleZones <= 1;
    updateZoneAcres();
  });
  zoneActions.appendChild(removeBtn);
  footer.appendChild(zoneActions);

  wrapper.appendChild(footer);
  return wrapper;
}

function renderROWZoneTable(data) {
  return renderROWZonesTable(data);
}

function isGreenfieldROW() {
  const recon = document.querySelector('[data-path="01_project_technical_details.project.reconductoring"]');
  const existingROW = document.querySelector('[data-path="01_project_technical_details.project.uses_existing_row"]');
  return !(recon?.checked || existingROW?.checked);
}

function updateROWColumnVisibility() {
  const table = document.getElementById('row-zone-table');
  if (!table) return;
  const gf = isGreenfieldROW();
  table.className = gf ? 'forge-table forge-table--editable row-table-greenfield' : 'forge-table forge-table--editable row-table-existing';
  const panel = document.getElementById('row-cost-panel');
  if (panel) {
    panel.querySelectorAll('.greenfield-only').forEach(el => el.style.display = gf ? '' : 'none');
    panel.querySelectorAll('.rent-only').forEach(el => el.style.display = gf ? 'none' : '');
  }
}

function renderROWCostPanel() {
  const panel = document.createElement('div');
  panel.className = 'row-cost-panel';
  panel.id = 'row-cost-panel';

  const title = document.createElement('h4');
  title.className = 'cost-panel-title';
  title.textContent = 'ROW Cost Summary';
  panel.appendChild(title);

  const subtitle = document.createElement('p');
  subtitle.className = 'cost-panel-subtitle';
  subtitle.textContent = 'Updates as you edit zones';
  panel.appendChild(subtitle);

  function makeSection(id, heading, lines, className) {
    const section = document.createElement('div');
    section.className = 'cost-section' + (className ? ' ' + className : '');
    section.id = id;
    const h5 = document.createElement('h5');
    h5.textContent = heading;
    section.appendChild(h5);
    lines.forEach(([label, attr, eqData]) => {
      const line = document.createElement('div');
      line.className = 'cost-line';
      const spanLabel = document.createElement('span');
      spanLabel.textContent = label;
      if (eqData) spanLabel.appendChild(makeEquationIcon(eqData));
      line.appendChild(spanLabel);
      const spanVal = document.createElement('span');
      spanVal.dataset.rowCost = attr;
      spanVal.textContent = '---';
      line.appendChild(spanVal);
      section.appendChild(line);
    });
    return section;
  }

  panel.appendChild(makeSection('rcp-holding', 'HOLDING', [
    ['Nominal:', 'holding_nominal', EQ_HOLD_NOMINAL],
    ['PV:', 'holding_pv', EQ_HOLD_PV],
  ], 'greenfield-only'));

  panel.appendChild(makeSection('rcp-acquisition', 'ACQUISITION', [
    ['Nominal:', 'acquisition_nominal', EQ_ACQ_NOMINAL],
    ['PV:', 'acquisition_pv', EQ_ACQ_PV],
  ], 'greenfield-only'));

  panel.appendChild(makeSection('rcp-rent', 'ROW RENT', [
    ['Nominal:', 'rent_nominal', EQ_RENT_NOMINAL],
    ['PV:', 'rent_pv', EQ_RENT_PV],
  ], 'rent-only'));

  panel.appendChild(makeSection('rcp-capital', 'ROW CAPITAL (Hard)', [
    ['Nominal:', 'capital_nominal', EQ_ROW_CAPITAL],
    ['PV:', 'capital_pv', EQ_ROW_CAPITAL],
  ], ''));

  const computing = document.createElement('div');
  computing.className = 'cost-panel-computing';
  computing.id = 'rcp-computing';
  computing.textContent = '⟳ Computing…';
  computing.style.display = 'none';
  panel.appendChild(computing);

  return panel;
}

function renderDelayCostPanel() {
  const panel = document.createElement('div');
  panel.className = 'row-cost-panel';
  panel.id = 'delay-cost-panel';

  const title = document.createElement('h4');
  title.className = 'cost-panel-title';
  title.textContent = 'Delay Cost Summary';
  panel.appendChild(title);

  const subtitle = document.createElement('p');
  subtitle.className = 'cost-panel-subtitle';
  subtitle.textContent = 'Updates as you edit costs';
  panel.appendChild(subtitle);

  function makeSection(id, heading, lines, className) {
    const section = document.createElement('div');
    section.className = 'cost-section' + (className ? ' ' + className : '');
    section.id = id;
    const h5 = document.createElement('h5');
    h5.textContent = heading;
    section.appendChild(h5);
    lines.forEach(([label, attr, eqData]) => {
      const line = document.createElement('div');
      line.className = 'cost-line';
      const spanLabel = document.createElement('span');
      spanLabel.textContent = label;
      if (eqData) spanLabel.appendChild(makeEquationIcon(eqData));
      line.appendChild(spanLabel);
      const spanVal = document.createElement('span');
      spanVal.dataset.delayCost = attr;
      spanVal.textContent = '---';
      line.appendChild(spanVal);
      section.appendChild(line);
    });
    return section;
  }

  panel.appendChild(makeSection('dcp-base', 'BASE DELAY', [
    ['Annual total:', 'base_annual', EQ_DELAY_NOMINAL],
    ['Nominal:', 'base_nominal', EQ_DELAY_NOMINAL],
    ['PV:', 'base_pv', EQ_DELAY_PV],
  ], ''));

  panel.appendChild(makeSection('dcp-congestion', 'CONGESTION DELAY', [
    ['Nominal:', 'cong_nominal', EQ_CONG_DELAY],
    ['PV:', 'cong_pv', EQ_CONG_DELAY],
  ], ''));

  panel.appendChild(makeSection('dcp-total', 'ALL DELAY (Soft)', [
    ['Nominal:', 'all_nominal', EQ_ALL_DELAY],
    ['PV:', 'all_pv', EQ_ALL_DELAY],
  ], ''));

  const computing = document.createElement('div');
  computing.className = 'cost-panel-computing';
  computing.id = 'dcp-computing';
  computing.textContent = '⟳ Computing…';
  computing.style.display = 'none';
  panel.appendChild(computing);

  return panel;
}

function renderEnergyImpactPanel() {
  const panel = document.createElement('div');
  panel.className = 'row-cost-panel';
  panel.id = 'energy-impact-panel';

  const title = document.createElement('h4');
  title.className = 'cost-panel-title';
  title.textContent = 'Energy Impact Summary';
  panel.appendChild(title);
  const subtitle = document.createElement('p');
  subtitle.className = 'cost-panel-subtitle';
  subtitle.textContent = 'Updates as you edit mix';
  panel.appendChild(subtitle);

  function makeSection(id, heading, lines) {
    const section = document.createElement('div');
    section.className = 'cost-section';
    section.id = id;
    const h5 = document.createElement('h5');
    h5.textContent = heading;
    section.appendChild(h5);
    lines.forEach(([label, attr, eqData]) => {
      const line = document.createElement('div');
      line.className = 'cost-line';
      const spanLabel = document.createElement('span');
      spanLabel.textContent = label;
      if (eqData) spanLabel.appendChild(makeEquationIcon(eqData));
      line.appendChild(spanLabel);
      const spanVal = document.createElement('span');
      spanVal.dataset.energyCost = attr;
      spanVal.textContent = '---';
      line.appendChild(spanVal);
      section.appendChild(line);
    });
    return section;
  }

  panel.appendChild(makeSection('eip-lineloss', 'LINE LOSSES', [
    ['Nominal:', 'll_nominal', EQ_LINE_LOSS],
    ['PV:', 'll_pv', EQ_LINE_LOSS],
  ]));

  panel.appendChild(makeSection('eip-delivered', 'ENERGY DELIVERED', [
    ['Annual:', 'delivered_gwh'],
  ]));

  const chartTitle = document.createElement('h5');
  chartTitle.className = 'cost-section';
  chartTitle.style.cssText = 'font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;margin:1rem 0 0.5rem;';
  chartTitle.textContent = 'FUEL MIX COMPARISON';
  panel.appendChild(chartTitle);
  const canvas = document.createElement('canvas');
  canvas.id = 'fuel-mix-chart';
  canvas.width = 300; canvas.height = 250;
  panel.appendChild(canvas);

  const computing = document.createElement('div');
  computing.className = 'cost-panel-computing';
  computing.id = 'eip-computing';
  computing.textContent = '⟳ Computing…';
  computing.style.display = 'none';
  panel.appendChild(computing);
  return panel;
}

function updateFuelMixChart() {
  const canvas = document.getElementById('fuel-mix-chart');
  if (!canvas || typeof Chart === 'undefined') return;

  const gwh = getEnergyDeliveredGWh();
  const projShares = readFuelShares('initial');
  const projRates = readFuelRates('rate_post_cod');
  const lifetime = parseFloat((document.querySelector('[data-path="01_project_technical_details.project.project_lifetime"]')?.value || '50').replace(/,/g, '')) || 50;
  const step = Math.max(1, Math.round(lifetime / 10));
  const years = [];
  for (let y = 0; y <= lifetime; y += step) years.push(y);
  if (years[years.length - 1] !== lifetime) years.push(lifetime);

  const datasets = C.FUEL_SOURCES.map(f => ({
    label: C.FUEL_LABELS[f] || f,
    data: years.map(y => {
      const mix = projectFuelMix(projShares, projRates, y);
      return (mix[f] || 0) * gwh;
    }),
    backgroundColor: FUEL_COLORS[f] || '#999',
  }));

  const labels = years.map(y => 'Yr ' + y);

  if (fuelMixChartInstance) {
    fuelMixChartInstance.data.labels = labels;
    datasets.forEach((ds, i) => {
      if (fuelMixChartInstance.data.datasets[i]) {
        fuelMixChartInstance.data.datasets[i].data = ds.data;
      }
    });
    fuelMixChartInstance.update();
  } else {
    fuelMixChartInstance = new Chart(canvas, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: { stacked: true, title: { display: true, text: 'Project Year' } },
          y: { stacked: true, title: { display: true, text: 'GWh/yr' } },
        },
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } } },
      },
    });
  }
}

C.emissionsChartInstances = { co2: null, sox: null, nox: null };

function renderEmissionsImpactPanel() {
  const panel = document.createElement('div');
  panel.className = 'row-cost-panel';
  panel.id = 'emissions-impact-panel';

  const title = document.createElement('h4');
  title.className = 'cost-panel-title';
  title.textContent = 'Emissions Impact Summary';
  panel.appendChild(title);
  const subtitle = document.createElement('p');
  subtitle.className = 'cost-panel-subtitle';
  subtitle.textContent = 'Lifetime totals — updates as you edit';
  panel.appendChild(subtitle);

  const POLLUTANTS = [
    { label: 'CO₂', key: 'co2', unit: 'kt', yLabel: 'Cumulative CO₂ (kt)' },
    { label: 'SOₓ', key: 'sox', unit: 't', yLabel: 'Cumulative SOₓ (t)' },
    { label: 'NOₓ', key: 'nox', unit: 't', yLabel: 'Cumulative NOₓ (t)' },
  ];

  POLLUTANTS.forEach(({ label, key, unit }) => {
    const section = document.createElement('div');
    section.className = 'cost-section';
    const h5 = document.createElement('h5');
    h5.textContent = label;
    section.appendChild(h5);
    [
      { rowLabel: 'Post-COD (with line):', emisKey: 'project' },
      { rowLabel: 'Pre-COD (without line):', emisKey: 'counterfact' },
      { rowLabel: 'Avoided:', emisKey: 'avoided' },
    ].forEach(({ rowLabel, emisKey }) => {
      const line = document.createElement('div');
      line.className = 'cost-line';
      const spanLabel = document.createElement('span');
      spanLabel.textContent = rowLabel;
      if (emisKey === 'avoided') spanLabel.appendChild(makeEquationIcon(EQ_DISPLACEMENT));
      line.appendChild(spanLabel);
      const spanVal = document.createElement('span');
      spanVal.dataset.emisCost = `${key}_${emisKey}`;
      spanVal.textContent = '---';
      line.appendChild(spanVal);
      section.appendChild(line);
    });
    const canvas = document.createElement('canvas');
    canvas.id = `emissions-chart-${key}`;
    canvas.width = 300; canvas.height = 200;
    canvas.style.marginTop = '0.5rem';
    section.appendChild(canvas);
    panel.appendChild(section);
  });

  function makeDollarSection(id, heading, note, lines) {
    const section = document.createElement('div');
    section.className = 'cost-section';
    const h5 = document.createElement('h5');
    h5.textContent = heading;
    section.appendChild(h5);
    if (note) {
      const p = document.createElement('p');
      p.style.cssText = 'font-size:0.7rem;color:#9ca3af;margin:0 0 0.5rem;';
      p.textContent = note;
      section.appendChild(p);
    }
    lines.forEach(([label, attr, eq]) => {
      const line = document.createElement('div');
      line.className = 'cost-line';
      const sL = document.createElement('span');
      sL.textContent = label;
      sL.appendChild(makeEquationIcon(eq));
      line.appendChild(sL);
      const sV = document.createElement('span');
      sV.dataset.emisCost = attr;
      sV.textContent = '---';
      line.appendChild(sV);
      section.appendChild(line);
    });
    return section;
  }

  panel.appendChild(makeDollarSection('ecp', 'LOSS-COMP EMISSIONS (cost)',
    'C_emissions = C_comp only', [
    ['Nominal:', 'comp_cost_nominal', EQ_EMISSIONS],
    ['PV:', 'comp_cost_pv', EQ_EMISSIONS],
  ]));
  panel.appendChild(makeDollarSection('efp', 'FACILITATED EMISSIONS (intermediate)',
    'C_fac — does not enter NB directly', [
    ['Nominal:', 'fac_cost_nominal', EQ_EMISSIONS],
    ['PV:', 'fac_cost_pv', EQ_EMISSIONS],
  ]));
  panel.appendChild(makeDollarSection('edp', 'AVOIDED EMISSIONS (benefit)',
    'B_avoided = C_fac,no − C_fac,proj · Enters NB and BCR', [
    ['Nominal:', 'displ_nominal', EQ_DISPLACEMENT],
    ['PV:', 'displ_pv', EQ_DISPLACEMENT],
  ]));

  const computing = document.createElement('div');
  computing.className = 'cost-panel-computing';
  computing.id = 'emip-computing';
  computing.textContent = '⟳ Computing…';
  computing.style.display = 'none';
  panel.appendChild(computing);
  return panel;
}

function calculateROWMilesTotal() {
  let total = 0;
  for (let z = 1; z <= 15; z++) {
    const input = document.querySelector(`input[data-path="11_project_row_details.right_of_way.zone_${z}.miles"]`);
    if (input) {
      const value = parseNumberInput(input.value);
      if (value !== null) total += value;
    }
  }
  return total;
}


function validateCostTimingPatterns() {
  const TOLERANCE = 0.001;
  const categories = [
    'build_costs', 'row_acquisition', 'row_holding', 'row_rent',
    'environmental_mitigation_base', 'environmental_mitigation_credits',
    'delay_costs', 'operations_and_maintenance', 'construction_insurance'
  ];
  let allValid = true;
  categories.forEach(cat => {
    const base = `19_cost_timing_patterns.cost_timing_patterns.${cat}`;
    const afudcEl = document.querySelector(`[data-path="${base}.afudc_eligible"]`);
    const delayEl = document.querySelector(`[data-path="${base}.during_delay"]`);
    const constEl = document.querySelector(`[data-path="${base}.during_construction"]`);
    if (!afudcEl || !delayEl || !constEl) return;

    const isEligible = afudcEl.checked;
    const delay = (parseFloat(delayEl.value) || 0) / 100;
    const constr = (parseFloat(constEl.value) || 0) / 100;
    const sum = delay + constr;
    const valid = !isEligible || Math.abs(sum - 1.0) <= TOLERANCE;

    const warn = constEl.closest('.form-field')
      ?.parentElement?.querySelector('.timing-validation-warning');
    if (warn) {
      warn.classList.toggle('visible', !valid);
      if (!valid) {
        warn.textContent = `During Delay + During Construction = ${sum.toFixed(3)} (must equal 1.0 when AFUDC eligible)`;
      }
    }
    if (!valid) allValid = false;
  });
  return allValid;
}

const STANDARD_TERRAINS = ['forested','scrubbed_flat','wetland','farmland','desert_barren','urban','rolling_hills','mountain','subsea'];

const ENV_CONSTRUCTION_TYPES = {
  'Overhead': { key: 'overhead', terrains: ['forested','scrubbed_flat','wetland','farmland','desert_barren','urban','rolling_hills','mountain','subsea'] },
  'Underground Direct-Buried': { key: 'underground_direct_buried', terrains: ['forested','scrubbed_flat','wetland','farmland','desert_barren','urban','rolling_hills','mountain','subsea'] },
  'Underground Tunnel': { key: 'underground_tunnel', terrains: ['forested','scrubbed_flat','wetland','farmland','desert_barren','urban','rolling_hills','mountain','subsea','linear_corridor_default','shaft_site_default'] },
  'Subsea': { key: 'subsea', terrains: ['seabed_corridor_default','landfall_default'] },
};

function getActiveConstructionType() {
  const el = document.querySelector('[data-path="01_project_technical_details.project.construction_type"]');
  return el?.value || 'Overhead';
}

function terrainDisplayLabel(t) {
  return t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function getTerrainMilesFromDOM(terrain) {
  const input = document.querySelector(`input[data-path="02_project_physical_details.terrain.terrain_miles.${terrain}"]`);
  if (!input) return 0;
  const val = parseNumberInput(input.value);
  return val !== null ? val : 0;
}

function getUpliftFactorFromDOM() {
  const input = document.querySelector('input[data-path="09_environmental_mitigation.environmental_mitigation.mitigation_uplift_factor"]');
  if (!input) return 1;
  const val = parseNumberInput(input.value);
  return val !== null ? val : 1;
}

function renderEnvBaseMitigationTable(data) {
  const wrapper = document.createElement('div');
  wrapper.id = 'env-base-mitigation-wrapper';
  const ctValue = getActiveConstructionType();
  const ctInfo = ENV_CONSTRUCTION_TYPES[ctValue] || ENV_CONSTRUCTION_TYPES['Overhead'];
  const rowWidth = getRowWidthFeet() || 150;

  // Uplift factor
  const upliftDiv = document.createElement('div');
  upliftDiv.className = 'env-uplift-row';
  const upliftPath = '09_environmental_mitigation.environmental_mitigation.mitigation_uplift_factor';
  const upliftVal = getValueAtFieldPath(data, '09_environmental_mitigation', 'environmental_mitigation.mitigation_uplift_factor') ?? 1;
  upliftDiv.innerHTML = '<span class="env-uplift-label">Mitigation Uplift Factor</span> ';
  upliftDiv.appendChild(makeHelpIcon('TCE factor for construction width beyond ROW. Multiplied against base acreage.'));
  const upliftInput = document.createElement('input');
  upliftInput.type = 'text';
  upliftInput.className = 'number-input env-uplift-input';
  upliftInput.dataset.path = upliftPath;
  const un = Number(upliftVal);
  upliftInput.value = (!isNaN(un) && upliftVal !== null) ? un.toLocaleString('en-US', {maximumFractionDigits: 10}) : '';
  upliftInput.addEventListener('focus', () => { upliftInput.value = upliftInput.value.replace(/,/g, ''); });
  upliftInput.addEventListener('blur', () => {
    const raw = parseFloat(upliftInput.value.replace(/,/g, ''));
    if (!isNaN(raw)) upliftInput.value = raw.toLocaleString('en-US', {maximumFractionDigits: 10});
  });
  upliftDiv.appendChild(upliftInput);
  wrapper.appendChild(upliftDiv);

  // Read-only construction type
  const ctDisplay = document.createElement('div');
  ctDisplay.className = 'readonly-miles-display';
  ctDisplay.id = 'env-construction-type-display';
  ctDisplay.innerHTML = `<span class="readonly-miles-label">Construction Type:</span> <span class="readonly-display-value">${ctValue}</span>`;
  wrapper.appendChild(ctDisplay);

  // Total Effective Acres
  const totalAcresDisplay = document.createElement('div');
  totalAcresDisplay.className = 'readonly-miles-display';
  totalAcresDisplay.id = 'env-total-acres-base';
  totalAcresDisplay.innerHTML = '<span class="readonly-miles-label">Total Effective Acres:</span> <span class="readonly-display-value" data-env-total-acres>0</span>';
  totalAcresDisplay.querySelector('.readonly-miles-label').appendChild(makeHelpIcon('Sum of effective acres across all terrains for the active construction type.'));
  wrapper.appendChild(totalAcresDisplay);

  // Base mitigation table
  const table = document.createElement('table');
  table.className = 'forge-table forge-table--editable terrain-table';
  const ebCaption = document.createElement('caption');
  ebCaption.textContent = 'Base Mitigation Costs';
  ebCaption.appendChild(makeHelpIcon('Per-acre environmental restoration costs by terrain for the active construction type.'));
  table.appendChild(ebCaption);
  const thead = document.createElement('thead');
  const hRow = document.createElement('tr');
  const thTerrain = document.createElement('th');
  thTerrain.textContent = 'Terrain ';
  thTerrain.appendChild(makeHelpIcon('Terrain or corridor type affected by construction.'));
  hRow.appendChild(thTerrain);
  const thAcres = document.createElement('th');
  thAcres.textContent = 'Acres Impacted ';
  thAcres.appendChild(makeHelpIcon('Effective acres = terrain miles × ROW width × uplift factor. Read-only; changes when terrain miles or uplift factor change.'));
  hRow.appendChild(thAcres);
  const thCost = document.createElement('th');
  thCost.textContent = 'Cost ($/acre) ';
  thCost.appendChild(makeHelpIcon('Per-acre mitigation/restoration cost for this terrain under ' + ctValue + ' construction.'));
  hRow.appendChild(thCost);
  thead.appendChild(hRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  ctInfo.terrains.forEach(t => {
    const isExtra = !STANDARD_TERRAINS.includes(t);
    const tr = document.createElement('tr');
    if (isExtra) tr.classList.add('extra-terrain-row');

    const tdLabel = document.createElement('td');
    tdLabel.textContent = terrainDisplayLabel(t);
    tdLabel.style.fontWeight = '500';
    tr.appendChild(tdLabel);

    const tdAcres = document.createElement('td');
    tdAcres.className = 'env-acres-cell';
    tdAcres.dataset.envAcresTerrain = t;

    if (isExtra) {
      const milesPath = `02_project_physical_details.terrain.terrain_miles.${t}`;
      const existingMiles = getTerrainMilesFromDOM(t);
      const milesInput = document.createElement('input');
      milesInput.type = 'number';
      milesInput.min = '0';
      milesInput.step = '0.1';
      milesInput.className = 'number-input extra-terrain-miles';
      milesInput.dataset.path = milesPath;
      milesInput.value = existingMiles || '';
      milesInput.placeholder = 'miles';
      milesInput.title = 'Enter miles directly — not linked to routing terrain mix';

      const acresSpan = document.createElement('span');
      acresSpan.className = 'extra-terrain-acres-display';
      const uplift = getUpliftFactorFromDOM();
      const initAcres = existingMiles > 0 ? milesToAcres(existingMiles, rowWidth) * uplift : 0;
      acresSpan.textContent = initAcres > 0 ? initAcres.toLocaleString('en-US', {maximumFractionDigits: 1}) : '0';

      milesInput.addEventListener('input', () => {
        if (parseFloat(milesInput.value) < 0) milesInput.value = '0';
        const m = parseFloat(milesInput.value) || 0;
        const u = getUpliftFactorFromDOM();
        const rw = getRowWidthFeet() || 150;
        const a = m > 0 ? milesToAcres(m, rw) * u : 0;
        acresSpan.textContent = a > 0 ? a.toLocaleString('en-US', {maximumFractionDigits: 1}) : '0';
      });

      tdAcres.appendChild(milesInput);
      tdAcres.appendChild(document.createTextNode(' → '));
      tdAcres.appendChild(acresSpan);
    } else {
      const miles = getTerrainMilesFromDOM(t);
      const uplift = getUpliftFactorFromDOM();
      const acres = miles > 0 ? milesToAcres(miles, rowWidth) * uplift : 0;
      tdAcres.textContent = acres > 0 ? acres.toLocaleString('en-US', {maximumFractionDigits: 1}) : '0';
    }
    tr.appendChild(tdAcres);

    const tdCost = document.createElement('td');
    const fullPath = `09_environmental_mitigation.environmental_mitigation.base_mitigation_cost_per_acre.${ctInfo.key}.${t}`;
    const val = getValueAtFieldPath(data, '09_environmental_mitigation', `environmental_mitigation.base_mitigation_cost_per_acre.${ctInfo.key}.${t}`) ?? 0;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'currency-input';
    input.dataset.path = fullPath;
    const n = Number(val);
    input.value = (!isNaN(n) && val !== null) ? '$' + n.toLocaleString('en-US', {maximumFractionDigits: 2}) : '';
    input.addEventListener('focus', () => { input.value = input.value.replace(/[$,]/g, ''); });
    input.addEventListener('blur', () => {
      const raw = parseFloat(input.value.replace(/[$,]/g, ''));
      if (!isNaN(raw)) input.value = '$' + raw.toLocaleString('en-US', {maximumFractionDigits: 2});
    });
    tdCost.appendChild(input);
    tr.appendChild(tdCost);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  const envBaseTableCard = document.createElement('div');
  envBaseTableCard.className = 'forge-table-card';
  envBaseTableCard.appendChild(table);

  const envBaseSource = document.createElement('div');
  envBaseSource.className = 'forge-source';
  envBaseSource.innerHTML = '<svg width="10" height="10" viewBox="0 0 16 16"><path d="M13 1H3a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V3a2 2 0 00-2-2zM5 4h6v1H5V4zm0 3h6v1H5V7zm0 3h4v1H5v-1z" fill="currentColor"/></svg> Environmental mitigation cost estimates';
  envBaseTableCard.appendChild(envBaseSource);

  wrapper.appendChild(envBaseTableCard);
  return wrapper;
}

function renderEnvCreditsTable(data) {
  const wrapper = document.createElement('div');
  wrapper.id = 'env-credits-wrapper';
  const CREDITS = [
    { path: 'environmental_mitigation.wetland_credit_cost_per_acre', label: 'Wetland', terrain: 'wetland', help: 'Per-acre credit purchase cost for wetland mitigation banking' },
    { path: 'environmental_mitigation.habitat_credit_cost_per_acre.forested', label: 'Habitat — Forested', terrain: 'forested', help: 'Per-acre habitat credit cost for forested terrain' },
    { path: 'environmental_mitigation.habitat_credit_cost_per_acre.scrubbed_flat', label: 'Habitat — Scrubbed Flat', terrain: 'scrubbed_flat', help: 'Per-acre habitat credit cost for scrubbed flat terrain' },
    { path: 'environmental_mitigation.habitat_credit_cost_per_acre.desert_barren', label: 'Habitat — Desert Barren', terrain: 'desert_barren', help: 'Per-acre habitat credit cost for desert barren terrain' },
    { path: 'environmental_mitigation.habitat_credit_cost_per_acre.rolling_hills', label: 'Habitat — Rolling Hills', terrain: 'rolling_hills', help: 'Per-acre habitat credit cost for rolling hills terrain' },
    { path: 'environmental_mitigation.habitat_credit_cost_per_acre.mountain', label: 'Habitat — Mountain', terrain: 'mountain', help: 'Per-acre habitat credit cost for mountain terrain' },
  ];

  const rowWidth = getRowWidthFeet() || 150;
  const uplift = getUpliftFactorFromDOM();

  // Total Effective Acres
  const totalAcresDisplay = document.createElement('div');
  totalAcresDisplay.className = 'readonly-miles-display';
  totalAcresDisplay.id = 'env-total-acres-credits';
  totalAcresDisplay.innerHTML = '<span class="readonly-miles-label">Total Effective Acres:</span> <span class="readonly-display-value" data-env-total-acres>0</span>';
  totalAcresDisplay.querySelector('.readonly-miles-label').appendChild(makeHelpIcon('Sum of effective acres requiring habitat and wetland credit purchases.'));
  wrapper.appendChild(totalAcresDisplay);

  const table = document.createElement('table');
  table.className = 'forge-table forge-table--editable terrain-table';
  const ecCaption = document.createElement('caption');
  ecCaption.textContent = 'Habitat Credit Costs';
  ecCaption.appendChild(makeHelpIcon('Per-acre credit purchase costs for habitat and wetland mitigation.'));
  table.appendChild(ecCaption);
  const thead = document.createElement('thead');
  const hRow = document.createElement('tr');
  const thType = document.createElement('th');
  thType.textContent = 'Credit Type ';
  thType.appendChild(makeHelpIcon('Purchased environmental credits that offset mitigation obligations.'));
  hRow.appendChild(thType);
  const thAcres = document.createElement('th');
  thAcres.textContent = 'Acres Impacted ';
  thAcres.appendChild(makeHelpIcon('Effective acres of this habitat/wetland type impacted by construction. Read-only; derived from terrain miles, ROW width, and uplift factor.'));
  hRow.appendChild(thAcres);
  const thCost = document.createElement('th');
  thCost.textContent = 'Cost ($/acre) ';
  thCost.appendChild(makeHelpIcon('Per-acre credit purchase cost.'));
  hRow.appendChild(thCost);
  thead.appendChild(hRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  CREDITS.forEach(c => {
    const tr = document.createElement('tr');
    const tdLabel = document.createElement('td');
    tdLabel.textContent = c.label;
    tdLabel.style.fontWeight = '500';
    tr.appendChild(tdLabel);

    // Acres Impacted (read-only computed)
    const tdAcres = document.createElement('td');
    tdAcres.className = 'env-acres-cell';
    tdAcres.dataset.envAcresTerrain = c.terrain;
    const miles = getTerrainMilesFromDOM(c.terrain);
    const acres = miles > 0 ? milesToAcres(miles, rowWidth) * uplift : 0;
    tdAcres.textContent = acres > 0 ? acres.toLocaleString('en-US', {maximumFractionDigits: 1}) : '0';
    tr.appendChild(tdAcres);

    const tdCost = document.createElement('td');
    const fullPath = '09_environmental_mitigation.' + c.path;
    const val = getValueAtFieldPath(data, '09_environmental_mitigation', c.path) ?? 0;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'currency-input';
    input.dataset.path = fullPath;
    const n = Number(val);
    input.value = (!isNaN(n) && val !== null) ? '$' + n.toLocaleString('en-US', {maximumFractionDigits: 2}) : '';
    input.addEventListener('focus', () => { input.value = input.value.replace(/[$,]/g, ''); });
    input.addEventListener('blur', () => {
      const raw = parseFloat(input.value.replace(/[$,]/g, ''));
      if (!isNaN(raw)) input.value = '$' + raw.toLocaleString('en-US', {maximumFractionDigits: 2});
    });
    tdCost.appendChild(input);
    tr.appendChild(tdCost);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  const envCreditsTableCard = document.createElement('div');
  envCreditsTableCard.className = 'forge-table-card';
  envCreditsTableCard.appendChild(table);

  const envCreditsSource = document.createElement('div');
  envCreditsSource.className = 'forge-source';
  envCreditsSource.innerHTML = '<svg width="10" height="10" viewBox="0 0 16 16"><path d="M13 1H3a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V3a2 2 0 00-2-2zM5 4h6v1H5V4zm0 3h6v1H5V7zm0 3h4v1H5v-1z" fill="currentColor"/></svg> Habitat credit market rates';
  envCreditsTableCard.appendChild(envCreditsSource);

  wrapper.appendChild(envCreditsTableCard);
  return wrapper;
}

function updateEnvironmentalAcres() {
  const rowWidth = getRowWidthFeet() || 150;
  const uplift = getUpliftFactorFromDOM();

  document.querySelectorAll('[data-env-acres-terrain]').forEach(cell => {
    const terrain = cell.dataset.envAcresTerrain;
    const extraInput = cell.querySelector('.extra-terrain-miles');
    if (extraInput) {
      const m = parseFloat(extraInput.value) || 0;
      const a = m > 0 ? milesToAcres(m, rowWidth) * uplift : 0;
      const span = cell.querySelector('.extra-terrain-acres-display');
      if (span) span.textContent = a > 0 ? a.toLocaleString('en-US', {maximumFractionDigits: 1}) : '0';
    } else {
      const miles = getTerrainMilesFromDOM(terrain);
      const acres = miles > 0 ? milesToAcres(miles, rowWidth) * uplift : 0;
      cell.textContent = acres > 0 ? acres.toLocaleString('en-US', {maximumFractionDigits: 1}) : '0';
    }
  });

  let computedTotal = 0;
  STANDARD_TERRAINS.forEach(t => {
    const miles = getTerrainMilesFromDOM(t);
    if (miles > 0) computedTotal += milesToAcres(miles, rowWidth) * uplift;
  });
  document.querySelectorAll('.extra-terrain-miles').forEach(inp => {
    const m = parseFloat(inp.value) || 0;
    if (m > 0) computedTotal += milesToAcres(m, rowWidth) * uplift;
  });

  const totalStr = computedTotal > 0 ? computedTotal.toLocaleString('en-US', {maximumFractionDigits: 1}) : '0';
  document.querySelectorAll('[data-env-total-acres]').forEach(el => { el.textContent = totalStr; });
}

function rebuildEnvBaseMitigation(data, fromConfigChange) {
  const oldWrapper = document.getElementById('env-base-mitigation-wrapper');
  if (!oldWrapper) return;

  const parent = oldWrapper.parentNode;
  const newWrapper = renderEnvBaseMitigationTable(data);
  parent.replaceChild(newWrapper, oldWrapper);

  updateEnvironmentalAcres();

  if (fromConfigChange) {
    showToast('Environmental costs reset to defaults for new configuration');
  }
}

function showBuildCostConfirmDialog(component, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-dialog-overlay';
  const dialog = document.createElement('div');
  dialog.className = 'confirm-dialog';
  const title = `Override ${component} costs?`;
  const body = 'These values are sourced from the NREL/DOE database for your project configuration. Most users should keep the defaults.';
  const checkId = `suppress-${component}-cost-check`;
  dialog.innerHTML = `
    <div class="confirm-dialog-title">${title}</div>
    <div class="confirm-dialog-body">${body}</div>
    <label class="confirm-dialog-suppress"><input type="checkbox" id="${checkId}"> Don't show this warning again</label>
    <div class="confirm-dialog-buttons">
      <button type="button" class="confirm-btn-cancel">Keep Defaults</button>
      <button type="button" class="confirm-btn-confirm">Edit Values</button>
    </div>
  `;
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  dialog.querySelector('.confirm-btn-cancel').addEventListener('click', () => overlay.remove());
  dialog.querySelector('.confirm-btn-confirm').addEventListener('click', () => {
    const suppress = dialog.querySelector(`#${checkId}`).checked;
    overlay.remove();
    onConfirm(suppress);
  });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

const CONDUCTOR_DETAIL_ROWS = [
  { key: 'conductor_specification', label: 'Conductor Specification', format: v => v || '—', tooltip: 'Industry specification for the conductor used in this configuration.' },
  { key: 'voltage_kv', label: 'Voltage (kV)', format: v => v != null ? v : '—', tooltip: 'Operating voltage determined by capacity and conductor selection.' },
  { key: 'conductors_per_phase', label: 'Conductors per Phase', format: v => v != null ? String(v) : '—', tooltip: 'Number of parallel conductors per electrical phase.' },
  { key: 'number_of_phases', label: 'Number of Phases', format: v => v != null ? String(v) : '—', tooltip: 'Number of electrical phases in the circuit.' },
  { key: 'number_of_circuits_poles', label: 'Circuits / Poles', format: v => v != null ? String(v) : '—', tooltip: 'Number of independent circuits (AC) or poles (DC).' },
  { key: 'AC_75_resistance', label: 'AC 75\u00B0C Resistance (\u03A9/mi)', format: v => v != null ? v : '—', tooltip: 'AC resistance at 75\u00B0C operating temperature.' },
  { key: 'DC_20_resistance', label: 'DC 20\u00B0C Resistance (\u03A9/mi)', format: v => v != null ? v : '—', tooltip: 'DC resistance at 20\u00B0C reference temperature.' },
];

function isReconductoring() {
  const el = document.querySelector('[data-path="01_project_technical_details.project.reconductoring"]');
  return el ? el.checked : false;
}

function renderConductorDetailsTable() {
  const wrapper = document.createElement('div');
  wrapper.id = 'conductor-details-wrapper';
  wrapper.className = 'forge-params-card';

  const cat = buildCategoryString();
  const entry = getCircuitDetailsEntry();
  const recon = isReconductoring();
  const oldCat = recon ? buildOldCategoryString() : null;
  const oldEntry = (recon && oldCat && C.circuitDetailsLookup) ? (C.circuitDetailsLookup[oldCat] ?? null) : null;

  const cardHeader = document.createElement('div');
  cardHeader.className = 'card-header';
  cardHeader.innerHTML = 'Derived Parameters <span class="badge-readonly">Read-only</span>';
  wrapper.appendChild(cardHeader);

  const container = document.createElement('div');
  container.className = 'params-container';

  const CONDUCTOR_VALUE_UNITS = {
    voltage_kv: ' kV',
    AC_75_resistance: ' \u03A9/mi',
    DC_20_resistance: ' \u03A9/mi',
  };

  CONDUCTOR_DETAIL_ROWS.forEach(row => {
    const paramRow = document.createElement('div');
    paramRow.className = 'param-row';

    const keySpan = document.createElement('span');
    keySpan.className = 'param-key';
    keySpan.textContent = row.label;
    keySpan.appendChild(makeHelpIcon(row.tooltip));
    paramRow.appendChild(keySpan);

    const rawVal = entry ? row.format(entry[row.key]) : '—';
    const unit = rawVal !== '—' ? (CONDUCTOR_VALUE_UNITS[row.key] || '') : '';
    const valSpan = document.createElement('span');
    valSpan.className = 'param-value';
    valSpan.dataset.circuitField = row.key;
    valSpan.textContent = rawVal + unit;
    paramRow.appendChild(valSpan);

    if (recon) {
      const oldRaw = oldEntry ? row.format(oldEntry[row.key]) : '—';
      const oldUnit = oldRaw !== '—' ? (CONDUCTOR_VALUE_UNITS[row.key] || '') : '';
      const oldSpan = document.createElement('span');
      oldSpan.className = 'param-value-old';
      oldSpan.dataset.circuitFieldOld = row.key;
      oldSpan.textContent = oldRaw + oldUnit;
      paramRow.appendChild(oldSpan);
    }

    container.appendChild(paramRow);
  });

  wrapper.appendChild(container);

  const source = document.createElement('div');
  source.className = 'forge-source';
  source.innerHTML = '<svg width="10" height="10" viewBox="0 0 16 16"><path d="M13 1H3a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V3a2 2 0 00-2-2zM5 4h6v1H5V4zm0 3h6v1H5V7zm0 3h4v1H5v-1z" fill="currentColor"/></svg> NREL/DOE Conductor Database (2024)';
  wrapper.appendChild(source);

  return wrapper;
}

function updateAcDcWarning() {
  const acDc = document.querySelector('[data-path="01_project_technical_details.project.ac_dc"]')?.value || '';
  const oldAcDc = document.querySelector('[data-path="01_project_technical_details.project.old_ac_dc"]')?.value || '';
  const recon = document.querySelector('[data-path="01_project_technical_details.project.reconductoring"]');
  let banner = document.getElementById('ac-dc-conversion-warning');
  const shouldShow = recon?.checked && acDc && oldAcDc && acDc !== oldAcDc;
  if (shouldShow && !banner) {
    banner = document.createElement('div');
    banner.id = 'ac-dc-conversion-warning';
    banner.className = 'forge-validation-banner';
    banner.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> <span class="banner-text">AC\u2194DC conversion scenario \u2014 capacity comparisons may not be directly comparable. Review results carefully.</span>';
    const configSubTab = document.querySelector('[data-sub-tab="technology"]');
    if (configSubTab) configSubTab.prepend(banner);
  } else if (banner) {
    banner.style.display = shouldShow ? '' : 'none';
  }
}

function rebuildConductorDetails() {
  const existingWrapper = document.getElementById('conductor-details-wrapper');
  if (existingWrapper) {
    const parent = existingWrapper.parentNode;
    const newWrapper = renderConductorDetailsTable();
    parent.replaceChild(newWrapper, existingWrapper);
  }

  // Update voltage display on Configuration sub-tab
  const entry = getCircuitDetailsEntry();
  const voltageVal = document.querySelector('[data-voltage-display]');
  if (voltageVal) voltageVal.textContent = entry?.voltage_kv != null ? entry.voltage_kv + ' kV' : '—';
}

function renderStructureDetailsTable() {
  const wrapper = document.createElement('div');
  wrapper.id = 'structure-details-wrapper';

  const ctEl = document.querySelector('[data-path="01_project_technical_details.project.construction_type"]');
  const constructionType = ctEl ? normalizeCT(ctEl.value) : '';
  const entry = C.structureDetailsLookup ? (C.structureDetailsLookup[constructionType] ?? null) : null;

  const ctxDisplay = document.createElement('div');
  ctxDisplay.className = 'readonly-miles-display';
  ctxDisplay.id = 'structure-details-context';
  const ctxLabel = document.createElement('span');
  ctxLabel.className = 'readonly-miles-label';
  ctxLabel.textContent = 'Construction Type:';
  ctxLabel.appendChild(makeHelpIcon('Structure density values apply to the selected installation method.'));
  ctxDisplay.appendChild(ctxLabel);
  ctxDisplay.appendChild(document.createTextNode(' '));
  const ctxValue = document.createElement('span');
  ctxValue.className = 'readonly-display-value';
  ctxValue.id = 'structure-details-construction-value';
  ctxValue.textContent = constructionType || '—';
  ctxDisplay.appendChild(ctxValue);
  wrapper.appendChild(ctxDisplay);

  const ROWS = [
    { key: 'structures_per_mile_forested', label: 'Forested', unit: '', tooltip: 'Higher density due to shorter span lengths in trees.' },
    { key: 'structures_per_mile_scrubbed_flat', label: 'Scrubbed Flat', unit: '', tooltip: 'Standard flat-terrain structure density.' },
    { key: 'structures_per_mile_wetland', label: 'Wetland', unit: '', tooltip: 'Standard density; foundations differ, not structure count.' },
    { key: 'structures_per_mile_farmland', label: 'Farmland', unit: '', tooltip: 'Standard flat-terrain structure density.' },
    { key: 'structures_per_mile_desert_barren', label: 'Desert / Barren', unit: '', tooltip: 'Standard flat-terrain structure density.' },
    { key: 'structures_per_mile_urban', label: 'Urban', unit: '', tooltip: 'Higher density due to routing constraints in developed areas.' },
    { key: 'structures_per_mile_rolling_hills', label: 'Rolling Hills', unit: '', tooltip: 'Moderate increase for elevation changes.' },
    { key: 'structures_per_mile_mountain', label: 'Mountain', unit: '', tooltip: 'Highest density — short spans required by steep terrain.' },
    { key: 'cost_per_structure_per_year', label: 'Maintenance Cost ($/structure/yr)', unit: '', tooltip: 'Annual O&M cost per structure for inspection and repair.', isCurrency: true },
  ];

  const paramsCard = document.createElement('div');
  paramsCard.className = 'forge-params-card';

  const sdCardHeader = document.createElement('div');
  sdCardHeader.className = 'card-header';
  sdCardHeader.innerHTML = 'Structure Density <span class="badge-readonly">Read-only</span>';
  paramsCard.appendChild(sdCardHeader);

  const sdContainer = document.createElement('div');
  sdContainer.className = 'params-container';

  ROWS.forEach(row => {
    const paramRow = document.createElement('div');
    paramRow.className = 'param-row';

    const keySpan = document.createElement('span');
    keySpan.className = 'param-key';
    keySpan.textContent = row.label;
    keySpan.appendChild(makeHelpIcon(row.tooltip));
    paramRow.appendChild(keySpan);

    const valSpan = document.createElement('span');
    valSpan.className = 'param-value';
    valSpan.dataset.structureField = row.key;
    if (entry && entry[row.key] != null) {
      valSpan.textContent = row.isCurrency
        ? '$' + Number(entry[row.key]).toLocaleString()
        : entry[row.key] + row.unit;
    } else {
      valSpan.textContent = '—';
    }
    paramRow.appendChild(valSpan);

    sdContainer.appendChild(paramRow);
  });

  paramsCard.appendChild(sdContainer);

  const sdSource = document.createElement('div');
  sdSource.className = 'forge-source';
  sdSource.innerHTML = '<svg width="10" height="10" viewBox="0 0 16 16"><path d="M13 1H3a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V3a2 2 0 00-2-2zM5 4h6v1H5V4zm0 3h6v1H5V7zm0 3h4v1H5v-1z" fill="currentColor"/></svg> NREL Transmission Structure Database (2024)';
  paramsCard.appendChild(sdSource);

  wrapper.appendChild(paramsCard);

  return wrapper;
}

function renderConverterDetailsTable() {
  const wrapper = document.createElement('div');
  wrapper.id = 'converter-details-wrapper';

  const cat = buildCategoryString();
  const entry = C.converterDetailsLookup ? (C.converterDetailsLookup[cat] ?? null) : null;
  const recon = isReconductoring();
  const oldAcDcEl = document.querySelector('[data-path="01_project_technical_details.project.old_ac_dc"]');
  const oldIsDC = recon && oldAcDcEl && oldAcDcEl.value === 'DC';
  const oldCat = oldIsDC ? buildOldCategoryString() : null;
  const oldEntry = (oldIsDC && oldCat) ? (C.converterDetailsLookup?.[oldCat] ?? null) : null;

  const ctxDisplay = document.createElement('div');
  ctxDisplay.className = 'readonly-miles-display';
  ctxDisplay.id = 'converter-details-context';
  const ctxLabel = document.createElement('span');
  ctxLabel.className = 'readonly-miles-label';
  ctxLabel.textContent = oldIsDC ? 'New:' : 'Configuration:';
  ctxLabel.appendChild(makeHelpIcon('The project configuration key. Converter O&M rate is determined by converter type (LCC or VSC), not by configuration category.'));
  ctxDisplay.appendChild(ctxLabel);
  ctxDisplay.appendChild(document.createTextNode(' '));
  const ctxValue = document.createElement('span');
  ctxValue.className = 'readonly-display-value';
  ctxValue.id = 'converter-details-category-value';
  ctxValue.textContent = cat || '—';
  ctxDisplay.appendChild(ctxValue);
  wrapper.appendChild(ctxDisplay);

  if (oldIsDC) {
    const oldCtxDisplay = document.createElement('div');
    oldCtxDisplay.className = 'readonly-miles-display';
    oldCtxDisplay.id = 'converter-details-old-context';
    const oldCtxLabel = document.createElement('span');
    oldCtxLabel.className = 'readonly-miles-label';
    oldCtxLabel.textContent = 'Old:';
    oldCtxLabel.appendChild(makeHelpIcon('Configuration key for the existing converter being replaced.'));
    oldCtxDisplay.appendChild(oldCtxLabel);
    oldCtxDisplay.appendChild(document.createTextNode(' '));
    const oldCtxValue = document.createElement('span');
    oldCtxValue.className = 'readonly-display-value';
    oldCtxValue.id = 'converter-details-old-category-value';
    oldCtxValue.textContent = oldCat || '—';
    oldCtxDisplay.appendChild(oldCtxValue);
    wrapper.appendChild(oldCtxDisplay);
  }

  const convTypeEl = document.querySelector('[data-path="01_project_technical_details.project.converter_type"]');
  const convCountEl = document.querySelector('[data-path="01_project_technical_details.project.number_of_converters"]');
  const convType = convTypeEl ? convTypeEl.value : '';
  const convLoss = convType === 'LCC Converter' ? '0.75' : convType === 'VSC Converter' ? '1.0' : '—';

  const oldConvTypeEl = document.querySelector('[data-path="01_project_technical_details.project.old_converter_type"]');
  const oldConvType = oldConvTypeEl ? oldConvTypeEl.value : '';
  const oldConvLoss = oldConvType === 'LCC Converter' ? '0.75' : oldConvType === 'VSC Converter' ? '1.0' : '—';

  const ROWS = [
    { label: 'Converter Type', value: convTypeEl ? convTypeEl.value : '—', oldValue: oldConvType || '—', tooltip: 'AC-to-DC converter technology (LCC or VSC).' },
    { label: 'Number of Converters', value: convCountEl ? convCountEl.value : '—', oldValue: convCountEl ? convCountEl.value : '—', tooltip: 'Number of converter stations on the line.' },
    { label: 'Converter Loss (%)', value: convLoss, oldValue: oldConvLoss, tooltip: 'Electrical energy lost in AC/DC conversion. Fixed physical constant: 0.75% for LCC, 1.0% for VSC.' },
    { label: 'O&M Rate (% of CAPEX/yr)', value: entry ? (entry.converter_type === 'VSC Converter' ? '0.7%' : '0.5%') : '—', oldValue: oldEntry ? (oldEntry.converter_type === 'VSC Converter' ? '0.7%' : '0.5%') : '—', tooltip: 'Annual converter O&M as percentage of station capital cost. LCC: 0.5%, VSC: 0.7% (Van Eeckhout et al. 2022, Kim et al. 2012).' },
  ];

  const cvParamsCard = document.createElement('div');
  cvParamsCard.className = 'forge-params-card';

  const cvCardHeader = document.createElement('div');
  cvCardHeader.className = 'card-header';
  cvCardHeader.innerHTML = 'Converter Parameters <span class="badge-readonly">Read-only</span>';
  cvParamsCard.appendChild(cvCardHeader);

  const cvContainer = document.createElement('div');
  cvContainer.className = 'params-container';

  ROWS.forEach(row => {
    const paramRow = document.createElement('div');
    paramRow.className = 'param-row';

    const keySpan = document.createElement('span');
    keySpan.className = 'param-key';
    keySpan.textContent = row.label;
    keySpan.appendChild(makeHelpIcon(row.tooltip));
    paramRow.appendChild(keySpan);

    const valSpan = document.createElement('span');
    valSpan.className = 'param-value';
    valSpan.dataset.converterField = row.label.replace(/\s+/g, '_').toLowerCase();
    valSpan.textContent = row.value || '—';
    paramRow.appendChild(valSpan);

    if (oldIsDC) {
      const oldSpan = document.createElement('span');
      oldSpan.className = 'param-value-old';
      oldSpan.dataset.converterFieldOld = row.label.replace(/\s+/g, '_').toLowerCase();
      oldSpan.textContent = row.oldValue || '—';
      paramRow.appendChild(oldSpan);
    }

    cvContainer.appendChild(paramRow);
  });

  cvParamsCard.appendChild(cvContainer);

  const cvSource = document.createElement('div');
  cvSource.className = 'forge-source';
  cvSource.innerHTML = '<svg width="10" height="10" viewBox="0 0 16 16"><path d="M13 1H3a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V3a2 2 0 00-2-2zM5 4h6v1H5V4zm0 3h6v1H5V7zm0 3h4v1H5v-1z" fill="currentColor"/></svg> NREL Converter Database (2024)';
  cvParamsCard.appendChild(cvSource);

  wrapper.appendChild(cvParamsCard);

  return wrapper;
}

function rebuildStructureDetails() {
  const ctEl = document.querySelector('[data-path="01_project_technical_details.project.construction_type"]');
  const constructionType = ctEl ? ctEl.value : '';
  const entry = C.structureDetailsLookup ? (C.structureDetailsLookup[constructionType] ?? null) : null;

  document.querySelectorAll('[data-structure-field]').forEach(cell => {
    const key = cell.dataset.structureField;
    if (!entry || entry[key] == null) { cell.textContent = '—'; return; }
    if (key === 'cost_per_structure_per_year') {
      cell.textContent = '$' + Number(entry[key]).toLocaleString();
    } else {
      cell.textContent = entry[key];
    }
  });

  const ctxVal = document.getElementById('structure-details-construction-value');
  if (ctxVal) ctxVal.textContent = constructionType || '—';
}

function rebuildConverterDetails() {
  const existingWrapper = document.getElementById('converter-details-wrapper');
  if (existingWrapper) {
    const parent = existingWrapper.parentNode;
    const newWrapper = renderConverterDetailsTable();
    parent.replaceChild(newWrapper, existingWrapper);
  }
}

function renderConductorMaintenanceTable() {
  const wrapper = document.createElement('div');
  wrapper.id = 'conductor-maintenance-wrapper';
  const cat = buildCategoryString();
  const entry = C.conductorOmLookup ? (C.conductorOmLookup[cat] ?? null) : null;

  const table = document.createElement('table');
  table.className = 'forge-table capital-cost-table conductor-maintenance-table';
  const cmCaption = document.createElement('caption');
  cmCaption.textContent = 'Conductor Maintenance Costs';
  cmCaption.appendChild(makeHelpIcon('Annual per-mile maintenance cost for conductor from the NREL/DOE database.'));
  table.appendChild(cmCaption);
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  const thParam = document.createElement('th');
  thParam.textContent = 'Parameter';
  thParam.appendChild(makeHelpIcon('Conductor O&M cost from the NREL/DOE database, determined by project configuration.'));
  headerRow.appendChild(thParam);
  const thValue = document.createElement('th');
  thValue.textContent = 'Value ($/mi/yr)';
  thValue.appendChild(makeHelpIcon('Annual conductor maintenance cost per mile. Click the lock icon to override.'));
  headerRow.appendChild(thValue);
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  const tr = document.createElement('tr');
  const tdLabel = document.createElement('td');
  tdLabel.textContent = 'Variable Cost per Mile per Year';
  tdLabel.style.fontWeight = '500';
  tr.appendChild(tdLabel);
  const tdVal = document.createElement('td');
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'currency-input locked-cell';
  input.dataset.maintenanceField = 'conductor_om';
  input.readOnly = true;
  input.value = entry ? '$' + Number(entry.variable_cost_per_mile_year).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '\u2014';
  tdVal.appendChild(input);
  tr.appendChild(tdVal);
  tbody.appendChild(tr);
  table.appendChild(tbody);
  const cmCard = document.createElement('div');
  cmCard.className = 'forge-table-card';
  const cmCardHeader = document.createElement('div');
  cmCardHeader.className = 'card-header';
  cmCardHeader.textContent = 'Conductor Maintenance ';
  const cmLockPill = document.createElement('span');
  cmLockPill.className = 'lock-pill';
  cmLockPill.innerHTML = LOCK_SVG + ' Locked \u2014 click to override';
  cmCardHeader.appendChild(cmLockPill);
  cmCard.appendChild(cmCardHeader);
  cmCard.appendChild(table);
  const cmSource = document.createElement('div');
  cmSource.className = 'forge-source';
  cmSource.innerHTML = SOURCE_ICON_SVG + ' Industry O&amp;M benchmarks';
  cmCard.appendChild(cmSource);
  wrapper.appendChild(cmCard);

  let locked = true;
  cmLockPill.addEventListener('click', () => {
    if (!locked) {
      locked = true;
      input.readOnly = true;
      input.classList.add('locked-cell');
      cmLockPill.className = 'lock-pill';
      cmLockPill.innerHTML = LOCK_SVG + ' Locked \u2014 click to override';
    } else {
      showBuildCostConfirmDialog('conductor-maintenance', (suppress) => {
        locked = false;
        input.readOnly = false;
        input.classList.remove('locked-cell');
        cmLockPill.className = 'lock-pill lock-pill--unlocked';
        cmLockPill.innerHTML = UNLOCK_SVG + ' Unlocked \u2014 editing';
      });
    }
  });

  return wrapper;
}

function rebuildConductorMaintenance() {
  const existing = document.getElementById('conductor-maintenance-wrapper');
  if (existing) {
    const parent = existing.parentNode;
    parent.replaceChild(renderConductorMaintenanceTable(), existing);
  }
}

function renderStructureMaintenanceTable() {
  const wrapper = document.createElement('div');
  wrapper.id = 'structure-maintenance-wrapper';
  const ctEl = document.querySelector('[data-path="01_project_technical_details.project.construction_type"]');
  const constructionType = ctEl ? ctEl.value : '';
  const entry = C.structureDetailsLookup ? (C.structureDetailsLookup[constructionType] ?? null) : null;

  const table = document.createElement('table');
  table.className = 'forge-table capital-cost-table structure-maintenance-table';
  const smCaption = document.createElement('caption');
  smCaption.textContent = 'Structure Maintenance Costs';
  smCaption.appendChild(makeHelpIcon('Annual per-structure maintenance cost by terrain from the NREL/DOE database.'));
  table.appendChild(smCaption);
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  const thParam = document.createElement('th');
  thParam.textContent = 'Parameter';
  thParam.appendChild(makeHelpIcon('Maintenance cost parameter'));
  headerRow.appendChild(thParam);
  const thTerrain = document.createElement('th');
  thTerrain.textContent = 'Terrain';
  thTerrain.appendChild(makeHelpIcon('Terrain type along the route'));
  headerRow.appendChild(thTerrain);
  const thValue = document.createElement('th');
  thValue.textContent = 'Value';
  thValue.appendChild(makeHelpIcon('Structure density and unit cost from the NREL/DOE database. Click the lock icon to override.'));
  headerRow.appendChild(thValue);
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const TERRAINS = ['forested', 'scrubbed_flat', 'wetland', 'farmland', 'desert_barren', 'urban', 'rolling_hills', 'mountain'];
  const TERRAIN_LABELS = {forested:'Forested', scrubbed_flat:'Scrubbed Flat', wetland:'Wetland', farmland:'Farmland', desert_barren:'Desert/Barren', urban:'Urban', rolling_hills:'Rolling Hills', mountain:'Mountain'};

  const tbody = document.createElement('tbody');
  const inputs = [];
  TERRAINS.forEach((t, i) => {
    const tr = document.createElement('tr');
    const tdParam = document.createElement('td');
    tdParam.textContent = i === 0 ? 'Structures per Mile' : '';
    tdParam.style.fontWeight = '500';
    tr.appendChild(tdParam);
    const tdTerrain = document.createElement('td');
    tdTerrain.textContent = TERRAIN_LABELS[t] || t;
    tr.appendChild(tdTerrain);
    const tdVal = document.createElement('td');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'currency-input locked-cell';
    input.dataset.maintenanceField = 'structure_density_' + t;
    input.readOnly = true;
    input.value = entry ? String(entry['structures_per_mile_' + t] ?? 0) : '\u2014';
    inputs.push(input);
    tdVal.appendChild(input);
    tr.appendChild(tdVal);
    tbody.appendChild(tr);
  });

  const costTr = document.createElement('tr');
  const costParamTd = document.createElement('td');
  costParamTd.textContent = 'Cost per Structure ($/yr)';
  costParamTd.style.fontWeight = '500';
  costTr.appendChild(costParamTd);
  const costTerrainTd = document.createElement('td');
  costTerrainTd.textContent = '(all terrains)';
  costTr.appendChild(costTerrainTd);
  const costValTd = document.createElement('td');
  const costInput = document.createElement('input');
  costInput.type = 'text';
  costInput.className = 'currency-input locked-cell';
  costInput.dataset.maintenanceField = 'structure_cost_per_year';
  costInput.readOnly = true;
  costInput.value = entry ? '$' + Number(entry.cost_per_structure_per_year).toLocaleString() : '\u2014';
  inputs.push(costInput);
  costValTd.appendChild(costInput);
  costTr.appendChild(costValTd);
  tbody.appendChild(costTr);
  table.appendChild(tbody);

  const smCard = document.createElement('div');
  smCard.className = 'forge-table-card';
  const smCardHeader = document.createElement('div');
  smCardHeader.className = 'card-header';
  smCardHeader.textContent = 'Structure Maintenance ';
  const smLockPill = document.createElement('span');
  smLockPill.className = 'lock-pill';
  smLockPill.innerHTML = LOCK_SVG + ' Locked \u2014 click to override';
  smCardHeader.appendChild(smLockPill);
  smCard.appendChild(smCardHeader);
  smCard.appendChild(table);
  const smSource = document.createElement('div');
  smSource.className = 'forge-source';
  smSource.innerHTML = SOURCE_ICON_SVG + ' Industry O&amp;M benchmarks';
  smCard.appendChild(smSource);
  wrapper.appendChild(smCard);

  let locked = true;
  smLockPill.addEventListener('click', () => {
    if (!locked) {
      locked = true;
      inputs.forEach(inp => { inp.readOnly = true; inp.classList.add('locked-cell'); });
      smLockPill.className = 'lock-pill';
      smLockPill.innerHTML = LOCK_SVG + ' Locked \u2014 click to override';
    } else {
      showBuildCostConfirmDialog('structure-maintenance', (suppress) => {
        locked = false;
        inputs.forEach(inp => { inp.readOnly = false; inp.classList.remove('locked-cell'); });
        smLockPill.className = 'lock-pill lock-pill--unlocked';
        smLockPill.innerHTML = UNLOCK_SVG + ' Unlocked \u2014 editing';
      });
    }
  });

  return wrapper;
}

function rebuildStructureMaintenance() {
  const existing = document.getElementById('structure-maintenance-wrapper');
  if (existing) {
    const parent = existing.parentNode;
    parent.replaceChild(renderStructureMaintenanceTable(), existing);
  }
}

function renderConverterMaintenanceTable() {
  const wrapper = document.createElement('div');
  wrapper.id = 'converter-maintenance-wrapper';
  const cat = buildCategoryString();
  const entry = C.converterDetailsLookup ? (C.converterDetailsLookup[cat] ?? null) : null;

  const table = document.createElement('table');
  table.className = 'forge-table capital-cost-table converter-maintenance-table';
  const cvmCaption = document.createElement('caption');
  cvmCaption.textContent = 'Converter Maintenance Costs';
  cvmCaption.appendChild(makeHelpIcon('Annual converter O&M cost from the NREL/DOE database.'));
  table.appendChild(cvmCaption);
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  const thParam = document.createElement('th');
  thParam.textContent = 'Parameter';
  thParam.appendChild(makeHelpIcon('Converter O&M cost from the NREL/DOE database, determined by project configuration.'));
  headerRow.appendChild(thParam);
  const thValue = document.createElement('th');
  thValue.textContent = 'Value ($/mi/yr)';
  thValue.appendChild(makeHelpIcon('Annual converter maintenance cost per mile. Click the lock icon to override.'));
  headerRow.appendChild(thValue);
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  const tr = document.createElement('tr');
  const tdLabel = document.createElement('td');
  tdLabel.textContent = 'Annual Converter O&M (% of Station CAPEX)';
  tdLabel.style.fontWeight = '500';
  tr.appendChild(tdLabel);
  const tdVal = document.createElement('td');
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'currency-input locked-cell';
  input.dataset.maintenanceField = 'converter_om';
  input.readOnly = true;
  input.value = entry ? (entry.converter_type === 'VSC Converter' ? '0.7%' : '0.5%') : '\u2014';
  tdVal.appendChild(input);
  tr.appendChild(tdVal);
  tbody.appendChild(tr);
  table.appendChild(tbody);
  const cvmCard = document.createElement('div');
  cvmCard.className = 'forge-table-card';
  const cvmCardHeader = document.createElement('div');
  cvmCardHeader.className = 'card-header';
  cvmCardHeader.textContent = 'Converter Maintenance ';
  const cvmLockPill = document.createElement('span');
  cvmLockPill.className = 'lock-pill';
  cvmLockPill.innerHTML = LOCK_SVG + ' Locked \u2014 click to override';
  cvmCardHeader.appendChild(cvmLockPill);
  cvmCard.appendChild(cvmCardHeader);
  cvmCard.appendChild(table);
  const cvmSource = document.createElement('div');
  cvmSource.className = 'forge-source';
  cvmSource.innerHTML = SOURCE_ICON_SVG + ' Industry O&amp;M benchmarks';
  cvmCard.appendChild(cvmSource);
  wrapper.appendChild(cvmCard);

  let locked = true;
  cvmLockPill.addEventListener('click', () => {
    if (!locked) {
      locked = true;
      input.readOnly = true;
      input.classList.add('locked-cell');
      cvmLockPill.className = 'lock-pill';
      cvmLockPill.innerHTML = LOCK_SVG + ' Locked \u2014 click to override';
    } else {
      showBuildCostConfirmDialog('converter-maintenance', (suppress) => {
        locked = false;
        input.readOnly = false;
        input.classList.remove('locked-cell');
        cvmLockPill.className = 'lock-pill lock-pill--unlocked';
        cvmLockPill.innerHTML = UNLOCK_SVG + ' Unlocked \u2014 editing';
      });
    }
  });

  return wrapper;
}

function rebuildConverterMaintenance() {
  const existing = document.getElementById('converter-maintenance-wrapper');
  if (existing) {
    const parent = existing.parentNode;
    parent.replaceChild(renderConverterMaintenanceTable(), existing);
  }
}

function renderInsurableAssetsTable(data) {
  const wrapper = document.createElement('div');
  wrapper.id = 'insurable-assets-wrapper';
  const premiumDiv = document.createElement('div');
  premiumDiv.className = 'env-uplift-row';
  const premiumPath = '04_insurance.insurance.premium_rate';
  const premiumVal = getValueAtFieldPath(data, '04_insurance', 'insurance.premium_rate') ?? 0.002;
  premiumDiv.innerHTML = '<span class="env-uplift-label">Premium Rate</span> ';
  premiumDiv.appendChild(makeHelpIcon('Annual insurance premium as % of insurable value. Applied to total insurable asset value.'));
  const premiumInput = document.createElement('input');
  premiumInput.type = 'text';
  premiumInput.className = 'number-input env-uplift-input';
  premiumInput.dataset.path = premiumPath;
  const pn = Number(premiumVal);
  premiumInput.value = (!isNaN(pn) && premiumVal !== null) ? pn.toLocaleString('en-US', {maximumFractionDigits: 10}) : '';
  premiumInput.addEventListener('focus', () => { premiumInput.value = premiumInput.value.replace(/,/g, ''); });
  premiumInput.addEventListener('blur', () => {
    const raw = parseFloat(premiumInput.value.replace(/,/g, ''));
    if (!isNaN(raw)) premiumInput.value = raw.toLocaleString('en-US', {maximumFractionDigits: 10});
  });
  premiumDiv.appendChild(premiumInput);
  wrapper.appendChild(premiumDiv);

  const table = document.createElement('table');
  table.className = 'forge-table conductor-details-table';
  const insCaption = document.createElement('caption');
  insCaption.textContent = 'Insurable Assets';
  insCaption.appendChild(makeHelpIcon('Capital cost components eligible for operational insurance. Annual premium = total insured value \u00d7 premium rate.'));
  table.appendChild(insCaption);
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  const INS_HEADER_TOOLTIPS = {
    'Included': 'Check to include this component in the insured value',
    'Value (with contingency)': 'Nominal capital cost including contingency from Capital Costs',
  };
  ['Insurable Asset', 'Included', 'Value (with contingency)'].forEach(txt => {
    const th = document.createElement('th');
    th.textContent = txt;
    if (INS_HEADER_TOOLTIPS[txt]) th.appendChild(makeHelpIcon(INS_HEADER_TOOLTIPS[txt]));
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const ASSETS = [
    {label: 'Conductors', togglePath: '04_insurance.insurance.insurable_components.conductors'},
    {label: 'Structures', togglePath: '04_insurance.insurance.insurable_components.structures'},
    {label: 'Converters', togglePath: '04_insurance.insurance.insurable_components.converters'},
  ];

  const tbody = document.createElement('tbody');
  ASSETS.forEach(asset => {
    const tr = document.createElement('tr');
    const tdName = document.createElement('td');
    tdName.textContent = asset.label;
    tdName.appendChild(makeHelpIcon('Insurable asset value derived from Capital Costs (with contingencies).'));
    tr.appendChild(tdName);
    const tdIncl = document.createElement('td');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    const savedVal = getValueAtFieldPath(data, '04_insurance', `insurance.insurable_components.${asset.label.toLowerCase()}`);
    cb.checked = savedVal !== false && savedVal !== 0;
    cb.dataset.path = asset.togglePath;
    cb.dataset.insurableToggle = asset.label.toLowerCase();
    tdIncl.appendChild(cb);
    tr.appendChild(tdIncl);
    const tdVal = document.createElement('td');
    tdVal.textContent = '\u2014';
    tdVal.dataset.insurableValue = asset.label.toLowerCase();
    tr.appendChild(tdVal);
    tbody.appendChild(tr);
  });

  const totalTr = document.createElement('tr');
  totalTr.style.fontWeight = '600';
  const totalLabelTd = document.createElement('td');
  totalLabelTd.textContent = 'Total Insurable Value';
  totalTr.appendChild(totalLabelTd);
  const totalInclTd = document.createElement('td');
  totalTr.appendChild(totalInclTd);
  const totalValTd = document.createElement('td');
  totalValTd.textContent = '\u2014';
  totalValTd.id = 'insurable-total-value';
  totalValTd.dataset.insurableValue = 'total';
  totalTr.appendChild(totalValTd);
  tbody.appendChild(totalTr);
  table.appendChild(tbody);

  const insTableCard = document.createElement('div');
  insTableCard.className = 'forge-table-card';
  insTableCard.appendChild(table);

  const insSource = document.createElement('div');
  insSource.className = 'forge-source';
  insSource.innerHTML = '<svg width="10" height="10" viewBox="0 0 16 16"><path d="M13 1H3a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V3a2 2 0 00-2-2zM5 4h6v1H5V4zm0 3h6v1H5V7zm0 3h4v1H5v-1z" fill="currentColor"/></svg> Industry benchmark rates';
  insTableCard.appendChild(insSource);

  wrapper.appendChild(insTableCard);

  const premiumDisplay = document.createElement('div');
  premiumDisplay.className = 'readonly-miles-display';
  premiumDisplay.style.marginTop = '0.5rem';
  const premLabel = document.createElement('span');
  premLabel.className = 'readonly-miles-label';
  premLabel.textContent = 'Annual Premium:';
  premLabel.appendChild(makeHelpIcon('Annual insurance premium = total insured value \u00d7 premium rate.'));
  premiumDisplay.appendChild(premLabel);
  premiumDisplay.appendChild(document.createTextNode(' '));
  const premValue = document.createElement('span');
  premValue.className = 'readonly-display-value';
  premValue.id = 'insurance-annual-premium';
  premValue.dataset.insurableValue = 'annual-premium';
  premValue.textContent = '\u2014';
  premiumDisplay.appendChild(premValue);
  wrapper.appendChild(premiumDisplay);

  const footnote = document.createElement('div');
  footnote.className = 'conductor-details-footnote';
  footnote.textContent = 'Asset values derived from Capital Costs (with contingencies). Values populate after running a calculation.';
  wrapper.appendChild(footnote);

  function recalcInsurance() {
    const rate = parseFloat(premiumInput.value.replace(/,/g, '')) || 0;
    let total = 0;
    wrapper.querySelectorAll('[data-insurable-toggle]').forEach(cb => {
      if (cb.checked) {
        const valEl = wrapper.querySelector(`[data-insurable-value="${cb.dataset.insurableToggle}"]`);
        const raw = valEl?.textContent?.replace(/[$,\u2014]/g, '');
        const num = parseFloat(raw);
        if (!isNaN(num)) total += num;
      }
    });
    const totalEl = wrapper.querySelector('[data-insurable-value="total"]');
    if (totalEl) totalEl.textContent = total > 0 ? '$' + total.toLocaleString() : '\u2014';
    const annualEl = wrapper.querySelector('[data-insurable-value="annual-premium"]');
    if (annualEl) annualEl.textContent = total > 0 ? '$' + Math.round(total * rate).toLocaleString() : '\u2014';
  }
  wrapper.querySelectorAll('[data-insurable-toggle]').forEach(cb => {
    cb.addEventListener('change', recalcInsurance);
  });
  premiumInput.addEventListener('blur', recalcInsurance);

  return wrapper;
}

function renderVegetationManagementTable() {
  const wrapper = document.createElement('div');
  wrapper.id = 'vegetation-management-wrapper';

  const ctEl = document.querySelector('[data-path="01_project_technical_details.project.construction_type"]');
  const constructionType = ctEl ? ctEl.value : '';
  const entry = C.vegetationManagementLookup ? (C.vegetationManagementLookup[constructionType] ?? null) : null;

  const ctxDisplay = document.createElement('div');
  ctxDisplay.className = 'readonly-miles-display';
  ctxDisplay.id = 'veg-mgmt-context';
  const ctxLabel = document.createElement('span');
  ctxLabel.className = 'readonly-miles-label';
  ctxLabel.textContent = 'Construction Type:';
  ctxLabel.appendChild(makeHelpIcon('Vegetation management costs apply to the selected construction type.'));
  ctxDisplay.appendChild(ctxLabel);
  ctxDisplay.appendChild(document.createTextNode(' '));
  const ctxValue = document.createElement('span');
  ctxValue.className = 'readonly-display-value';
  ctxValue.id = 'veg-mgmt-context-value';
  ctxValue.textContent = constructionType || '\u2014';
  ctxDisplay.appendChild(ctxValue);
  wrapper.appendChild(ctxDisplay);

  const TERRAINS = ['forested', 'scrubbed_flat', 'wetland', 'farmland', 'desert_barren', 'urban', 'rolling_hills', 'mountain', 'subsea'];
  const TERRAIN_LABELS = {forested:'Forested', scrubbed_flat:'Scrubbed Flat', wetland:'Wetland', farmland:'Farmland', desert_barren:'Desert/Barren', urban:'Urban', rolling_hills:'Rolling Hills', mountain:'Mountain', subsea:'Subsea'};

  const table = document.createElement('table');
  table.className = 'forge-table capital-cost-table veg-mgmt-table';
  const vmCaption = document.createElement('caption');
  vmCaption.textContent = 'Vegetation Management Costs';
  vmCaption.appendChild(makeHelpIcon('Annual per-mile vegetation management cost by terrain from the NREL/DOE database.'));
  table.appendChild(vmCaption);
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  const thTerrain = document.createElement('th');
  thTerrain.textContent = 'Terrain';
  thTerrain.appendChild(makeHelpIcon('Terrain type along the route'));
  headerRow.appendChild(thTerrain);
  const thValue = document.createElement('th');
  thValue.textContent = 'Cost ($/mile/year)';
  thValue.appendChild(makeHelpIcon('Annual vegetation management cost per mile per terrain. Click the lock icon to override.'));
  headerRow.appendChild(thValue);
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const inputs = [];
  let locked = true;
  const tbody = document.createElement('tbody');
  TERRAINS.forEach(t => {
    const tr = document.createElement('tr');
    const tdTerrain = document.createElement('td');
    tdTerrain.textContent = TERRAIN_LABELS[t] || t;
    tr.appendChild(tdTerrain);
    const tdVal = document.createElement('td');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'currency-input locked-cell';
    input.dataset.vegTerrain = t;
    input.readOnly = true;
    const val = entry ? entry[t] : null;
    input.value = val != null ? '$' + Number(val).toLocaleString() : '\u2014';
    inputs.push(input);
    tdVal.appendChild(input);
    tr.appendChild(tdVal);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  const vmCard = document.createElement('div');
  vmCard.className = 'forge-table-card';
  const vmCardHeader = document.createElement('div');
  vmCardHeader.className = 'card-header';
  vmCardHeader.textContent = 'Vegetation Management ';
  const vmLockPill = document.createElement('span');
  vmLockPill.className = 'lock-pill';
  vmLockPill.innerHTML = LOCK_SVG + ' Locked \u2014 click to override';
  vmCardHeader.appendChild(vmLockPill);
  vmCard.appendChild(vmCardHeader);
  vmCard.appendChild(table);
  const vmSource = document.createElement('div');
  vmSource.className = 'forge-source';
  vmSource.innerHTML = SOURCE_ICON_SVG + ' Utility vegetation management cost surveys';
  vmCard.appendChild(vmSource);
  wrapper.appendChild(vmCard);

  vmLockPill.addEventListener('click', () => {
    if (!locked) {
      locked = true;
      inputs.forEach(inp => { inp.readOnly = true; inp.classList.add('locked-cell'); });
      vmLockPill.className = 'lock-pill';
      vmLockPill.innerHTML = LOCK_SVG + ' Locked \u2014 click to override';
    } else {
      showBuildCostConfirmDialog('vegetation-management', (suppress) => {
        locked = false;
        inputs.forEach(inp => { inp.readOnly = false; inp.classList.remove('locked-cell'); });
        vmLockPill.className = 'lock-pill lock-pill--unlocked';
        vmLockPill.innerHTML = UNLOCK_SVG + ' Unlocked \u2014 editing';
      });
    }
  });

  return wrapper;
}

function rebuildVegetationManagement() {
  const existing = document.getElementById('vegetation-management-wrapper');
  if (existing) {
    const parent = existing.parentNode;
    parent.replaceChild(renderVegetationManagementTable(), existing);
  }
}

function updateMaintenanceSubTabVisibility() {
  const ctEl = document.querySelector('[data-path="01_project_technical_details.project.construction_type"]');
  const acDcEl = document.querySelector('[data-path="01_project_technical_details.project.ac_dc"]');
  const ct = ctEl ? ctEl.value : '';
  const acDc = acDcEl ? acDcEl.value : '';
  const wrapper = document.querySelector('[data-sub-tab="maintenance-costs"]');
  if (!wrapper) return;
  const buttons = wrapper.querySelectorAll('.l4-tab');
  const panels = wrapper.querySelectorAll('.sub-sub-tab-content');
  const visibility = {'conductor-maintenance': true, 'structure-maintenance': ct === 'Overhead', 'converter-maintenance': acDc === 'DC'};
  let activeHidden = false;
  buttons.forEach((btn, i) => {
    const id = panels[i] ? panels[i].dataset.subSubTab : '';
    const show = visibility[id] !== false;
    btn.style.display = show ? '' : 'none';
    if (!show && btn.classList.contains('active')) activeHidden = true;
  });
  panels.forEach(p => { if (visibility[p.dataset.subSubTab] === false) p.style.display = 'none'; });
  if (activeHidden && buttons[0]) buttons[0].click();
}

C.FUEL_SOURCES = ['coal', 'oil', 'natural_gas', 'solar', 'wind', 'hydro', 'nuclear', 'other'];

C.FUEL_LABELS = {coal:'Coal', oil:'Oil', natural_gas:'Natural Gas', solar:'Solar', wind:'Wind', hydro:'Hydro', nuclear:'Nuclear', other:'Other'};

function renderEnergyMixTable(data) {
  const wrapper = document.createElement('div');
  wrapper.id = 'energy-mix-wrapper';
  const MIX_HEADER_TOOLTIPS = {
    'Initial Grid Mix (%)': 'Year-0 share of each fuel source in the regional grid (must sum to 100%).',
    'Pre-COD Growth Rates': 'Annual growth/decline in each source\u2019s share without the line (decimal rate; e.g. -3% = -0.03).',
    'Post-COD Growth Rates': 'Annual growth/decline in each source\u2019s share with the line\u2019s influence (decimal rate; e.g. -3% = -0.03).',
  };
  const table = document.createElement('table');
  table.className = 'forge-table forge-table--compact forge-table--editable conductor-details-table energy-mix-table';
  const emCaption = document.createElement('caption');
  emCaption.textContent = 'Grid Mix';
  emCaption.appendChild(makeHelpIcon('Single-trajectory regional grid: one initial mix, two rate regimes (pre-COD without the line, post-COD with the line). Used for displacement and emissions calculations.'));
  table.appendChild(emCaption);
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  ['Fuel Source', 'Initial Grid Mix (%)', 'Pre-COD Growth Rates', 'Post-COD Growth Rates'].forEach(txt => {
    const th = document.createElement('th');
    th.textContent = txt;
    if (MIX_HEADER_TOOLTIPS[txt]) th.appendChild(makeHelpIcon(MIX_HEADER_TOOLTIPS[txt]));
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  C.FUEL_SOURCES.forEach(fuel => {
    const tr = document.createElement('tr');
    const tdFuel = document.createElement('td');
    tdFuel.textContent = C.FUEL_LABELS[fuel] || fuel;
    tdFuel.style.fontWeight = '500';
    tr.appendChild(tdFuel);

    const fields = [
      {group: 'initial', type: 'pct'},
      {group: 'rate_pre_cod', type: 'rate'},
      {group: 'rate_post_cod', type: 'rate'},
    ];
    fields.forEach(f => {
      const td = document.createElement('td');
      const path = `18_energy_source_mix.grid_mix.${f.group}.${fuel}`;
      const fieldPath = `grid_mix.${f.group}.${fuel}`;
      const val = getValueAtFieldPath(data, '18_energy_source_mix', fieldPath);
      const input = document.createElement('input');
      input.type = 'text';
      input.dataset.path = path;
      if (f.type === 'pct') {
        input.className = 'number-input';
        const n = Number(val);
        input.value = (val != null && !isNaN(n))
          ? n.toLocaleString('en-US', {maximumFractionDigits: 10}) : '';
      } else {
        input.className = 'percentage-input number-input';
        input.value = (val != null) ? formatPercentageInput(val) : '';
      }
      input.addEventListener('focus', () => { input.value = input.value.replace(/,/g, ''); });
      input.addEventListener('blur', () => {
        if (f.type === 'pct') {
          const raw = parseFloat(input.value.replace(/,/g, ''));
          if (!isNaN(raw)) input.value = raw.toLocaleString('en-US', {maximumFractionDigits: 10});
        } else {
          const raw = parsePercentageInput(input.value);
          if (raw != null) input.value = formatPercentageInput(raw);
        }
      });
      td.appendChild(input);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrapper.appendChild(table);

  const footnote = document.createElement('div');
  footnote.className = 'conductor-details-footnote';
  footnote.textContent = 'Initial shares should sum to 100%. Growth rates are decimal annual changes (displayed as %); mix is renormalized each year.';
  wrapper.appendChild(footnote);
  return wrapper;
}

function renderLineLossParametersTable() {
  const wrapper = document.createElement('div');
  wrapper.id = 'line-loss-params-wrapper';
  wrapper.style.marginTop = '1.5rem';

  const entry = getCircuitDetailsEntry();
  const recon = isReconductoring();
  const oldEntry = recon ? (function() {
    const oldCat = buildOldCategoryString();
    return (oldCat && C.circuitDetailsLookup) ? (C.circuitDetailsLookup[oldCat] ?? null) : null;
  })() : null;

  const ROWS = [
    { key: 'AC_75_resistance', label: 'AC 75\u00B0C Resistance (\u03A9/mi)', format: v => v != null ? v : '\u2014', tooltip: 'AC resistance at 75\u00B0C. Input to conductor line loss calculation.' },
    { key: 'DC_20_resistance', label: 'DC 20\u00B0C Resistance (\u03A9/mi)', format: v => v != null ? v : '\u2014', tooltip: 'DC resistance at 20\u00B0C. Input to conductor line loss calculation.' },
    { key: 'voltage_kv', label: 'Voltage (kV)', format: v => v != null ? v : '\u2014', tooltip: 'Operating voltage. Affects power flow and loss calculations.' },
  ];

  const table = document.createElement('table');
  table.className = 'forge-table conductor-details-table';
  const llCaption = document.createElement('caption');
  llCaption.textContent = 'Line Loss Parameters';
  llCaption.appendChild(makeHelpIcon('Electrical parameters from the NREL/DOE database that determine resistive line losses.'));
  table.appendChild(llCaption);
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  const thParam = document.createElement('th');
  thParam.textContent = 'Parameter';
  headerRow.appendChild(thParam);
  const thValue = document.createElement('th');
  thValue.textContent = recon ? 'New Value' : 'Value';
  headerRow.appendChild(thValue);
  if (recon) {
    const thOld = document.createElement('th');
    thOld.textContent = 'Old Value';
    thOld.appendChild(makeHelpIcon('Value for the existing line being reconductored'));
    headerRow.appendChild(thOld);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  ROWS.forEach(row => {
    const tr = document.createElement('tr');
    const tdLabel = document.createElement('td');
    tdLabel.textContent = row.label;
    tdLabel.appendChild(makeHelpIcon(row.tooltip));
    tr.appendChild(tdLabel);
    const tdVal = document.createElement('td');
    tdVal.textContent = entry ? row.format(entry[row.key]) : '\u2014';
    tr.appendChild(tdVal);
    if (recon) {
      const tdOld = document.createElement('td');
      tdOld.textContent = oldEntry ? row.format(oldEntry[row.key]) : '\u2014';
      tr.appendChild(tdOld);
    }
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrapper.appendChild(table);

  const footnote = document.createElement('div');
  footnote.className = 'conductor-details-footnote';
  footnote.textContent = recon
    ? 'Loss-relevant circuit parameters. New vs existing line values from the NREL/DOE database.'
    : 'Loss-relevant circuit parameters from the NREL/DOE database. These drive the conductor and converter loss calculations.';
  wrapper.appendChild(footnote);
  return wrapper;
}

function rebuildLineLossParameters() {
  const existing = document.getElementById('line-loss-params-wrapper');
  if (existing) {
    const parent = existing.parentNode;
    parent.replaceChild(renderLineLossParametersTable(), existing);
  }
}

function renderLossesPanel(data) {
  const wrapper = document.createElement('div');
  wrapper.id = 'losses-panel-wrapper';

  const compDiv = document.createElement('div');
  compDiv.className = 'env-uplift-row';
  const compPath = '16_emissions_reductions.emissions_reductions.compensation_percent';
  const compVal = getValueAtFieldPath(data, '16_emissions_reductions', 'emissions_reductions.compensation_percent') ?? 0.9;
  compDiv.innerHTML = '<span class="env-uplift-label">Loss Compensation Rate (\u03B1)</span> ';
  compDiv.appendChild(makeHelpIcon('Fraction of line losses compensated by generation. Applied to conductor and converter loss calculations.'));
  const compInput = document.createElement('input');
  compInput.type = 'text';
  compInput.className = 'number-input env-uplift-input';
  compInput.dataset.path = compPath;
  const cn = Number(compVal);
  compInput.value = (!isNaN(cn) && compVal !== null) ? cn.toLocaleString('en-US', {maximumFractionDigits: 10}) : '';
  compInput.addEventListener('focus', () => { compInput.value = compInput.value.replace(/,/g, ''); });
  compInput.addEventListener('blur', () => {
    const raw = parseFloat(compInput.value.replace(/,/g, ''));
    if (!isNaN(raw)) compInput.value = raw.toLocaleString('en-US', {maximumFractionDigits: 10});
  });
  compDiv.appendChild(compInput);
  wrapper.appendChild(compDiv);

  wrapper.appendChild(renderLineLossParametersTable());
  return wrapper;
}

function renderIntensityTable(data) {
  const wrapper = document.createElement('div');
  wrapper.id = 'intensity-table-wrapper';
  const INT_HEADER_TOOLTIPS = {
    'CO\u2082 (kg/MWh)': 'Carbon dioxide emission intensity',
    'SO\u2093 (kg/MWh)': 'Sulfur oxide emission intensity',
    'NO\u2093 (kg/MWh)': 'Nitrogen oxide emission intensity',
  };
  const intTable = document.createElement('table');
  intTable.className = 'forge-table forge-table--compact conductor-details-table';
  const intCaption = document.createElement('caption');
  intCaption.textContent = 'Emission Intensities';
  intCaption.appendChild(makeHelpIcon('Pollutant emission rates by fuel source in kg per MWh of generation.'));
  intTable.appendChild(intCaption);
  const intThead = document.createElement('thead');
  const intHeaderRow = document.createElement('tr');
  ['Fuel Source', 'CO\u2082 (kg/MWh)', 'SO\u2093 (kg/MWh)', 'NO\u2093 (kg/MWh)'].forEach(txt => {
    const th = document.createElement('th');
    th.textContent = txt;
    if (INT_HEADER_TOOLTIPS[txt]) th.appendChild(makeHelpIcon(INT_HEADER_TOOLTIPS[txt]));
    intHeaderRow.appendChild(th);
  });
  intThead.appendChild(intHeaderRow);
  intTable.appendChild(intThead);

  const POLLUTANT_KEYS = ['co2', 'sox', 'nox'];
  const intTbody = document.createElement('tbody');
  C.FUEL_SOURCES.forEach(fuel => {
    const tr = document.createElement('tr');
    const tdFuel = document.createElement('td');
    tdFuel.textContent = C.FUEL_LABELS[fuel] || fuel;
    tdFuel.style.fontWeight = '500';
    tr.appendChild(tdFuel);
    POLLUTANT_KEYS.forEach(pk => {
      const td = document.createElement('td');
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'number-input';
      input.dataset.path = `16_emissions_reductions.emissions_reductions.emission_intensities.${pk}_intensity_kg_per_mwh.${fuel}`;
      const val = getValueAtFieldPath(data, '16_emissions_reductions', `emissions_reductions.emission_intensities.${pk}_intensity_kg_per_mwh.${fuel}`);
      input.value = val != null ? String(val) : '0';
      input.addEventListener('focus', () => { input.value = input.value.replace(/,/g, ''); });
      input.addEventListener('blur', () => {
        const raw = parseFloat(input.value.replace(/,/g, ''));
        if (!isNaN(raw)) input.value = raw.toLocaleString('en-US', {maximumFractionDigits: 10});
      });
      td.appendChild(input);
      tr.appendChild(td);
    });
    intTbody.appendChild(tr);
  });
  intTable.appendChild(intTbody);
  wrapper.appendChild(intTable);
  return wrapper;
}

function renderExternalityCostTable(data) {
  const wrapper = document.createElement('div');
  wrapper.id = 'externality-cost-wrapper';
  const extTable = document.createElement('table');
  extTable.className = 'forge-table conductor-details-table';
  const extCaption = document.createElement('caption');
  extCaption.textContent = 'Externality Costs';
  extCaption.appendChild(makeHelpIcon('Social cost of each pollutant used to monetize avoided emissions.'));
  extTable.appendChild(extCaption);
  const extThead = document.createElement('thead');
  const extHeaderRow = document.createElement('tr');
  ['Pollutant', 'Externality ($/kg)'].forEach(txt => {
    const th = document.createElement('th');
    th.textContent = txt;
    if (txt === 'Externality ($/kg)') th.appendChild(makeHelpIcon('Societal damage cost per kilogram of pollutant emitted'));
    extHeaderRow.appendChild(th);
  });
  extThead.appendChild(extHeaderRow);
  extTable.appendChild(extThead);

  const EXT_ROWS = [
    {label: 'CO\u2082', key: 'co2_cost_per_kg'},
    {label: 'SO\u2093', key: 'sox_cost_per_kg'},
    {label: 'NO\u2093', key: 'nox_cost_per_kg'},
  ];
  const extTbody = document.createElement('tbody');
  EXT_ROWS.forEach(row => {
    const tr = document.createElement('tr');
    const tdPoll = document.createElement('td');
    tdPoll.textContent = row.label;
    tdPoll.style.fontWeight = '500';
    tr.appendChild(tdPoll);
    const td = document.createElement('td');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'currency-input';
    input.dataset.path = `16_emissions_reductions.emissions_reductions.societal_costs_per_kg.${row.key}`;
    const val = getValueAtFieldPath(data, '16_emissions_reductions', `emissions_reductions.societal_costs_per_kg.${row.key}`);
    input.value = val != null ? '$' + Number(val).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 3}) : '';
    input.addEventListener('focus', () => {
      const raw = input.value.replace(/[$,]/g, '');
      input.value = raw;
    });
    input.addEventListener('blur', () => {
      const raw = parseFloat(input.value.replace(/[$,]/g, ''));
      if (!isNaN(raw)) input.value = '$' + raw.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 3});
    });
    td.appendChild(input);
    tr.appendChild(td);
    extTbody.appendChild(tr);
  });
  extTable.appendChild(extTbody);
  wrapper.appendChild(extTable);

  // CO₂ cost annual growth (Pattern 7 locked)
  const co2GrowthDiv = document.createElement('div');
  co2GrowthDiv.className = 'env-uplift-row';
  co2GrowthDiv.style.marginTop = '0.75rem';
  const co2GrowthPath = '16_emissions_reductions.emissions_reductions.societal_costs_per_kg.co2_cost_annual_growth';
  const co2GrowthVal = getValueAtFieldPath(data, '16_emissions_reductions', 'emissions_reductions.societal_costs_per_kg.co2_cost_annual_growth') ?? 0.02;
  const co2GrowthLabel = document.createElement('span');
  co2GrowthLabel.className = 'env-uplift-label';
  co2GrowthLabel.textContent = 'CO\u2082 Cost Annual Growth';
  co2GrowthDiv.appendChild(co2GrowthLabel);
  co2GrowthDiv.appendChild(makeHelpIcon('Real annual escalation of CO\u2082 societal cost. Default 2%/yr (Rennert et al. 2022). Locked by default; click lock to override.'));
  const co2GrowthInput = document.createElement('input');
  co2GrowthInput.type = 'text';
  co2GrowthInput.className = 'percentage-input env-uplift-input locked-cell';
  co2GrowthInput.readOnly = true;
  co2GrowthInput.dataset.path = co2GrowthPath;
  co2GrowthInput.value = (co2GrowthVal * 100).toFixed(1) + '%';
  co2GrowthDiv.appendChild(co2GrowthInput);
  const co2GrowthLock = document.createElement('span');
  co2GrowthLock.className = 'lock-pill';
  co2GrowthLock.innerHTML = LOCK_SVG + ' Locked';
  co2GrowthLock.style.cursor = 'pointer';
  co2GrowthLock.style.marginLeft = '0.5rem';
  let co2GrowthLocked = true;
  co2GrowthLock.addEventListener('click', () => {
    if (co2GrowthLocked) {
      showBuildCostConfirmDialog('co2-growth', () => {
        co2GrowthLocked = false;
        co2GrowthInput.readOnly = false;
        co2GrowthInput.classList.remove('locked-cell');
        co2GrowthLock.className = 'lock-pill lock-pill--unlocked';
        co2GrowthLock.innerHTML = UNLOCK_SVG + ' Unlocked';
        co2GrowthInput.value = String(co2GrowthVal);
        co2GrowthInput.focus();
      });
    } else {
      co2GrowthLocked = true;
      co2GrowthInput.readOnly = true;
      co2GrowthInput.classList.add('locked-cell');
      co2GrowthLock.className = 'lock-pill';
      co2GrowthLock.innerHTML = LOCK_SVG + ' Locked';
      const raw = parseFloat(co2GrowthInput.value) || 0;
      co2GrowthInput.value = (raw * 100).toFixed(1) + '%';
    }
  });
  co2GrowthDiv.appendChild(co2GrowthLock);
  wrapper.appendChild(co2GrowthDiv);

  return wrapper;
}

function getTerrainMiles() {
  const miles = {};
  const TERRAINS_LIST = ['forested', 'scrubbed_flat', 'wetland', 'farmland', 'desert_barren', 'urban', 'rolling_hills', 'mountain', 'subsea'];
  TERRAINS_LIST.forEach(t => {
    const el = document.querySelector(`[data-path="02_project_physical_details.terrain.terrain_miles.${t}"]`);
    miles[t] = el ? (parseFloat(String(el.value).replace(/,/g, '')) || 0) : 0;
  });
  return miles;
}

function renderWildfireRiskPanel(data) {
  const wrapper = document.createElement('div');
  wrapper.id = 'wildfire-risk-wrapper';
  const TERRAINS_LIST = ['forested', 'scrubbed_flat', 'wetland', 'farmland', 'desert_barren', 'urban', 'rolling_hills', 'mountain', 'subsea'];
  const TERRAIN_LABELS_MAP = {forested:'Forested', scrubbed_flat:'Scrubbed Flat', wetland:'Wetland', farmland:'Farmland', desert_barren:'Desert/Barren', urban:'Urban', rolling_hills:'Rolling Hills', mountain:'Mountain', subsea:'Subsea'};
  const CT_LIST = ['overhead', 'underground', 'subsea'];

  const l4Bar = document.createElement('div');
  l4Bar.className = 'l4-tabs';
  const l4Ids = ['wf-severity', 'wf-ignition-profile'];
  const l4Panels = [];

  l4Ids.forEach((l4Id, l4Idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'l4-tab' + (l4Idx === 0 ? ' active' : '');
    btn.textContent = C.SUB_TAB_LABELS[l4Id] || l4Id;
    btn.appendChild(makeMethodologyIcon(l4Id));
    l4Bar.appendChild(btn);

    const panel = document.createElement('div');
    panel.className = 'sub-sub-tab-content';
    panel.dataset.subSubTab = l4Id;
    if (l4Idx > 0) panel.style.display = 'none';

    if (l4Id === 'wf-severity') {
      const sevDiv = document.createElement('div');
      sevDiv.className = 'env-uplift-row';
      const sevPath = '06_wildfire_costs.wildfire.severity_per_event';
      const sevVal = getValueAtFieldPath(data, '06_wildfire_costs', 'wildfire.severity_per_event') ?? 0;
      sevDiv.innerHTML = '<span class="env-uplift-label">Severity ($/event)</span> ';
      sevDiv.appendChild(makeHelpIcon('Mean uninsured loss per wildfire event.'));
      const sevInput = document.createElement('input');
      sevInput.type = 'text'; sevInput.className = 'currency-input env-uplift-input'; sevInput.dataset.path = sevPath;
      sevInput.value = '$' + Number(sevVal).toLocaleString();
      sevInput.addEventListener('focus', () => { sevInput.value = sevInput.value.replace(/[$,]/g, ''); });
      sevInput.addEventListener('blur', () => { const r = parseFloat(sevInput.value.replace(/[$,]/g, '')); if (!isNaN(r)) sevInput.value = '$' + r.toLocaleString(); });
      sevDiv.appendChild(sevInput);
      panel.appendChild(sevDiv);
    } else if (l4Id === 'wf-ignition-profile') {
      // Growth rate toggle (first)
      const growthDiv = document.createElement('div');
      growthDiv.style.cssText = 'display:flex;align-items:center;gap:0.5rem;';
      const growthCb = document.createElement('input'); growthCb.type = 'checkbox';
      const growthVal = getValueAtFieldPath(data, '06_wildfire_costs', 'wildfire.risk_growth_rate') ?? 0;
      growthCb.checked = growthVal > 0;
      growthDiv.appendChild(growthCb);
      const growthLabel = document.createElement('span'); growthLabel.className = 'env-uplift-label'; growthLabel.textContent = 'Wildfire Risk Growth Rate'; growthDiv.appendChild(growthLabel);
      growthDiv.appendChild(makeHelpIcon('Annual increase in ignition probability. When off, rates are constant over the project lifetime.'));
      const growthInput = document.createElement('input');
      growthInput.type = 'text'; growthInput.className = 'number-input env-uplift-input';
      growthInput.dataset.path = '06_wildfire_costs.wildfire.risk_growth_rate';
      growthInput.value = growthVal > 0 ? String(growthVal) : '0';
      growthInput.disabled = !growthCb.checked; growthInput.style.opacity = growthCb.checked ? '1' : '0.4';
      growthCb.addEventListener('change', () => { growthInput.disabled = !growthCb.checked; growthInput.style.opacity = growthCb.checked ? '1' : '0.4'; if (!growthCb.checked) growthInput.value = '0'; else { growthInput.value = ''; growthInput.focus(); } });
      growthDiv.appendChild(growthInput); panel.appendChild(growthDiv);

      // CT Multiplier table (Pattern 7)
      const multTable = document.createElement('table');
      multTable.className = 'forge-table capital-cost-table'; multTable.style.marginTop = '1rem';
      const wfMultCaption = document.createElement('caption');
      wfMultCaption.textContent = 'Construction Type Multiplier';
      wfMultCaption.appendChild(makeHelpIcon('Ignition rate multiplier by construction method. Locked values from PG&E SOM / SDG&E CPUC / CIGRE data.'));
      multTable.appendChild(wfMultCaption);
      const multThead = document.createElement('thead'); const multHR = document.createElement('tr');
      const thCT = document.createElement('th'); thCT.textContent = 'Construction Type'; thCT.appendChild(makeHelpIcon('Construction method')); multHR.appendChild(thCT);
      const thMult = document.createElement('th'); thMult.className = 'multiplier-lock-toggle'; thMult.innerHTML = '<span class="lock-pill">' + LOCK_SVG + ' Locked</span>'; thMult.appendChild(makeHelpIcon('Multiplicative factor applied to base ignition rates')); multHR.appendChild(thMult);
      multThead.appendChild(multHR); multTable.appendChild(multThead);
      const multInputs = []; let multLocked = true;
      const multTbody = document.createElement('tbody');
      CT_LIST.forEach(ct => {
        const tr = document.createElement('tr');
        const tdCT = document.createElement('td'); tdCT.textContent = ct.charAt(0).toUpperCase() + ct.slice(1); tdCT.style.fontWeight = '500'; tr.appendChild(tdCT);
        const tdVal = document.createElement('td');
        const input = document.createElement('input');
        input.type = 'text'; input.className = 'number-input locked-cell'; input.readOnly = true;
        input.dataset.path = `06_wildfire_costs.wildfire.ignition_rate_multiplier.${ct}`;
        const val = getValueAtFieldPath(data, '06_wildfire_costs', `wildfire.ignition_rate_multiplier.${ct}`);
        input.value = val != null ? String(val) : '1.0';
        multInputs.push(input); tdVal.appendChild(input); tr.appendChild(tdVal); multTbody.appendChild(tr);
      });
      multTable.appendChild(multTbody); panel.appendChild(multTable);
      thMult.style.cursor = 'pointer';
      thMult.addEventListener('click', () => {
        if (!multLocked) { multLocked = true; multInputs.forEach(i => { i.readOnly = true; i.classList.add('locked-cell'); }); thMult.innerHTML = '<span class="lock-pill">' + LOCK_SVG + ' Locked</span>'; }
        else { showBuildCostConfirmDialog('wildfire-multiplier', () => { multLocked = false; multInputs.forEach(i => { i.readOnly = false; i.classList.remove('locked-cell'); }); thMult.innerHTML = '<span class="lock-pill lock-pill--unlocked">' + UNLOCK_SVG + ' Unlocked</span>'; }); }
      });

      const birDiv = document.createElement('div');
      birDiv.className = 'env-uplift-row';
      birDiv.style.marginTop = '1rem';
      const birPath = '06_wildfire_costs.wildfire.base_ignition_rate';
      const birVal = getValueAtFieldPath(data, '06_wildfire_costs', 'wildfire.base_ignition_rate') ?? 0.003;
      birDiv.innerHTML = '<span class="env-uplift-label">Base Ignition Rate (events/mi/yr)</span> ';
      birDiv.appendChild(makeHelpIcon('Line-level overhead baseline ignition rate. Effective rate = base \u00d7 construction type multiplier.'));
      const birInput = document.createElement('input');
      birInput.type = 'text'; birInput.className = 'number-input env-uplift-input'; birInput.dataset.path = birPath;
      birInput.value = String(birVal);
      birDiv.appendChild(birInput);
      panel.appendChild(birDiv);
    }

    renderTabGuideBanner(l4Id, panel);
    l4Panels.push(panel);
    btn.addEventListener('click', () => {
      l4Bar.querySelectorAll('.l4-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      l4Panels.forEach(p => { p.style.display = p.dataset.subSubTab === l4Id ? '' : 'none'; });
    });
  });

  wrapper.appendChild(l4Bar);
  l4Panels.forEach(p => wrapper.appendChild(p));
  return wrapper;
}

function renderOutageRiskPanel(data) {
  const wrapper = document.createElement('div');
  wrapper.id = 'outage-risk-wrapper';
  const TERRAINS_LIST = ['forested', 'scrubbed_flat', 'wetland', 'farmland', 'desert_barren', 'urban', 'rolling_hills', 'mountain', 'subsea'];
  const TERRAIN_LABELS_MAP = {forested:'Forested', scrubbed_flat:'Scrubbed Flat', wetland:'Wetland', farmland:'Farmland', desert_barren:'Desert/Barren', urban:'Urban', rolling_hills:'Rolling Hills', mountain:'Mountain', subsea:'Subsea'};
  const CT_LIST = ['overhead', 'underground', 'subsea'];
  const ctEl = document.querySelector('[data-path="01_project_technical_details.project.construction_type"]');
  const activeCT = ctEl ? ctEl.value.toLowerCase().replace(/-/g, '_').replace('underground direct_buried', 'underground').replace('underground tunnel', 'underground') : 'overhead';

  const l4Bar = document.createElement('div');
  l4Bar.className = 'l4-tabs';
  const l4Ids = ['out-exposure', 'out-outage-profile'];
  const l4Panels = [];

  l4Ids.forEach((l4Id, l4Idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'l4-tab' + (l4Idx === 0 ? ' active' : '');
    btn.textContent = C.SUB_TAB_LABELS[l4Id] || l4Id;
    btn.appendChild(makeMethodologyIcon(l4Id));
    l4Bar.appendChild(btn);

    const panel = document.createElement('div');
    panel.className = 'sub-sub-tab-content';
    panel.dataset.subSubTab = l4Id;
    if (l4Idx > 0) panel.style.display = 'none';

    if (l4Id === 'out-exposure') {
      const capDiv = document.createElement('div');
      capDiv.className = 'env-uplift-row';
      const capPath = '07_outage_costs.outage.capacity_at_risk_factor';
      const capVal = getValueAtFieldPath(data, '07_outage_costs', 'outage.capacity_at_risk_factor') ?? 1;
      capDiv.innerHTML = '<span class="env-uplift-label">Capacity at Risk (\u03C6)</span> ';
      capDiv.appendChild(makeHelpIcon('Fraction of capacity lost per outage (1.0 = radial, <1.0 = meshed).'));
      const capInput = document.createElement('input');
      capInput.type = 'text'; capInput.className = 'number-input env-uplift-input'; capInput.dataset.path = capPath;
      capInput.value = String(capVal);
      capDiv.appendChild(capInput);
      panel.appendChild(capDiv);

      const rhoDiv = document.createElement('div');
      rhoDiv.className = 'env-uplift-row';
      rhoDiv.style.marginTop = '0.75rem';
      const acDcEl2 = document.querySelector('[data-path="01_project_technical_details.project.ac_dc"]');
      const rhoVal = (acDcEl2?.value === 'DC') ? '0.80' : '0.05';
      rhoDiv.innerHTML = '<span class="env-uplift-label">Load-Shed Fraction (\u03C1)</span> ';
      rhoDiv.appendChild(makeHelpIcon('Fraction of outage impact from load-shedding vs redispatch. Auto-derived: AC=0.05, DC=0.80.'));
      const rhoDisplay = document.createElement('span');
      rhoDisplay.className = 'readonly-miles-display';
      rhoDisplay.textContent = rhoVal;
      rhoDiv.appendChild(rhoDisplay);
      panel.appendChild(rhoDiv);

      const rdDiv = document.createElement('div');
      rdDiv.className = 'env-uplift-row';
      rdDiv.style.marginTop = '0.75rem';
      const rdPath = '07_outage_costs.outage.redispatch_cost_per_mwh';
      const rdVal = getValueAtFieldPath(data, '07_outage_costs', 'outage.redispatch_cost_per_mwh') ?? 20;
      rdDiv.innerHTML = '<span class="env-uplift-label">Redispatch Cost ($/MWh)</span> ';
      rdDiv.appendChild(makeHelpIcon('Congestion premium for rerouting power during an outage. LBNL empirical median.'));
      const rdInput = document.createElement('input');
      rdInput.type = 'text'; rdInput.className = 'number-input env-uplift-input'; rdInput.dataset.path = rdPath;
      rdInput.value = String(rdVal);
      rdDiv.appendChild(rdInput);
      panel.appendChild(rdDiv);
    } else if (l4Id === 'out-outage-profile') {
      // Growth rate toggle (first)
      const growthDiv = document.createElement('div');
      growthDiv.style.cssText = 'display:flex;align-items:center;gap:0.5rem;';
      const growthCb = document.createElement('input'); growthCb.type = 'checkbox';
      const growthVal = getValueAtFieldPath(data, '07_outage_costs', 'outage.risk_growth_rate') ?? 0;
      growthCb.checked = growthVal > 0;
      growthDiv.appendChild(growthCb);
      const growthLabel = document.createElement('span'); growthLabel.className = 'env-uplift-label'; growthLabel.textContent = 'Outage Risk Growth Rate'; growthDiv.appendChild(growthLabel);
      growthDiv.appendChild(makeHelpIcon('Annual increase in outage rates. When off, rates are constant over the project lifetime.'));
      const growthInput = document.createElement('input');
      growthInput.type = 'text'; growthInput.className = 'number-input env-uplift-input';
      growthInput.dataset.path = '07_outage_costs.outage.risk_growth_rate';
      growthInput.value = growthVal > 0 ? String(growthVal) : '0';
      growthInput.disabled = !growthCb.checked; growthInput.style.opacity = growthCb.checked ? '1' : '0.4';
      growthCb.addEventListener('change', () => { growthInput.disabled = !growthCb.checked; growthInput.style.opacity = growthCb.checked ? '1' : '0.4'; if (!growthCb.checked) growthInput.value = '0'; else { growthInput.value = ''; growthInput.focus(); } });
      growthDiv.appendChild(growthInput); panel.appendChild(growthDiv);

      // Duration Multiplier table (Pattern 7)
      const durTable = document.createElement('table');
      durTable.className = 'forge-table capital-cost-table'; durTable.style.marginTop = '1rem';
      const outMultCaption = document.createElement('caption');
      outMultCaption.textContent = 'Duration Multiplier';
      outMultCaption.appendChild(makeHelpIcon('Outage duration multiplier by construction method. Locked values from CIGRE TB 815 / IEA Wind TEM95 data.'));
      durTable.appendChild(outMultCaption);
      const durThead = document.createElement('thead'); const durHR = document.createElement('tr');
      const thCT = document.createElement('th'); thCT.textContent = 'Construction Type'; thCT.appendChild(makeHelpIcon('Construction method')); durHR.appendChild(thCT);
      const thDur = document.createElement('th'); thDur.className = 'multiplier-lock-toggle'; thDur.innerHTML = '<span class="lock-pill">' + LOCK_SVG + ' Locked</span>'; thDur.appendChild(makeHelpIcon('Multiplicative factor applied to base outage duration')); durHR.appendChild(thDur);
      durThead.appendChild(durHR); durTable.appendChild(durThead);
      const durInputs = []; let durLocked = true;
      const durTbody = document.createElement('tbody');
      CT_LIST.forEach(ct => {
        const tr = document.createElement('tr');
        const tdCT = document.createElement('td'); tdCT.textContent = ct.charAt(0).toUpperCase() + ct.slice(1); tdCT.style.fontWeight = '500'; tr.appendChild(tdCT);
        const tdVal = document.createElement('td');
        const input = document.createElement('input');
        input.type = 'text'; input.className = 'number-input locked-cell'; input.readOnly = true;
        input.dataset.path = `07_outage_costs.outage.outage_duration_multiplier.${ct}`;
        const val = getValueAtFieldPath(data, '07_outage_costs', `outage.outage_duration_multiplier.${ct}`);
        input.value = val != null ? String(val) : '1.0';
        durInputs.push(input); tdVal.appendChild(input); tr.appendChild(tdVal); durTbody.appendChild(tr);
      });
      durTable.appendChild(durTbody); panel.appendChild(durTable);
      thDur.style.cursor = 'pointer';
      thDur.addEventListener('click', () => {
        if (!durLocked) { durLocked = true; durInputs.forEach(i => { i.readOnly = true; i.classList.add('locked-cell'); }); thDur.innerHTML = '<span class="lock-pill">' + LOCK_SVG + ' Locked</span>'; }
        else { showBuildCostConfirmDialog('outage-duration', () => { durLocked = false; durInputs.forEach(i => { i.readOnly = false; i.classList.remove('locked-cell'); }); thDur.innerHTML = '<span class="lock-pill lock-pill--unlocked">' + UNLOCK_SVG + ' Unlocked</span>'; }); }
      });

      const bodDiv = document.createElement('div');
      bodDiv.className = 'env-uplift-row';
      bodDiv.style.marginTop = '1rem';
      const bodPath = '07_outage_costs.outage.outage_duration';
      const bodVal = getValueAtFieldPath(data, '07_outage_costs', 'outage.outage_duration') ?? 6;
      bodDiv.innerHTML = '<span class="env-uplift-label">Base Outage Duration (hrs/event)</span> ';
      bodDiv.appendChild(makeHelpIcon('Effective duration = base \u00d7 construction type multiplier.'));
      const bodInput = document.createElement('input');
      bodInput.type = 'text'; bodInput.className = 'number-input env-uplift-input'; bodInput.dataset.path = bodPath;
      bodInput.value = String(bodVal);
      bodDiv.appendChild(bodInput);
      panel.appendChild(bodDiv);

      const rateTable = document.createElement('table');
      rateTable.className = 'forge-table capital-cost-table'; rateTable.style.marginTop = '1rem';
      const rateCaption = document.createElement('caption');
      rateCaption.textContent = 'Outage Rate by Construction Type';
      rateCaption.appendChild(makeHelpIcon('Line-level outage frequency per construction type (outages/mi/yr).'));
      rateTable.appendChild(rateCaption);
      const rateThead = document.createElement('thead');
      const rateHR = document.createElement('tr');
      const rateThCT = document.createElement('th'); rateThCT.textContent = 'Construction Type'; rateHR.appendChild(rateThCT);
      const rateThVal = document.createElement('th'); rateThVal.textContent = 'Outage Rate (outages/mi/yr)'; rateHR.appendChild(rateThVal);
      rateThead.appendChild(rateHR); rateTable.appendChild(rateThead);
      const rateTbody = document.createElement('tbody');
      const OUTAGE_RATE_DEFAULTS = { overhead: 0.025, underground: 0.004, subsea: 0.00475 };
      CT_LIST.forEach(ct => {
        const tr = document.createElement('tr');
        const tdCT = document.createElement('td'); tdCT.textContent = ct.charAt(0).toUpperCase() + ct.slice(1); tdCT.style.fontWeight = '500'; tr.appendChild(tdCT);
        const tdVal = document.createElement('td');
        const input = document.createElement('input');
        input.type = 'text'; input.className = 'number-input';
        input.dataset.path = `07_outage_costs.outage.outage_rate.${ct}`;
        const val = getValueAtFieldPath(data, '07_outage_costs', `outage.outage_rate.${ct}`);
        input.value = val != null ? String(val) : String(OUTAGE_RATE_DEFAULTS[ct] || 0);
        tdVal.appendChild(input); tr.appendChild(tdVal); rateTbody.appendChild(tr);
      });
      rateTable.appendChild(rateTbody); panel.appendChild(rateTable);
    }

    renderTabGuideBanner(l4Id, panel);
    l4Panels.push(panel);
    btn.addEventListener('click', () => {
      l4Bar.querySelectorAll('.l4-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      l4Panels.forEach(p => { p.style.display = p.dataset.subSubTab === l4Id ? '' : 'none'; });
    });
  });

  wrapper.appendChild(l4Bar);
  l4Panels.forEach(p => wrapper.appendChild(p));
  return wrapper;
}

function rebuildRiskPanels(data) {
  const wf = document.getElementById('wildfire-risk-wrapper');
  if (wf) wf.parentNode.replaceChild(renderWildfireRiskPanel(data), wf);
  const out = document.getElementById('outage-risk-wrapper');
  if (out) out.parentNode.replaceChild(renderOutageRiskPanel(data), out);
}

function renderFinancialRatesPanel(data) {
  const wrapper = document.createElement('div');
  wrapper.id = 'financial-rates-wrapper';

  const RATE_FIELDS = [
    {id: 'base_year', label: 'Base Year', path: '03_financing.financial.base_year', fieldPath: 'financial.base_year', type: 'dropdown', options: Array.from({length: 31}, (_, i) => 2020 + i), help: 'Reference year for all present values (base-year dollars)'},
    {id: 'inflation_rate', label: 'Inflation Rate', path: '03_financing.financial.inflation_rate', fieldPath: 'financial.inflation_rate', type: 'percent', help: 'Annual inflation rate for Fisher equation'},
    {id: 'wacc_nominal', label: 'WACC (Nominal)', path: '03_financing.financial.wacc_nominal', fieldPath: 'financial.wacc_nominal', type: 'percent', help: 'Nominal weighted average cost of capital; also used as AFUDC rate'},
    {id: 'social_discount_rate', label: 'Social Discount Rate', path: '03_financing.financial.social_discount_rate', fieldPath: 'financial.social_discount_rate', type: 'percent', help: 'Discount rate for social externalities (risk, emissions)'},
  ];

  RATE_FIELDS.forEach(rf => {
    const row = document.createElement('div');
    row.className = 'env-uplift-row';
    const label = document.createElement('span');
    label.className = 'env-uplift-label';
    label.textContent = rf.label;
    row.appendChild(label);
    row.appendChild(makeHelpIcon(rf.help));

    const val = getValueAtFieldPath(data, '03_financing', rf.fieldPath);

    if (rf.type === 'dropdown') {
      const sel = document.createElement('select');
      sel.className = 'env-uplift-input';
      sel.dataset.path = rf.path;
      rf.options.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt;
        o.textContent = opt;
        if (val != null && String(opt) === String(val)) o.selected = true;
        sel.appendChild(o);
      });
      row.appendChild(sel);
    } else {
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'percentage-input env-uplift-input';
      inp.dataset.path = rf.path;
      inp.value = val != null ? (val * 100).toFixed(1) + '%' : '';
      inp.addEventListener('focus', () => { inp.value = inp.value.replace(/%/g, ''); });
      inp.addEventListener('blur', () => {
        const raw = parseFloat(inp.value.replace(/%/g, ''));
        if (!isNaN(raw)) inp.value = raw.toFixed(1) + '%';
      });
      row.appendChild(inp);
    }
    wrapper.appendChild(row);

    if (rf.id === 'wacc_nominal') {
      const computedDiv = document.createElement('div');
      computedDiv.className = 'forge-computed-value';
      computedDiv.innerHTML = '<div class="computed-label"><svg width="12" height="12" viewBox="0 0 16 16"><rect x="3" y="7" width="10" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5 7V5a3 3 0 016 0v2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg> Real WACC (computed)</div><span class="computed-val" id="wacc-real-display">\u2014</span>';
      wrapper.appendChild(computedDiv);
    }
  });

  function updateWaccReal() {
    const nomInput = wrapper.querySelector('[data-path="03_financing.financial.wacc_nominal"]');
    const infInput = wrapper.querySelector('[data-path="03_financing.financial.inflation_rate"]');
    const display = wrapper.querySelector('#wacc-real-display');
    if (!nomInput || !infInput || !display) return;
    const nom = parseFloat(nomInput.value.replace(/%/g, '')) / 100;
    const inf = parseFloat(infInput.value.replace(/%/g, '')) / 100;
    if (!isNaN(nom) && !isNaN(inf) && (1 + inf) !== 0) {
      const real = (1 + nom) / (1 + inf) - 1;
      display.textContent = (real * 100).toFixed(2) + '%';
    } else {
      display.textContent = '\u2014';
    }
  }

  setTimeout(() => {
    const nomInput = wrapper.querySelector('[data-path="03_financing.financial.wacc_nominal"]');
    const infInput = wrapper.querySelector('[data-path="03_financing.financial.inflation_rate"]');
    if (nomInput) nomInput.addEventListener('blur', updateWaccReal);
    if (infInput) infInput.addEventListener('blur', updateWaccReal);
    updateWaccReal();
  }, 0);

  // Revenue Requirement toggle (declining-balance model; no allowed-return-rate input needed —
  // revenue is derived from rate base + real WACC, computed server-side)
  const revDiv = document.createElement('div');
  revDiv.className = 'env-uplift-row';
  revDiv.style.marginTop = '1.5rem';
  const revLabel = document.createElement('span');
  revLabel.className = 'env-uplift-label';
  revLabel.textContent = 'Revenue Requirement';
  revDiv.appendChild(revLabel);
  revDiv.appendChild(makeHelpIcon('Enable rate-based revenue calculation (straight-line depreciation + return on declining rate base at real WACC)'));
  const revToggle = document.createElement('input');
  revToggle.type = 'checkbox';
  revToggle.className = 'toggle-input';
  revToggle.dataset.path = '03_financing.financial.revenue.rate_based.enabled';
  const revVal = getValueAtFieldPath(data, '03_financing', 'financial.revenue.rate_based.enabled');
  revToggle.checked = revVal === true || revVal === 'true';
  revDiv.appendChild(revToggle);
  wrapper.appendChild(revDiv);

  return wrapper;
}

const TIMING_CATEGORIES = [
  {key: 'build_costs', label: 'Build Costs'},
  {key: 'row_acquisition', label: 'ROW Acquisition'},
  {key: 'row_holding', label: 'ROW Holding'},
  {key: 'row_rent', label: 'ROW Rent'},
  {key: 'environmental_mitigation_base', label: 'Env. Mitigation (Base)'},
  {key: 'environmental_mitigation_credits', label: 'Env. Mitigation (Credits)'},
  {key: 'delay_costs', label: 'Delay Costs'},
  {key: 'operations_and_maintenance', label: 'O&M'},
  {key: 'construction_insurance', label: 'Construction Insurance'},
];

function renderFinancialAFUDCPanel(data) {
  const wrapper = document.createElement('div');
  wrapper.id = 'financial-afudc-wrapper';

  // Apply AFUDC toggle
  const afudcRow = document.createElement('div');
  afudcRow.className = 'env-uplift-row';
  const afudcLabel = document.createElement('span');
  afudcLabel.className = 'env-uplift-label';
  afudcLabel.textContent = 'Apply AFUDC';
  afudcRow.appendChild(afudcLabel);
  afudcRow.appendChild(makeHelpIcon('Toggle AFUDC capitalization. When enabled, eligible costs compound at the WACC rate from incurrence to commercial operation date (COD).'));
  const afudcToggle = document.createElement('input');
  afudcToggle.type = 'checkbox';
  afudcToggle.className = 'toggle-input';
  afudcToggle.dataset.path = '03_financing.financial.afudc.apply_afudc';
  const afudcVal = getValueAtFieldPath(data, '03_financing', 'financial.afudc.apply_afudc');
  afudcToggle.checked = afudcVal === true || afudcVal === 'true';
  afudcRow.appendChild(afudcToggle);
  wrapper.appendChild(afudcRow);

  const afudcNote = document.createElement('div');
  afudcNote.style.cssText = 'font-size:0.85rem;color:#666;margin:0.25rem 0 1rem 0;';
  afudcNote.textContent = 'When enabled, eligible costs compound at the WACC rate from incurrence to commercial operation date (COD).';
  wrapper.appendChild(afudcNote);

  // Delay Period Active Work toggle
  const delayRow = document.createElement('div');
  delayRow.className = 'env-uplift-row';
  delayRow.id = 'delay-active-work-row';
  const delayLabel = document.createElement('span');
  delayLabel.className = 'env-uplift-label';
  delayLabel.textContent = 'Delay Period Active Work';
  delayRow.appendChild(delayLabel);
  delayRow.appendChild(makeHelpIcon('AFUDC accrues during delay if active work continues (permitting, design, CWIP-eligible costs)'));
  const delayToggle = document.createElement('input');
  delayToggle.type = 'checkbox';
  delayToggle.className = 'toggle-input';
  delayToggle.dataset.path = '03_financing.financial.afudc.delay_period_active_work';
  const delayVal = getValueAtFieldPath(data, '03_financing', 'financial.afudc.delay_period_active_work');
  delayToggle.checked = delayVal === true || delayVal === 'true';
  delayRow.appendChild(delayToggle);
  wrapper.appendChild(delayRow);

  // Cost Timing Matrix table
  const table = document.createElement('table');
  table.className = 'forge-table forge-table--compact conductor-details-table';
  table.id = 'cost-timing-table';
  table.style.marginTop = '1.5rem';
  const timingCaption = document.createElement('caption');
  timingCaption.textContent = 'Cost Timing Patterns';
  timingCaption.appendChild(makeHelpIcon('When each cost category enters CWIP (FERC Account 107) and whether it qualifies for AFUDC capitalization.'));
  table.appendChild(timingCaption);
  const TIMING_HEADER_TOOLTIPS = {
    'During Delay (%)': 'Fraction of cost incurred during the delay period before construction begins',
    'During Constr. (%)': 'Fraction of cost incurred during the construction period',
    'AFUDC Eligible': 'Whether this cost category compounds at the WACC rate from incurrence to COD',
  };
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  ['Cost Category', 'During Delay (%)', 'During Constr. (%)', 'AFUDC Eligible'].forEach(txt => {
    const th = document.createElement('th');
    th.textContent = txt;
    if (TIMING_HEADER_TOOLTIPS[txt]) th.appendChild(makeHelpIcon(TIMING_HEADER_TOOLTIPS[txt]));
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  TIMING_CATEGORIES.forEach(cat => {
    const tr = document.createElement('tr');
    const tdLabel = document.createElement('td');
    tdLabel.textContent = cat.label;
    tdLabel.style.fontWeight = '500';
    tr.appendChild(tdLabel);

    const basePath = `cost_timing_patterns.${cat.key}`;

    // During Delay
    const tdDelay = document.createElement('td');
    const delayInp = document.createElement('input');
    delayInp.type = 'text';
    delayInp.className = 'percentage-input';
    delayInp.dataset.path = `19_cost_timing_patterns.${basePath}.during_delay`;
    const dVal = getValueAtFieldPath(data, '19_cost_timing_patterns', `${basePath}.during_delay`);
    delayInp.value = dVal != null ? (dVal * 100).toFixed(0) + '%' : '0%';
    delayInp.addEventListener('focus', () => { delayInp.value = delayInp.value.replace(/%/g, ''); });
    delayInp.addEventListener('blur', () => {
      const raw = parseFloat(delayInp.value.replace(/%/g, ''));
      if (!isNaN(raw)) delayInp.value = raw.toFixed(0) + '%';
    });
    tdDelay.appendChild(delayInp);
    tr.appendChild(tdDelay);

    // During Construction
    const tdConstr = document.createElement('td');
    const constrInp = document.createElement('input');
    constrInp.type = 'text';
    constrInp.className = 'percentage-input';
    constrInp.dataset.path = `19_cost_timing_patterns.${basePath}.during_construction`;
    const cVal = getValueAtFieldPath(data, '19_cost_timing_patterns', `${basePath}.during_construction`);
    constrInp.value = cVal != null ? (cVal * 100).toFixed(0) + '%' : '0%';
    constrInp.addEventListener('focus', () => { constrInp.value = constrInp.value.replace(/%/g, ''); });
    constrInp.addEventListener('blur', () => {
      const raw = parseFloat(constrInp.value.replace(/%/g, ''));
      if (!isNaN(raw)) constrInp.value = raw.toFixed(0) + '%';
    });
    tdConstr.appendChild(constrInp);
    tr.appendChild(tdConstr);

    // AFUDC Eligible (checkbox)
    const tdAfudc = document.createElement('td');
    tdAfudc.style.textAlign = 'center';
    const afudcCb = document.createElement('input');
    afudcCb.type = 'checkbox';
    afudcCb.dataset.path = `19_cost_timing_patterns.${basePath}.afudc_eligible`;
    const aVal = getValueAtFieldPath(data, '19_cost_timing_patterns', `${basePath}.afudc_eligible`);
    afudcCb.checked = aVal === true || aVal === 'true';
    tdAfudc.appendChild(afudcCb);
    tr.appendChild(tdAfudc);

    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrapper.appendChild(table);

  // Explanatory note
  const note = document.createElement('div');
  note.style.cssText = 'font-size:0.85rem;color:#666;margin-top:0.75rem;line-height:1.4;';
  note.textContent = 'Timing fractions determine when costs enter CWIP (FERC Account 107). AFUDC-eligible costs compound at the WACC rate from incurrence to COD.';
  wrapper.appendChild(note);

  // AFUDC toggle gates delay-active-work and AFUDC column
  function updateAfudcVisibility() {
    const on = afudcToggle.checked;
    delayRow.style.display = on ? '' : 'none';
    table.querySelectorAll('tbody input[type="checkbox"]').forEach(cb => {
      cb.disabled = !on;
      cb.closest('td').style.opacity = on ? '1' : '0.4';
    });
  }
  afudcToggle.addEventListener('change', updateAfudcVisibility);
  updateAfudcVisibility();

  return wrapper;
}

function renderEconomicDetailsPanel(data) {
  const wrapper = document.createElement('div');
  wrapper.id = 'economic-details-wrapper';

  // Value of Load (inline input)
  const volDiv = document.createElement('div');
  volDiv.className = 'env-uplift-row';
  const volPath = '01_project_technical_details.project.value_of_load_per_mwh';
  const volVal = getValueAtFieldPath(data, '01_project_technical_details', 'project.value_of_load_per_mwh') ?? 50;
  volDiv.innerHTML = '<span class="env-uplift-label">Value of Load</span> ';
  volDiv.appendChild(makeHelpIcon('Demand-side marginal value of delivered energy ($/MWh). The value of electricity derives from the services load performs with it.'));
  const volInput = document.createElement('input');
  volInput.type = 'text';
  volInput.className = 'currency-input env-uplift-input';
  volInput.dataset.path = volPath;
  volInput.value = volVal != null ? '$' + Number(volVal).toLocaleString() : '';
  volInput.addEventListener('focus', () => { volInput.value = volInput.value.replace(/[$,]/g, ''); });
  volInput.addEventListener('blur', () => {
    const raw = parseFloat(volInput.value.replace(/[$,]/g, ''));
    if (!isNaN(raw)) volInput.value = '$' + raw.toLocaleString();
  });
  volDiv.appendChild(volInput);
  wrapper.appendChild(volDiv);

  // VoLL tiers table
  const vollTable = document.createElement('table');
  vollTable.className = 'forge-table conductor-details-table';
  vollTable.style.marginTop = '1.5rem';
  const vollCaption = document.createElement('caption');
  vollCaption.textContent = 'Value of Lost Load (piecewise by outage duration)';
  vollCaption.appendChild(makeHelpIcon('Cost of unserved energy by outage duration tier. Consumed by the outage risk calculation.'));
  vollTable.appendChild(vollCaption);
  const vollThead = document.createElement('thead');
  const vollHeaderRow = document.createElement('tr');
  const VOLL_HEADER_TOOLTIPS = {
    'Duration Tier': 'Outage duration category',
    'Max Hours': 'Upper bound of this duration tier in hours',
    'Value ($/MWh)': 'Cost of unserved energy for outages in this duration range',
  };
  ['Duration Tier', 'Max Hours', 'Value ($/MWh)'].forEach(txt => {
    const th = document.createElement('th');
    th.textContent = txt;
    if (VOLL_HEADER_TOOLTIPS[txt]) th.appendChild(makeHelpIcon(VOLL_HEADER_TOOLTIPS[txt]));
    vollHeaderRow.appendChild(th);
  });
  vollThead.appendChild(vollHeaderRow);
  vollTable.appendChild(vollThead);

  const VOLL_TIERS = [
    {label: '0\u20131h',    tierIdx: 0, hoursEditable: true},
    {label: '1\u20132h',    tierIdx: 1, hoursEditable: true},
    {label: '2\u20134h',    tierIdx: 2, hoursEditable: true},
    {label: '4\u20138h',    tierIdx: 3, hoursEditable: true},
    {label: '8\u201316h',   tierIdx: 4, hoursEditable: true},
    {label: '16\u201332h',  tierIdx: 5, hoursEditable: true},
    {label: '32\u201364h',  tierIdx: 6, hoursEditable: true},
    {label: '64h\u20137d',  tierIdx: 7, hoursEditable: true},
    {label: '7\u201330d',   tierIdx: 8, hoursEditable: true},
    {label: '>30d',          tierIdx: 9, hoursEditable: false},
  ];
  const vollTbody = document.createElement('tbody');
  VOLL_TIERS.forEach(tier => {
    const tr = document.createElement('tr');
    const tdLabel = document.createElement('td');
    tdLabel.textContent = tier.label;
    tdLabel.style.fontWeight = '500';
    tr.appendChild(tdLabel);

    const tdHours = document.createElement('td');
    if (tier.hoursEditable) {
      const hoursInput = document.createElement('input');
      hoursInput.type = 'text';
      hoursInput.className = 'number-input';
      hoursInput.dataset.path = `07_outage_costs.outage.value_of_lost_load.tiers[${tier.tierIdx}].max_hours`;
      const hVal = getValueAtFieldPath(data, '07_outage_costs', `outage.value_of_lost_load.tiers[${tier.tierIdx}].max_hours`);
      hoursInput.value = hVal != null ? String(hVal) : '';
      tdHours.appendChild(hoursInput);
    } else {
      tdHours.textContent = '\u221E';
      tdHours.style.textAlign = 'center';
      tdHours.style.fontSize = '1.2rem';
    }
    tr.appendChild(tdHours);

    const tdValue = document.createElement('td');
    const valInput = document.createElement('input');
    valInput.type = 'text';
    valInput.className = 'currency-input';
    valInput.dataset.path = `07_outage_costs.outage.value_of_lost_load.tiers[${tier.tierIdx}].value_per_mwh`;
    const vVal = getValueAtFieldPath(data, '07_outage_costs', `outage.value_of_lost_load.tiers[${tier.tierIdx}].value_per_mwh`);
    valInput.value = vVal != null ? '$' + Number(vVal).toLocaleString() : '';
    valInput.addEventListener('focus', () => { valInput.value = valInput.value.replace(/[$,]/g, ''); });
    valInput.addEventListener('blur', () => {
      const raw = parseFloat(valInput.value.replace(/[$,]/g, ''));
      if (!isNaN(raw)) valInput.value = '$' + raw.toLocaleString();
    });
    tdValue.appendChild(valInput);
    tr.appendChild(tdValue);
    vollTbody.appendChild(tr);
  });
  vollTable.appendChild(vollTbody);
  wrapper.appendChild(vollTable);

  const footnote = document.createElement('div');
  footnote.className = 'conductor-details-footnote';
  footnote.textContent = 'VoLL is a system-level economic parameter. The outage risk calculation (Risk Costs) consumes these values.';
  wrapper.appendChild(footnote);

  return wrapper;
}

function renderConstraintsPanel(data) {
  const wrapper = document.createElement('div');
  wrapper.id = 'constraints-wrapper';

  const recon = isReconductoring();
  const prefix = recon ? 'rc' : 'gf';
  const yamlRoot = recon ? 'incremental_congestion_reductions' : 'greenfield_congestion_reductions';
  const yamlSection = '17_congestion_reductions';

  const l4Bar = document.createElement('div');
  l4Bar.className = 'l4-tabs';
  const l4Ids = ['congestion'];
  const l4Panels = [];

  l4Ids.forEach((l4Id, l4Idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'l4-tab' + (l4Idx === 0 ? ' active' : '');
    btn.textContent = C.SUB_TAB_LABELS[l4Id] || l4Id;
    btn.appendChild(makeMethodologyIcon(l4Id));
    l4Bar.appendChild(btn);

    const panel = document.createElement('div');
    panel.className = 'sub-sub-tab-content';
    panel.dataset.subSubTab = l4Id;
    if (l4Idx > 0) panel.style.display = 'none';

    if (l4Id === 'congestion') {
      // Single-constraint, single-price congestion reduction (constraints + price, flat paths)
      const congFields = [];
      if (!recon) {
        congFields.push({label: 'Flow Factor', path: `${yamlSection}.${yamlRoot}.constraints.flow_factor`, type: 'percent', help: 'Deliverability to targeted constraint [0,1]'});
      }
      congFields.push(
        {label: 'Constrained Hours', path: `${yamlSection}.${yamlRoot}.constraints.constrained_hours`, type: 'number', unit: 'hrs/year', help: 'Total hours/year the constraint binds'},
        {label: 'Average Exceedance', path: `${yamlSection}.${yamlRoot}.constraints.average_exceedance`, type: 'number', unit: 'MW', help: 'Average MW exceedance during constrained hours'},
        {label: 'Congestion Price', path: `${yamlSection}.${yamlRoot}.prices.average_congestion_price`, type: 'currency', unit: '$/MWh', help: 'Marginal redispatch cost during congestion hours'}
      );

      congFields.forEach(f => {
        const row = document.createElement('div');
        row.className = 'env-uplift-row';
        row.innerHTML = `<span class="env-uplift-label">${f.label}</span> `;
        row.appendChild(makeHelpIcon(f.help));
        const input = document.createElement('input');
        input.type = 'text';
        input.className = f.type === 'currency' ? 'currency-input env-uplift-input' : 'number-input env-uplift-input';
        input.dataset.path = f.path;
        const parts = f.path.split('.');
        const val = getValueAtFieldPath(data, parts[0], parts.slice(1).join('.'));
        if (f.type === 'currency') {
          input.value = val != null ? '$' + Number(val).toLocaleString() : '';
          input.addEventListener('focus', () => { input.value = input.value.replace(/[$,]/g, ''); });
          input.addEventListener('blur', () => { const r = parseFloat(input.value.replace(/[$,]/g, '')); if (!isNaN(r)) input.value = '$' + r.toLocaleString(); });
        } else {
          input.value = val != null ? String(val) : '';
          input.addEventListener('focus', () => { input.value = input.value.replace(/,/g, ''); });
          input.addEventListener('blur', () => { const r = parseFloat(input.value.replace(/,/g, '')); if (!isNaN(r)) input.value = r.toLocaleString('en-US', {maximumFractionDigits: 10}); });
        }
        row.appendChild(input);
        panel.appendChild(row);
      });
    }

    renderTabGuideBanner(l4Id, panel);
    l4Panels.push(panel);
    btn.addEventListener('click', () => {
      l4Bar.querySelectorAll('.l4-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      l4Panels.forEach(p => { p.style.display = p.dataset.subSubTab === l4Id ? '' : 'none'; });
    });
  });

  wrapper.appendChild(l4Bar);
  l4Panels.forEach(p => wrapper.appendChild(p));
  return wrapper;
}

function rebuildConstraintsPanel(data) {
  const existing = document.getElementById('constraints-wrapper');
  if (existing) {
    const parent = existing.parentNode;
    parent.replaceChild(renderConstraintsPanel(data), existing);
  }
}

function renderCapitalCostSubTab(subTabId, data) {
  const wrapper = document.createElement('div');
  wrapper.id = `capital-cost-${subTabId}-wrapper`;

  const COST_FIELDS = {
    conductor: [
      { key: 'variable_conductor_cost_per_mile', label: 'Variable Cost per Mile' },
      { key: 'fixed_conductor_cost', label: 'Fixed Cost' },
    ],
    structure: [
      { key: 'variable_structure_cost_per_mile', label: 'Variable Cost per Mile' },
    ],
    converter: [
      { key: 'fixed_converter_cost', label: 'Fixed Cost per Converter' },
    ],
  };

  const CONTEXT_FIELDS = {
    conductor: [
      { path: '01_project_technical_details.project.conductor_type', label: 'Conductor Type',
        tooltip: 'The conductor type selected on the Project tab. Determines cost lookup.' },
    ],
    structure: [
      { path: '01_project_technical_details.project.construction_type', label: 'Construction Type',
        tooltip: 'The construction type selected on the Project tab (Overhead, Underground, Subsea).' },
    ],
    converter: [
      { path: '01_project_technical_details.project.converter_type', label: 'Converter Type',
        tooltip: 'The converter type selected on the Project tab (LCC or VSC).' },
      { path: '01_project_technical_details.project.number_of_converters', label: 'Number of Converters',
        tooltip: 'Number of converter stations from the Project tab.' },
    ],
  };

  const COST_TOOLTIPS = {
    variable_conductor_cost_per_mile: 'Per-mile conductor cost, multiplied by terrain-weighted miles in the calculator.',
    fixed_conductor_cost: 'One-time fixed conductor cost (non-zero for underground/subsea projects).',
    variable_structure_cost_per_mile: 'Per-mile structure cost, multiplied by terrain-weighted miles. Zero for underground/subsea.',
    fixed_converter_cost: 'Fixed cost per converter station. Multiplied by number of converters in the calculator.',
  };

  const SUBTAB_LABELS = {conductor: 'Conductor', structure: 'Structure', converter: 'Converter'};

  // Context displays (Pattern 4)
  (CONTEXT_FIELDS[subTabId] || []).forEach(ctx => {
    const display = document.createElement('div');
    display.className = 'readonly-miles-display';
    display.dataset.capitalContext = ctx.path;
    const lbl = document.createElement('span');
    lbl.className = 'readonly-miles-label';
    lbl.textContent = ctx.label + ':';
    lbl.appendChild(makeHelpIcon(ctx.tooltip));
    display.appendChild(lbl);
    const val = document.createElement('span');
    val.className = 'readonly-display-value';
    val.dataset.capitalContextValue = ctx.path;
    const el = document.querySelector(`[data-path="${ctx.path}"]`);
    val.textContent = el ? el.value : '—';
    display.appendChild(document.createTextNode(' '));
    display.appendChild(val);
    wrapper.appendChild(display);
  });

  // Contingency rate — render via C.taxonomy sections for the matching field
  const contingencyDiv = document.createElement('div');
  contingencyDiv.className = 'capital-cost-contingency';
  wrapper.appendChild(contingencyDiv);

  // Cost values table (Pattern 7)
  const costFields = COST_FIELDS[subTabId] || [];
  const entry = getBuildCostEntry();

  const table = document.createElement('table');
  table.className = 'forge-table capital-cost-table';
  const ccCaption = document.createElement('caption');
  ccCaption.textContent = (SUBTAB_LABELS[subTabId] || subTabId) + ' Build Costs';
  ccCaption.appendChild(makeHelpIcon('Unit build costs from the NREL/DOE database. Locked values are defaults; unlock to override.'));
  table.appendChild(ccCaption);

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  const thParam = document.createElement('th');
  thParam.textContent = 'Parameter';
  thParam.appendChild(makeHelpIcon('Build cost parameters for this component, sourced from the NREL/DOE database.'));
  headerRow.appendChild(thParam);
  const thValue = document.createElement('th');
  thValue.textContent = 'Value';
  thValue.appendChild(makeHelpIcon('Canonical cost value for current project config. Click the lock icon to override.'));
  headerRow.appendChild(thValue);
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const costInputs = [];
  let locked = true;
  const storageKey = `forge-suppress-${subTabId}-cost-warning`;

  const tbody = document.createElement('tbody');
  costFields.forEach(cf => {
    const tr = document.createElement('tr');
    const tdLabel = document.createElement('td');
    tdLabel.textContent = cf.label;
    tdLabel.style.fontWeight = '500';
    if (COST_TOOLTIPS[cf.key]) tdLabel.appendChild(makeHelpIcon(COST_TOOLTIPS[cf.key]));
    tr.appendChild(tdLabel);

    const tdVal = document.createElement('td');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'currency-input locked-cell';
    input.dataset.path = `10_project_category_build_costs.overrides.${cf.key}`;
    input.dataset.costKey = cf.key;
    input.readOnly = true;
    const val = entry ? entry[cf.key] : 0;
    input.value = formatCurrencyInput(val);
    input.addEventListener('focus', () => {
      if (!input.readOnly) input.value = String(parseCurrencyInput(input.value) ?? '');
    });
    input.addEventListener('blur', () => {
      const raw = parseCurrencyInput(input.value);
      if (raw !== null) input.value = formatCurrencyInput(raw);
    });
    costInputs.push(input);
    tdVal.appendChild(input);
    tr.appendChild(tdVal);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  const CC_SOURCE_LABELS = {
    conductor: 'NREL Transmission Line Cost Database (2024)',
    structure: 'NREL Transmission Structure Costs (2024)',
    converter: 'NREL Converter Station Costs (2024)',
  };

  const ccCard = document.createElement('div');
  ccCard.className = 'forge-table-card';
  const ccCardHeader = document.createElement('div');
  ccCardHeader.className = 'card-header';
  ccCardHeader.textContent = (SUBTAB_LABELS[subTabId] || subTabId) + ' Build Costs ';
  const ccLockPill = document.createElement('span');
  ccLockPill.className = 'lock-pill';
  ccLockPill.innerHTML = LOCK_SVG + ' Locked \u2014 click to override';
  ccCardHeader.appendChild(ccLockPill);
  ccCard.appendChild(ccCardHeader);
  ccCard.appendChild(table);
  const ccSource = document.createElement('div');
  ccSource.className = 'forge-source';
  ccSource.innerHTML = SOURCE_ICON_SVG + ' ' + (CC_SOURCE_LABELS[subTabId] || 'NREL/DOE Cost Database');
  ccCard.appendChild(ccSource);
  wrapper.appendChild(ccCard);

  function setCostLocked(isLocked) {
    locked = isLocked;
    costInputs.forEach(inp => {
      inp.readOnly = isLocked;
      if (isLocked) inp.classList.add('locked-cell');
      else inp.classList.remove('locked-cell');
    });
    ccLockPill.className = isLocked ? 'lock-pill' : 'lock-pill lock-pill--unlocked';
    ccLockPill.innerHTML = isLocked
      ? (LOCK_SVG + ' Locked \u2014 click to override')
      : (UNLOCK_SVG + ' Unlocked \u2014 editing');
  }

  ccLockPill.addEventListener('click', () => {
    if (!locked) { setCostLocked(true); return; }
    const suppressed = localStorage.getItem(storageKey) === 'true';
    if (suppressed) { setCostLocked(false); return; }
    showBuildCostConfirmDialog(subTabId, (suppress) => {
      if (suppress) localStorage.setItem(storageKey, 'true');
      setCostLocked(false);
    });
  });

  return wrapper;
}

function updateProjectTechnicalSubTabVisibility() {
  var ctEl = document.querySelector('[data-path="01_project_technical_details.project.construction_type"]');
  var acDcEl = document.querySelector('[data-path="01_project_technical_details.project.ac_dc"]');
  var isOverhead = ctEl && ctEl.value === 'Overhead';
  var isDC = acDcEl && acDcEl.value === 'DC';

  var converterSubItem = document.querySelector('.sidebar-subitem[data-sub-item-id="converter-details"]');
  if (converterSubItem) {
    converterSubItem.style.display = isDC ? '' : 'none';
  }

  var current = typeof getCurrentSubItem === 'function' ? getCurrentSubItem() : null;
  if (current && current.subItemId === 'converter-details' && !isDC) {
    if (typeof navigateToSubItem === 'function') {
      navigateToSubItem('equipment', 'conductor-details');
    }
  }
}

function updateCapitalCostSubTabVisibility() {
  var reconEl = document.querySelector('[data-path="01_project_technical_details.project.reconductoring"]');
  var acDcEl = document.querySelector('[data-path="01_project_technical_details.project.ac_dc"]');
  var ctEl = document.querySelector('[data-path="01_project_technical_details.project.construction_type"]');
  var isRecon = reconEl && reconEl.checked === true;
  var isAC = acDcEl && acDcEl.value === 'AC';
  var isOverhead = ctEl && ctEl.value === 'Overhead';

  // Hide structure contingency field if not overhead greenfield
  var structField = document.querySelector('[data-path*="structure_contingency"]');
  if (structField) {
    var row = structField.closest('.field-row') || structField.closest('.slider-row') || structField.parentElement;
    if (row) row.style.display = (isOverhead && !isRecon) ? '' : 'none';
  }

  // Hide converter contingency field if AC
  var convField = document.querySelector('[data-path*="converter_contingency"]');
  if (convField) {
    var row = convField.closest('.field-row') || convField.closest('.slider-row') || convField.parentElement;
    if (row) row.style.display = isAC ? 'none' : '';
  }
}

function rebuildCapitalCosts(fromConfigChange) {
  const entry = getBuildCostEntry();
  // Query across all sub-item containers (content-panel + offscreen holder)
  const searchRoot = document.querySelector('[data-tab-id="capital-costs"]') || document;

  searchRoot.querySelectorAll('.capital-cost-table input[data-cost-key]').forEach(input => {
    const val = entry ? (entry[input.dataset.costKey] ?? 0) : 0;
    input.value = formatCurrencyInput(val);
    input.readOnly = true;
    input.classList.add('locked-cell');
  });

  searchRoot.querySelectorAll('.capital-cost-table').forEach(table => {
    const card = table.closest('.forge-table-card');
    if (card) {
      const pill = card.querySelector('.lock-pill');
      if (pill) {
        pill.className = 'lock-pill';
        pill.innerHTML = LOCK_SVG + ' Locked \u2014 click to override';
      }
    }
  });

  // Update context displays
  searchRoot.querySelectorAll('[data-capital-context-value]').forEach(el => {
    const path = el.dataset.capitalContextValue;
    const src = document.querySelector(`[data-path="${path}"]`);
    el.textContent = src ? src.value : '—';
  });

  updateCapitalCostSubTabVisibility();

  if (fromConfigChange) {
    showToast('Build costs reset to defaults for new configuration');
  }
}

function renderInputsFromTaxonomy(data, taxonomyData, metadataList) {
  if (!taxonomyData || !metadataList) {
    console.error('Taxonomy or input metadata not loaded — cannot render inputs');
    return;
  }

  C.forgeJsonData = data;

  // Clear content-panel of old rendered sub-items (prevents ghost duplicates
  // when renderJsonInputs is called multiple times, e.g. default load → scenario load)
  var contentPanel = document.getElementById('content-panel');
  if (contentPanel) {
    Array.from(contentPanel.children).forEach(function(child) {
      if (child.id !== 'load-status') child.remove();
    });
  }

  // Create (or reuse) an off-screen holder so all sub-item containers live in the DOM
  // while not visible — this lets setTimeout-based event-listener setup find elements.
  var offscreen = document.getElementById('forge-offscreen-inputs');
  if (offscreen) offscreen.innerHTML = '';
  if (!offscreen) {
    offscreen = document.createElement('div');
    offscreen.id = 'forge-offscreen-inputs';
    offscreen.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden;pointer-events:none;';
    document.body.appendChild(offscreen);
  }
  C._renderedSubItems = {};
  C._currentSubItemId = null;

  const taxById = {};
  (taxonomyData.items || []).forEach(item => { taxById[item.id] = item; });

  C.INPUT_TAB_ORDER.forEach((tabId, tabIndex) => {
    const tabFields = metadataList.filter(f => f.input_tab === tabId && f.condition !== 'always_hidden');
    let subTabIds = [...new Set(tabFields.map(f => f.sub_tab).filter(Boolean))];
    if (tabId === 'project-identity') {
      subTabIds = ['technology', 'timeline'];
    }
    if (tabId === 'equipment') {
      subTabIds = ['conductor-details', 'converter-details'];
    }
    if (tabId === 'routing') {
      subTabIds = ['terrain-mix', 'rights-of-way'];
    }
    if (tabId === 'financial') {
      subTabIds = ['rates', 'afudc'];
    }
    if (tabId === 'capital-costs') {
      subTabIds = ['conductor', 'base-mitigation', 'credits'];
    }
    if (tabId === 'operating') {
      subTabIds = ['operational-insurance', 'vegetation-management', 'delay-costs'];
    }
    if (tabId === 'emissions') {
      subTabIds = ['energy-emissions-emissions'];
    }
    if (tabId === 'energy-mix') {
      subTabIds = ['energy-emissions-energy'];
    }
    if (tabId === 'risk') {
      subTabIds = ['wildfire-risk', 'outage-risk'];
    }
    if (tabId === 'benefits') {
      subTabIds = ['economic-details', 'system-constraints'];
    }

    if (subTabIds.length > 0) {
      // --- Build per-sub-item content containers for sidebar navigation ---

      subTabIds.forEach((stId, stIndex) => {
        const stContent = document.createElement('div');
        stContent.className = 'sub-tab-content';
        stContent.dataset.subTab = stId;
        const stFields = tabFields.filter(f => f.sub_tab === stId);

        if (stId === 'terrain-mix') {
          renderTabGuideBanner(stId, stContent);
          stContent.appendChild(renderTerrainTable(data));
        } else if (stId === 'rights-of-way') {
          renderTabGuideBanner(stId, stContent);
          // uses_existing_row toggle is now in Technology tab — wire its change listener here
          setTimeout(function() {
            var rowEl = document.querySelector('[data-path="01_project_technical_details.project.uses_existing_row"]');
            if (rowEl) rowEl.addEventListener('change', updateROWColumnVisibility);
          }, 0);
          const splitGrid = document.createElement('div');
          splitGrid.className = 'row-split-grid';
          const rowInputs = document.createElement('div');
          rowInputs.className = 'row-zone-inputs';
          rowInputs.appendChild(renderROWZonesTable(data));
          splitGrid.appendChild(rowInputs);
          splitGrid.appendChild(renderROWCostPanel());
          stContent.appendChild(splitGrid);
          updateROWColumnVisibility();

        } else if (stId === 'base-mitigation') {
          renderTabGuideBanner(stId, stContent);
          stContent.appendChild(renderEnvBaseMitigationTable(data));
        } else if (stId === 'credits') {
          renderTabGuideBanner(stId, stContent);
          stContent.appendChild(renderEnvCreditsTable(data));

        } else if (stId === 'conductor' || stId === 'structure' || stId === 'converter') {
          renderTabGuideBanner(stId, stContent);
          const subTabWrapper = renderCapitalCostSubTab(stId, data);
          stContent.appendChild(subTabWrapper);
          // Render contingency field into the designated container
          const contingencyContainer = subTabWrapper.querySelector('.capital-cost-contingency');
          if (contingencyContainer && stFields.length > 0) {
            renderTaxonomySections(contingencyContainer, stFields, data, taxById, stContent);
          }
        } else if (stId === 'conductor-details') {
          renderTabGuideBanner(stId, stContent);
          const cdInputs = document.createElement('div');
          cdInputs.className = 'details-editable-inputs';
          ['conductor_type', 'old_conductor_type'].forEach(fId => {
            const meta = tabFields.find(f => f.id === fId);
            if (meta) {
              const val = getValueAtFieldPath(data, meta.yaml_section, meta.field_path);
              cdInputs.appendChild(createFieldFromMetadata(meta, val));
            }
          });
          stContent.appendChild(cdInputs);
          stContent.appendChild(renderConductorDetailsTable());
        } else if (stId === 'structure-details') {
          renderTabGuideBanner(stId, stContent);
          stContent.appendChild(renderStructureDetailsTable());
        } else if (stId === 'converter-details') {
          renderTabGuideBanner(stId, stContent);
          const cvInputs = document.createElement('div');
          cvInputs.className = 'details-editable-inputs';
          ['converter_type', 'number_of_converters', 'old_converter_type'].forEach(fId => {
            const meta = tabFields.find(f => f.id === fId);
            if (meta) {
              const val = getValueAtFieldPath(data, meta.yaml_section, meta.field_path);
              cvInputs.appendChild(createFieldFromMetadata(meta, val));
            }
          });
          stContent.appendChild(cvInputs);
          stContent.appendChild(renderConverterDetailsTable());
        } else if (stId === 'maintenance-costs') {
          renderTabGuideBanner(stId, stContent);
          const l4Bar = document.createElement('div');
          l4Bar.className = 'l4-tabs';
          const l4Ids = ['conductor-maintenance', 'structure-maintenance', 'converter-maintenance'];
          const l4Panels = [];
          l4Ids.forEach((l4Id, l4Idx) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'l4-tab' + (l4Idx === 0 ? ' active' : '');
            btn.textContent = C.SUB_TAB_LABELS[l4Id] || l4Id;
            btn.appendChild(makeMethodologyIcon(l4Id));
            l4Bar.appendChild(btn);
            const panel = document.createElement('div');
            panel.className = 'sub-sub-tab-content';
            panel.dataset.subSubTab = l4Id;
            if (l4Idx > 0) panel.style.display = 'none';
            if (l4Id === 'conductor-maintenance') panel.appendChild(renderConductorMaintenanceTable());
            else if (l4Id === 'structure-maintenance') panel.appendChild(renderStructureMaintenanceTable());
            else if (l4Id === 'converter-maintenance') panel.appendChild(renderConverterMaintenanceTable());
            renderTabGuideBanner(l4Id, panel);
            l4Panels.push(panel);
            btn.addEventListener('click', () => {
              l4Bar.querySelectorAll('.l4-tab').forEach(b => b.classList.remove('active'));
              btn.classList.add('active');
              l4Panels.forEach(p => { p.style.display = p.dataset.subSubTab === l4Id ? '' : 'none'; });
            });
          });
          stContent.appendChild(l4Bar);
          l4Panels.forEach(p => stContent.appendChild(p));
        } else if (stId === 'operational-insurance') {
          renderTabGuideBanner(stId, stContent);
          stContent.appendChild(renderInsurableAssetsTable(data));
        } else if (stId === 'vegetation-management') {
          renderTabGuideBanner(stId, stContent);
          stContent.appendChild(renderVegetationManagementTable());
        } else if (stId === 'energy-emissions-energy') {
          renderTabGuideBanner(stId, stContent);
          const eL4Bar = document.createElement('div');
          eL4Bar.className = 'l4-tabs';
          const eL4Ids = ['energy-mix', 'energy-losses'];
          const eL4Panels = [];
          eL4Ids.forEach((l4Id, l4Idx) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'l4-tab' + (l4Idx === 0 ? ' active' : '');
            btn.textContent = C.SUB_TAB_LABELS[l4Id] || l4Id;
            btn.appendChild(makeMethodologyIcon(l4Id));
            eL4Bar.appendChild(btn);
            const panel = document.createElement('div');
            panel.className = 'sub-sub-tab-content';
            panel.dataset.subSubTab = l4Id;
            if (l4Idx > 0) panel.style.display = 'none';
            if (l4Id === 'energy-mix') {
              renderTabGuideBanner(l4Id, panel);
              const emSplit = document.createElement('div');
              emSplit.className = 'row-split-grid';
              const emInputs = document.createElement('div');
              emInputs.className = 'row-zone-inputs';
              emInputs.appendChild(renderEnergyMixTable(data));
              emSplit.appendChild(emInputs);
              emSplit.appendChild(renderEnergyImpactPanel());
              panel.appendChild(emSplit);
            } else if (l4Id === 'energy-losses') {
              panel.appendChild(renderLossesPanel(data));
              renderTabGuideBanner(l4Id, panel);
            }
            eL4Panels.push(panel);
            btn.addEventListener('click', () => {
              eL4Bar.querySelectorAll('.l4-tab').forEach(b => b.classList.remove('active'));
              btn.classList.add('active');
              eL4Panels.forEach(p => { p.style.display = p.dataset.subSubTab === l4Id ? '' : 'none'; });
            });
          });
          stContent.appendChild(eL4Bar);
          eL4Panels.forEach(p => stContent.appendChild(p));
        } else if (stId === 'energy-emissions-emissions') {
          renderTabGuideBanner(stId, stContent);
          const emisSplit = document.createElement('div');
          emisSplit.className = 'row-split-grid';
          const emisInputs = document.createElement('div');
          emisInputs.className = 'row-zone-inputs';
          emisInputs.appendChild(renderIntensityTable(data));
          emisInputs.appendChild(renderExternalityCostTable(data));
          emisSplit.appendChild(emisInputs);
          emisSplit.appendChild(renderEmissionsImpactPanel());
          stContent.appendChild(emisSplit);
        } else if (stId === 'wildfire-risk') {
          renderTabGuideBanner(stId, stContent);
          stContent.appendChild(renderWildfireRiskPanel(data));
        } else if (stId === 'outage-risk') {
          renderTabGuideBanner(stId, stContent);
          stContent.appendChild(renderOutageRiskPanel(data));
        } else if (stId === 'rates') {
          renderTabGuideBanner('rates', stContent);
          stContent.appendChild(renderFinancialRatesPanel(data));
        } else if (stId === 'afudc') {
          renderTabGuideBanner('afudc', stContent);
          stContent.appendChild(renderFinancialAFUDCPanel(data));
        } else if (stId === 'economic-details') {
          renderTabGuideBanner(stId, stContent);
          stContent.appendChild(renderEconomicDetailsPanel(data));
        } else if (stId === 'system-constraints') {
          renderTabGuideBanner(stId, stContent);
          stContent.appendChild(renderConstraintsPanel(data));
        } else if (stId === 'technology' || stId === 'timeline') {
          renderTabGuideBanner(stId, stContent);
          renderTaxonomySections(stContent, stFields, data, taxById, stContent);
          if (stId === 'technology') {
            const voltageDisplay = document.createElement('div');
            voltageDisplay.className = 'form-field form-field-readonly';
            voltageDisplay.id = 'config-voltage-display';
            const vLabel = document.createElement('label');
            const vLabelText = document.createElement('span');
            vLabelText.textContent = 'Voltage (kV)';
            vLabel.appendChild(vLabelText);
            vLabel.appendChild(makeHelpIcon('Operating voltage determined by your project configuration. This value cannot be changed independently.'));
            voltageDisplay.appendChild(vLabel);
            const vValue = document.createElement('span');
            vValue.className = 'form-field-readonly-value';
            vValue.dataset.voltageDisplay = '';
            const cdEntry = getCircuitDetailsEntry();
            vValue.textContent = cdEntry?.voltage_kv != null ? cdEntry.voltage_kv + ' kV' : '\u2014';
            voltageDisplay.appendChild(vValue);
            const capField = stContent.querySelector('[data-field-path="01_project_technical_details.project.capacity_mw"]');
            if (capField) capField.after(voltageDisplay);
            else stContent.prepend(voltageDisplay);

            const oldVoltageDisplay = document.createElement('div');
            oldVoltageDisplay.className = 'form-field form-field-readonly';
            oldVoltageDisplay.id = 'config-old-voltage-display';
            oldVoltageDisplay.style.display = 'none';
            const ovLabel = document.createElement('label');
            const ovLabelText = document.createElement('span');
            ovLabelText.textContent = 'Old Voltage (kV)';
            ovLabel.appendChild(ovLabelText);
            ovLabel.appendChild(makeHelpIcon('Operating voltage of the existing line, determined by old-line configuration.'));
            oldVoltageDisplay.appendChild(ovLabel);
            const ovValue = document.createElement('span');
            ovValue.className = 'form-field-readonly-value';
            ovValue.dataset.oldVoltageDisplay = '';
            const oldCdEntry = getOldCircuitDetailsEntry();
            ovValue.textContent = oldCdEntry?.voltage_kv != null ? oldCdEntry.voltage_kv + ' kV' : '\u2014';
            oldVoltageDisplay.appendChild(ovValue);
            const oldCapField = stContent.querySelector('[data-field-path="01_project_technical_details.project.old_capacity_mw"]');
            if (oldCapField) oldCapField.after(oldVoltageDisplay);
          }
        } else if (stId === 'delay-costs') {
          renderTabGuideBanner(stId, stContent);
          renderTaxonomySections(stContent, stFields, data, taxById, stContent);
          // Build delay cost totals table and split grid
          const delayTable = document.createElement('table');
          delayTable.className = 'forge-table';
          delayTable.id = 'delay-cost-table';
          const delayCaption = document.createElement('caption');
          delayCaption.textContent = 'Annual Delay Costs';
          delayCaption.appendChild(makeHelpIcon('Annual out-of-pocket costs during the pre-construction delay period.'));
          delayTable.appendChild(delayCaption);
          const delayThead = document.createElement('thead');
          const dHRow = document.createElement('tr');
          const dThCat = document.createElement('th');
          dThCat.textContent = 'Category';
          dHRow.appendChild(dThCat);
          const dThCost = document.createElement('th');
          dThCost.textContent = '$/year';
          dHRow.appendChild(dThCost);
          delayThead.appendChild(dHRow);
          delayTable.appendChild(delayThead);
          const delayTbody = document.createElement('tbody');
          let delayTotal = 0;
          const delayInputs = stContent.querySelectorAll('input[data-path*="annual_delay_costs"]');
          delayInputs.forEach(inp => {
            const dTr = document.createElement('tr');
            const dTdLabel = document.createElement('td');
            const dPathParts = inp.dataset.path.split('.');
            const dKey = dPathParts[dPathParts.length - 1];
            dTdLabel.textContent = dKey.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            dTdLabel.style.fontWeight = '500';
            dTr.appendChild(dTdLabel);
            const dTdVal = document.createElement('td');
            dTdVal.appendChild(inp);
            dTdVal.appendChild(makeEquationIcon({...EQ_DELAY_ANNUAL, context: `Annual ${dTdLabel.textContent.toLowerCase()} cost during the delay/permitting period.`}));
            dTr.appendChild(dTdVal);
            delayTbody.appendChild(dTr);
            const dRaw = parseFloat(String(inp.value).replace(/[$,]/g, '')) || 0;
            delayTotal += dRaw;
          });
          const dTotalRow = document.createElement('tr');
          dTotalRow.className = 'row-total-row';
          const dTdTotLabel = document.createElement('td');
          dTdTotLabel.textContent = 'TOTAL';
          dTdTotLabel.style.fontWeight = '700';
          dTotalRow.appendChild(dTdTotLabel);
          const dTdTotVal = document.createElement('td');
          dTdTotVal.id = 'delay-cost-total';
          dTdTotVal.style.fontWeight = '600';
          dTdTotVal.textContent = '$' + delayTotal.toLocaleString();
          dTotalRow.appendChild(dTdTotVal);
          delayTbody.appendChild(dTotalRow);
          delayTable.appendChild(delayTbody);
          const updateDelayTotal = () => {
            let dSum = 0;
            delayTable.querySelectorAll('input[data-path*="annual_delay_costs"]').forEach(di => {
              const dR = parseFloat(String(di.value).replace(/[$,]/g, ''));
              if (!isNaN(dR)) dSum += dR;
            });
            dTdTotVal.textContent = '$' + dSum.toLocaleString();
          };
          delayTable.addEventListener('input', updateDelayTotal);
          const delaySplitGrid = document.createElement('div');
          delaySplitGrid.className = 'row-split-grid';
          const delayInputsWrapper = document.createElement('div');
          delayInputsWrapper.className = 'row-zone-inputs';
          delayInputsWrapper.appendChild(delayTable);
          delaySplitGrid.appendChild(delayInputsWrapper);
          delaySplitGrid.appendChild(renderDelayCostPanel());
          const dGuideBanner = stContent.querySelector('.tab-guide-banner');
          while (stContent.firstChild) stContent.removeChild(stContent.firstChild);
          if (dGuideBanner) stContent.appendChild(dGuideBanner);
          stContent.appendChild(delaySplitGrid);
        }

        // Store in registry and move to offscreen holder (preserves all event listeners)
        C._renderedSubItems[stId] = stContent;
        offscreen.appendChild(stContent);
      });

      // Wire up tab-specific listeners after DOM is built
      if (tabId === 'capital-costs') {
        setTimeout(() => {
          const acDcEl = document.querySelector('[data-path="01_project_technical_details.project.ac_dc"]');
          const condEl = document.querySelector('[data-path="01_project_technical_details.project.conductor_type"]');
          if (acDcEl) acDcEl.addEventListener('change', () => { updateEnvironmentalAcres(); });
          if (condEl) condEl.addEventListener('change', () => { updateEnvironmentalAcres(); });
          updateEnvironmentalAcres();
        }, 0);
      } else if (tabId === 'project-identity') {
        setTimeout(() => {
          const reconEl = document.querySelector('[data-path="01_project_technical_details.project.reconductoring"]');
          const rowEl = document.querySelector('[data-path="01_project_technical_details.project.uses_existing_row"]');
          if (reconEl) reconEl.addEventListener('change', updateROWColumnVisibility);
          if (reconEl) reconEl.addEventListener('change', () => {
            if (!reconEl.checked) return;
            const getVal = p => document.querySelector(`[data-path="${p}"]`)?.value || '';
            const setVal = (p, v) => { const el = document.querySelector(`[data-path="${p}"]`); if (el && v) el.value = v; };
            setVal('01_project_technical_details.project.old_ac_dc', getVal('01_project_technical_details.project.ac_dc'));
            const oldAcDcEl = document.querySelector('[data-path="01_project_technical_details.project.old_ac_dc"]');
            if (oldAcDcEl) oldAcDcEl.dispatchEvent(new Event('change'));

            setVal('01_project_technical_details.project.old_capacity_mw', getVal('01_project_technical_details.project.capacity_mw'));
            const oldCapEl = document.querySelector('[data-path="01_project_technical_details.project.old_capacity_mw"]');
            if (oldCapEl) oldCapEl.dispatchEvent(new Event('change'));

            setVal('01_project_technical_details.project.old_conductor_type', getVal('01_project_technical_details.project.conductor_type'));
            const oldCondEl = document.querySelector('[data-path="01_project_technical_details.project.old_conductor_type"]');
            if (oldCondEl) oldCondEl.dispatchEvent(new Event('change'));

            setVal('01_project_technical_details.project.old_converter_type', getVal('01_project_technical_details.project.converter_type'));
            const oldConvEl = document.querySelector('[data-path="01_project_technical_details.project.old_converter_type"]');
            if (oldConvEl) oldConvEl.dispatchEvent(new Event('change'));

            setTimeout(rebuildConductorDetails, 0);
          });
          if (rowEl) rowEl.addEventListener('change', updateROWColumnVisibility);
          updateROWColumnVisibility();

          const paths = [
            '01_project_technical_details.project.construction_type',
            '01_project_technical_details.project.ac_dc',
            '01_project_technical_details.project.capacity_mw',
            '01_project_technical_details.project.conductor_type',
            '01_project_technical_details.project.converter_type',
          ];
          paths.forEach(p => {
            const el = document.querySelector(`[data-path="${p}"]`);
            if (el) {
              el.addEventListener('change', () => {
                setTimeout(rebuildConductorDetails, 0);
                setTimeout(rebuildStructureDetails, 0);
                setTimeout(rebuildConverterDetails, 0);
                setTimeout(updateProjectTechnicalSubTabVisibility, 0);
                setTimeout(updateAcDcWarning, 0);
              });
            }
          });
          // Old-line fields + reconductoring toggle → rebuild Conductor & Converter Details (Old Value columns)
          const oldPaths = [
            '01_project_technical_details.project.reconductoring',
            '01_project_technical_details.project.old_capacity_mw',
            '01_project_technical_details.project.old_conductor_type',
            '01_project_technical_details.project.old_ac_dc',
            '01_project_technical_details.project.old_converter_type',
          ];
          oldPaths.forEach(p => {
            const el = document.querySelector(`[data-path="${p}"]`);
            if (el) {
              el.addEventListener('change', () => {
                setTimeout(rebuildConductorDetails, 0);
                setTimeout(rebuildConverterDetails, 0);
                setTimeout(updateProjectTechnicalSubTabVisibility, 0);
                setTimeout(updateAcDcWarning, 0);
                setTimeout(() => {
                  const ovEl = document.querySelector('[data-old-voltage-display]');
                  if (ovEl) {
                    const entry = getOldCircuitDetailsEntry();
                    ovEl.textContent = entry?.voltage_kv != null ? entry.voltage_kv + ' kV' : '\u2014';
                  }
                }, 0);
              });
            }
          });
          const numConvEl = document.querySelector('[data-path="01_project_technical_details.project.number_of_converters"]');
          if (numConvEl) numConvEl.addEventListener('change', () => setTimeout(rebuildConverterDetails, 0));
          setTimeout(() => {
            rebuildConductorDetails();
            rebuildStructureDetails();
            rebuildConverterDetails();
            updateProjectTechnicalSubTabVisibility();
            updateAcDcWarning();
          }, 200);
        }, 0);
      } else if (tabId === 'operating') {
        setTimeout(() => {
          const paths = [
            '01_project_technical_details.project.construction_type',
            '01_project_technical_details.project.ac_dc',
            '01_project_technical_details.project.capacity_mw',
            '01_project_technical_details.project.conductor_type',
            '01_project_technical_details.project.converter_type',
          ];
          paths.forEach(p => {
            const el = document.querySelector(`[data-path="${p}"]`);
            if (el) {
              el.addEventListener('change', () => {
                setTimeout(rebuildConductorMaintenance, 0);
                setTimeout(rebuildStructureMaintenance, 0);
                setTimeout(rebuildConverterMaintenance, 0);
                setTimeout(rebuildVegetationManagement, 0);
                setTimeout(updateMaintenanceSubTabVisibility, 0);
              });
            }
          });
          setTimeout(() => {
            rebuildConductorMaintenance();
            rebuildStructureMaintenance();
            rebuildConverterMaintenance();
            rebuildVegetationManagement();
            updateMaintenanceSubTabVisibility();
          }, 200);
        }, 0);
      } else if (tabId === 'emissions') {
        setTimeout(() => {
          const paths = [
            '01_project_technical_details.project.construction_type',
            '01_project_technical_details.project.ac_dc',
            '01_project_technical_details.project.capacity_mw',
            '01_project_technical_details.project.conductor_type',
            '01_project_technical_details.project.converter_type',
            '01_project_technical_details.project.reconductoring',
          ];
          paths.forEach(p => {
            const el = document.querySelector(`[data-path="${p}"]`);
            if (el) {
              el.addEventListener('change', () => {
                setTimeout(rebuildLineLossParameters, 0);
              });
            }
          });
          const oldPaths = [
            '01_project_technical_details.project.old_capacity_mw',
            '01_project_technical_details.project.old_conductor_type',
            '01_project_technical_details.project.old_ac_dc',
          ];
          oldPaths.forEach(p => {
            const el = document.querySelector(`[data-path="${p}"]`);
            if (el) {
              el.addEventListener('change', () => {
                setTimeout(rebuildLineLossParameters, 0);
              });
            }
          });
          setTimeout(rebuildLineLossParameters, 200);
        }, 0);
      } else if (tabId === 'risk') {
        setTimeout(() => {
          const ctEl = document.querySelector('[data-path="01_project_technical_details.project.construction_type"]');
          if (ctEl) {
            ctEl.addEventListener('change', () => {
              setTimeout(() => rebuildRiskPanels(C.forgeJsonData), 0);
            });
          }
        }, 0);
      } else if (tabId === 'benefits') {
        setTimeout(() => {
          const reconEl = document.querySelector('[data-path="01_project_technical_details.project.reconductoring"]');
          if (reconEl) {
            reconEl.addEventListener('change', () => {
              setTimeout(() => rebuildConstraintsPanel(C.forgeJsonData), 0);
            });
          }
        }, 0);
      }

    }

  });

  // Attach global form listeners for cross-tab update functions
  var forgeFormEl = document.getElementById('demo-form');
  if (forgeFormEl) {
    forgeFormEl.addEventListener('input', function() {
      updateEnvironmentalAcres();
    });
  }

  // Clear load status — data is now rendered in sub-item containers
  var loadStatusEl = document.getElementById('load-status');
  if (loadStatusEl) loadStatusEl.style.display = 'none';

  setupTaxonomyConditionalVisibility();

  // Fix 5: Inject timing validation warnings and wire listeners on the Financial tab
  setTimeout(() => {
    const timingCategories = [
      'build_costs', 'row_acquisition', 'row_holding', 'row_rent',
      'environmental_mitigation_base', 'environmental_mitigation_credits',
      'delay_costs', 'operations_and_maintenance', 'construction_insurance'
    ];
    timingCategories.forEach(cat => {
      const base = `19_cost_timing_patterns.cost_timing_patterns.${cat}`;
      const constEl = document.querySelector(`[data-path="${base}.during_construction"]`);
      if (constEl) {
        const formField = constEl.closest('.form-field');
        if (formField && !formField.parentElement.querySelector('.timing-validation-warning')) {
          const warn = document.createElement('div');
          warn.className = 'timing-validation-warning';
          formField.after(warn);
        }
      }
      ['during_delay', 'during_construction', 'afudc_eligible'].forEach(field => {
        const el = document.querySelector(`[data-path="${base}.${field}"]`);
        if (el) {
          el.addEventListener('change', validateCostTimingPatterns);
          el.addEventListener('input', validateCostTimingPatterns);
        }
      });
    });
    validateCostTimingPatterns();
  }, 0);

  // Fix 6: Inject category validation banner and wire listeners on the Technology sub-item
  setTimeout(() => {
    const configPanel = (C._renderedSubItems && C._renderedSubItems['technology']) ||
      document.querySelector('[data-sub-tab="technology"]');
    if (configPanel && !document.getElementById('category-validation-banner')) {
      const banner = document.createElement('div');
      banner.className = 'forge-validation-banner';
      banner.id = 'category-validation-banner';
      banner.style.display = 'none';
      banner.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> <span class="banner-text"></span>';
      configPanel.prepend(banner);
    }

    function updateCategoryBanner() {
      const banner = document.getElementById('category-validation-banner');
      if (!banner) return;
      const result = validateCategoryString();
      if (result.valid || result.reason === 'Incomplete category fields') {
        banner.style.display = 'none';
      } else {
        banner.style.display = '';
        banner.querySelector('.banner-text').textContent = result.reason;
      }
    }

    const catPaths = [
      '01_project_technical_details.project.construction_type',
      '01_project_technical_details.project.ac_dc',
      '01_project_technical_details.project.capacity_mw',
      '01_project_technical_details.project.conductor_type',
      '01_project_technical_details.project.converter_type',
    ];
    catPaths.forEach(p => {
      const el = document.querySelector(`[data-path="${p}"]`);
      if (el) el.addEventListener('change', () => setTimeout(updateCategoryBanner, 0));
    });
    setTimeout(updateCategoryBanner, 100);
  }, 0);
}

function setupTaxonomyConditionalVisibility() {
  const acDcPath = '01_project_technical_details.project.ac_dc';
  const reconPath = '01_project_technical_details.project.reconductoring';
  const oldAcDcPath = '01_project_technical_details.project.old_ac_dc';

  function updateVisibility() {
    const acDcEl = document.querySelector(`[data-path="${acDcPath}"]`);
    const reconEl = document.querySelector(`[data-path="${reconPath}"]`);
    const oldAcDcEl = document.querySelector(`[data-path="${oldAcDcPath}"]`);
    const isDC = acDcEl?.value === 'DC';
    const isRecon = reconEl?.checked === true;
    const isOldDC = oldAcDcEl?.value === 'DC';

    document.querySelectorAll('.form-field[data-conditional="true"]').forEach(field => {
      const path = field.dataset.fieldPath;
      if (!path || !C.inputMetadata) return;
      const meta = C.inputMetadata.find(m => m.yaml_section + '.' + m.field_path === path);
      if (!meta) return;
      if (meta.condition === 'dc_only') {
        field.style.display = isDC ? '' : 'none';
      } else if (meta.condition === 'reconductoring_only') {
        field.style.display = isRecon ? '' : 'none';
      } else if (meta.condition === 'old_dc_only') {
        field.style.display = (isRecon && isOldDC) ? '' : 'none';
      }
    });

    const oldVoltEl = document.getElementById('config-old-voltage-display');
    if (oldVoltEl) oldVoltEl.style.display = isRecon ? '' : 'none';
  }

  setTimeout(() => {
    const acDcEl = document.querySelector(`[data-path="${acDcPath}"]`);
    const reconEl = document.querySelector(`[data-path="${reconPath}"]`);
    const oldAcDcEl = document.querySelector(`[data-path="${oldAcDcPath}"]`);
    if (acDcEl) acDcEl.addEventListener('change', updateVisibility);
    if (reconEl) reconEl.addEventListener('change', updateVisibility);
    if (oldAcDcEl) oldAcDcEl.addEventListener('change', updateVisibility);
    updateVisibility();
  }, 0);
}

// =============================================
// Reset to Defaults
// =============================================
let originalJsonData = null;
let snapshotOriginalData = null;

function resetFieldToDefault(path) {
  const restoreSource = snapshotOriginalData || originalJsonData;
  if (!restoreSource) return;

  // Navigate to the value in original data
  const keys = path.split('.');
  let value = restoreSource;
  for (const key of keys) {
    if (value && typeof value === 'object') {
      value = value[key];
    } else {
      value = undefined;
      break;
    }
  }

  // Find and reset the input
  const input = document.querySelector(`input[data-path="${path}"], select[data-path="${path}"]`);
  if (!input) return;

  if (input.type === 'checkbox') {
    input.checked = Boolean(value);
    input.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (input.tagName === 'SELECT') {
    input.value = value !== null && value !== undefined ? String(value) : '';
    input.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (input.classList.contains('currency-input')) {
    input.value = formatCurrencyInput(value);
    input.dataset.rawValue = value;
  } else if (input.classList.contains('percentage-input')) {
    input.value = formatPercentageInput(value);
    input.dataset.rawValue = value;
  } else if (input.classList.contains('number-input')) {
    input.value = formatNumberInput(value);
    input.dataset.rawValue = value;
  } else if (input.classList.contains('slider-value')) {
    // Pct sliders display ×100
    input.value = input.classList.contains('slider-pct') ? +(value * 100).toPrecision(6) : value;
    // Update the associated range slider
    const container = input.closest('.slider-container');
    if (container) {
      const range = container.querySelector('input[type="range"]');
      if (range) {
        range.value = value; // range always stores decimal
        range.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  } else {
    input.value = value !== null && value !== undefined ? String(value) : '';
  }
}

function resetSectionToDefaults(sectionPath) {
  // Find all inputs within this section
  const inputs = document.querySelectorAll(`input[data-path^="${sectionPath}"], select[data-path^="${sectionPath}"]`);
  inputs.forEach(input => {
    const path = input.dataset.path;
    if (path) {
      resetFieldToDefault(path);
    }
  });

}

// Shared utility: get terrain names with non-zero miles
function getActiveTerrains() {
  const terrains = ['forested', 'scrubbed_flat', 'wetland', 'farmland', 'desert_barren', 'urban', 'rolling_hills', 'mountain', 'subsea'];
  return terrains.filter(t => {
    const input = document.querySelector(`input[data-path="02_project_physical_details.terrain.terrain_miles.${t}"]`);
    if (!input) return false;
    const val = parseNumberInput(input.value);
    return val !== null && val > 0;
  });
}

// Update locked discount rate when social discount rate changes
function updateLockedDiscountRate() {
  const socialRateInput = document.querySelector('input[data-path="03_financing.financial.social_discount_rate"]');
  const display = document.getElementById('locked-discount-rate-display');
  if (!socialRateInput || !display) return;
  // slider-pct inputs already store as %, read directly
  const val = parseFloat(socialRateInput.value) || 0;
  display.value = val.toFixed(2) + '%';
}

const FUEL_MIX_SOURCE_KEYS = ['coal', 'oil', 'natural_gas', 'solar', 'wind', 'hydro', 'nuclear', 'other'];
const GRID_MIX_GROUPS = ['initial', 'rate_pre_cod', 'rate_post_cod'];

function syncFuelMixPresetBarVisibility() {
  const bar = document.getElementById('fuel-mix-preset-bar');
  if (!bar) return;
  const inputMode = Array.from(document.querySelectorAll('input[name="forge-input-mode"]')).find((input) => input.checked)?.value ?? 'json';
  bar.style.display = inputMode === 'json' ? '' : 'none';
}

function applyGridMixPreset(gridMix) {
  const energyMixTab = (C._renderedSubItems && C._renderedSubItems['energy-emissions-energy']) ||
    document.querySelector('[data-sub-tab="energy-emissions-energy"]');
  if (!energyMixTab || !gridMix) return;
  GRID_MIX_GROUPS.forEach(group => {
    const block = gridMix[group];
    if (!block || typeof block !== 'object') return;
    FUEL_MIX_SOURCE_KEYS.forEach(src => {
      const val = block[src];
      if (typeof val !== 'number' || Number.isNaN(val)) return;
      const path = `18_energy_source_mix.grid_mix.${group}.${src}`;
      const inp = energyMixTab.querySelector(`input[data-path="${path}"]`);
      if (!inp) return;
      if (group === 'initial') {
        inp.value = formatNumberInput(val);
        inp.dataset.rawValue = String(val);
      } else {
        inp.value = formatPercentageInput(val);
        inp.dataset.rawValue = String(val);
      }
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });
}

/** @deprecated Use applyGridMixPreset — accepts legacy energy_source_mix shape for compatibility. */
function applyEnergySourceMixPreset(mix) {
  if (!mix) return;
  if (mix.initial || mix.rate_pre_cod || mix.rate_post_cod) {
    applyGridMixPreset(mix);
    return;
  }
  const gridMix = {
    initial: {},
    rate_pre_cod: {},
    rate_post_cod: {},
  };
  FUEL_MIX_SOURCE_KEYS.forEach(src => {
    const block = mix[src];
    if (!block || typeof block !== 'object') return;
    gridMix.initial[src] = Number(block.percentage) || 0;
    const rate = typeof block.rate_of_change === 'number' ? block.rate_of_change : 0;
    gridMix.rate_pre_cod[src] = rate;
    gridMix.rate_post_cod[src] = rate;
  });
  applyGridMixPreset(gridMix);
}

function makeEmissionIntensitiesCollapsible() {
  const emissionsTab = (C._renderedSubItems && C._renderedSubItems['energy-emissions-emissions']) ||
    document.querySelector('[data-tab-id="emissions"]') ||
    document.querySelector('[data-sub-tab="energy-emissions-emissions"]');
  if (!emissionsTab) return;
  emissionsTab.querySelectorAll('.subsection-header, .section-header').forEach(h => {
    const text = h.textContent.trim().toLowerCase();
    if (text.includes('emission intensities') || text.includes('emission_intensities')) {
      h.classList.add('collapsible-header');
      h.textContent = 'Advanced: Emission Intensities (kg/MWh)';
      const headerRow = h.closest('.section-header-row') || h;
      const wrapper = document.createElement('div');
      wrapper.className = 'collapsible-content';
      let sibling = headerRow.nextElementSibling;
      const toWrap = [];
      while (sibling && !sibling.classList.contains('section-header-row')
             && !sibling.classList.contains('tab-section-header')) {
        toWrap.push(sibling);
        sibling = sibling.nextElementSibling;
      }
      if (toWrap.length > 0) {
        headerRow.parentNode.insertBefore(wrapper, toWrap[0]);
        toWrap.forEach(el => wrapper.appendChild(el));
      }
      h.addEventListener('click', () => {
        h.classList.toggle('expanded');
        wrapper.classList.toggle('expanded');
      });
    }
  });
}

// =============================================
// Modified renderJsonInputs (monkey-patched)
// =============================================
/** Lift legacy energy_source_mix from 16_emissions_reductions into 18_energy_source_mix when 18 is absent;
 *  migrate old two-mix structure to grid_mix when needed. */
function _allZeroLegacyMix(mix) {
  if (!mix || typeof mix !== 'object') return true;
  return FUEL_MIX_SOURCE_KEYS.every(s => (mix[s]?.percentage || 0) === 0);
}

function migrateOldMixToGridMix(old) {
  const cf = old.counterfactual_energy_source_mix;
  const esm = old.energy_source_mix;
  let initial;
  let rate_pre_cod;
  if (!_allZeroLegacyMix(cf)) {
    initial = Object.fromEntries(FUEL_MIX_SOURCE_KEYS.map(s => [s, cf[s]?.percentage || 0]));
    rate_pre_cod = Object.fromEntries(FUEL_MIX_SOURCE_KEYS.map(s => [s, cf[s]?.rate_of_change || 0]));
  } else {
    initial = Object.fromEntries(FUEL_MIX_SOURCE_KEYS.map(s => [s, esm?.[s]?.percentage || 0]));
    rate_pre_cod = Object.fromEntries(FUEL_MIX_SOURCE_KEYS.map(s => [s, 0]));
  }
  const rate_post_cod = { ...rate_pre_cod };
  if (esm) {
    FUEL_MIX_SOURCE_KEYS.forEach(s => {
      if (typeof esm[s]?.rate_of_change === 'number') {
        rate_post_cod[s] = esm[s].rate_of_change;
      }
    });
  }
  return { grid_mix: { initial, rate_pre_cod, rate_post_cod } };
}

function normalizeEnergySourceMixInCombinedData(data) {
  if (!data || typeof data !== 'object') return data;
  const out = JSON.parse(JSON.stringify(data));
  let block18 = out['18_energy_source_mix'];
  const er = out['16_emissions_reductions'] && out['16_emissions_reductions'].emissions_reductions;
  const legacyMix = er && er.energy_source_mix;
  if (!block18 && legacyMix && typeof legacyMix === 'object') {
    block18 = { energy_source_mix: JSON.parse(JSON.stringify(legacyMix)) };
    out['18_energy_source_mix'] = block18;
    delete er.energy_source_mix;
  }
  if (block18 && typeof block18 === 'object' && !block18.grid_mix) {
    out['18_energy_source_mix'] = migrateOldMixToGridMix(block18);
  }
  return out;
}

function renderJsonInputs(data) {
  const normalized = normalizeEnergySourceMixInCombinedData(data);
  originalJsonData = JSON.parse(JSON.stringify(normalized));
  var activeSubItem = C._currentSubItemId;
  renderInputsFromTaxonomy(normalized, C.taxonomy, C.inputMetadata);
  if (activeSubItem && C._renderedSubItems && C._renderedSubItems[activeSubItem]) {
    renderSubItemContent(activeSubItem);
  }
}

function renderSubItemContent(subItemId) {
  var contentPanel = document.getElementById('content-panel');
  var offscreen = document.getElementById('forge-offscreen-inputs');
  if (!contentPanel) return;

  var container = C._renderedSubItems && C._renderedSubItems[subItemId];
  if (!container) {
    console.warn('renderSubItemContent: no container for sub-item:', subItemId);
    return;
  }

  // Move current sub-item contents back to offscreen (preserves DOM nodes, event listeners, input values)
  if (offscreen) {
    Array.from(contentPanel.children).forEach(function(child) {
      if (child.id !== 'load-status') {
        offscreen.appendChild(child);
      }
    });
  }

  // Move requested container to content-panel
  contentPanel.appendChild(container);
  C._currentSubItemId = subItemId;

  if (subItemId && !subItemId.startsWith('r-')) {
    var contentHeader = document.getElementById('content-header');
    if (contentHeader) {
      var oldBtn = contentHeader.querySelector('.restore-defaults-btn');
      if (oldBtn) oldBtn.remove();

      var restoreBtn = document.createElement('button');
      restoreBtn.type = 'button';
      restoreBtn.className = 'restore-defaults-btn';
      restoreBtn.textContent = 'Restore Defaults';
      restoreBtn.style.cssText = 'margin-left:auto;padding:0.3rem 0.75rem;font-size:0.75rem;background:white;border:1px solid rgba(0,0,0,0.15);border-radius:4px;cursor:pointer;color:#666;font-family:inherit;';
      restoreBtn.addEventListener('click', function() {
        var subId = C._currentSubItemId;
        if (!subId) return;
        showRestoreDefaultsDialog('forge-restore-sub-' + subId, subId.replace(/-/g, ' '), function() {
          var panel = document.getElementById('content-panel');
          if (!panel) return;
          panel.querySelectorAll('input[data-path], select[data-path]').forEach(function(el) {
            if (el.dataset.path) resetFieldToDefault(el.dataset.path);
          });
          if (typeof showToast === 'function') showToast('Defaults restored');
        });
      });
      contentHeader.appendChild(restoreBtn);
    }
  }
}


// Public API — only exports actually used by other modules
window.calculateROWMilesTotal = calculateROWMilesTotal;
window.getEnergyDeliveredGWh = getEnergyDeliveredGWh;
window.isGreenfieldROW = isGreenfieldROW;
window.isReconductoring = isReconductoring;
window.parseCurrencyInput = parseCurrencyInput;
window.parseNumberInput = parseNumberInput;
window.parsePercentageInput = parsePercentageInput;
window.projectFuelMix = projectFuelMix;
window.readFuelRates = readFuelRates;
window.readFuelShares = readFuelShares;
window.renderJsonInputs = renderJsonInputs;
window.renderSubItemContent = renderSubItemContent;
window.setSnapshotOriginalData = function(data) {
  snapshotOriginalData = data ? JSON.parse(JSON.stringify(data)) : null;
};
window.syncFuelMixPresetBarVisibility = syncFuelMixPresetBarVisibility;
window.applyGridMixPreset = applyGridMixPreset;
window.applyEnergySourceMixPreset = applyEnergySourceMixPreset;
window.updateFuelMixChart = updateFuelMixChart;
window.validateCostTimingPatterns = validateCostTimingPatterns;
})();
