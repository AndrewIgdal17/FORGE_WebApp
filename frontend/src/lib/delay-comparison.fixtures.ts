export const SUNZIA_DELAY2_BLOCK: Record<string, unknown> = {
  omitted: {
    delta_nb_delay: [
      'avoided_emissions_benefit',
      'congestion_benefit',
      'emissions_comp',
      'line_loss_conductor',
      'line_loss_converter',
    ],
    delay_cost_forgone: ['avoided_emissions_benefit', 'congestion_benefit'],
  },
  on_time: {
    bcr_societal: 0.14590935078836184,
    net_benefit_pv: -16357249275.733303,
    total_costs_pv: 19151654793.120304,
    total_benefits_pv: 2794405517.387002,
  },
  delay_years: 2,
  on_time_run: true,
  delta_nb_delay: -541002927.9687195,
  delay_cost_cong: null,
  delay_cost_avoid: null,
  delay_cost_forgone: null,
  baseline_delay_years: 0,
};

// v4.0.0: no `omitted`
export const CTT_ACTUAL_DELAY2_BLOCK: Record<string, unknown> = {
  on_time: {
    bcr_societal: 0.0982071970732846,
    net_benefit_pv: -4338233806.425759,
    total_costs_pv: 4810676900.887074,
    total_benefits_pv: 472443094.4613149,
  },
  delay_years: 2,
  on_time_run: true,
  delta_nb_delay: -247125646.34603548,
  delay_cost_cong: 9218180.332145989,
  delay_cost_avoid: 0.0,
  delay_cost_forgone: 9218180.332145989,
  baseline_delay_years: 0,
};
