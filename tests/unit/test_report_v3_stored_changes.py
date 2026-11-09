"""Path classifier for stored scenario changes that v3.0.0 must report."""

from scripts.report_v3_stored_changes import classify_changes

ESCALATION = "03_financing.financial.construction_cost_escalation_rate"
TIMING = "19_cost_timing_patterns.cost_timing_patterns.build.during_construction"
TIMING_OTHER = "19_cost_timing_patterns.cost_timing_patterns.row.during_delay"
AFUDC = "03_financing.financial.afudc.delay_period_active_work"
DELAY = "01_project_technical_details.timeline.delay_years"
CONSTRUCTION = "01_project_technical_details.timeline.construction_years"
LIFETIME = "01_project_technical_details.timeline.project_lifetime"
UNDERGROUND = "06_wildfire_costs.wildfire.ignition_rate_multiplier.underground"
HOURS = (
    "17_congestion_reductions.greenfield_congestion_reductions"
    ".constraints.constrained_hours"
)
PRICE = (
    "17_congestion_reductions.greenfield_congestion_reductions"
    ".prices.average_congestion_price"
)
INCREMENTAL_HOURS = (
    "17_congestion_reductions.incremental_congestion_reductions"
    ".constraints.constrained_hours"
)
INCREMENTAL_PRICE = (
    "17_congestion_reductions.incremental_congestion_reductions"
    ".prices.average_congestion_price"
)
FLOW = (
    "17_congestion_reductions.greenfield_congestion_reductions"
    ".constraints.flow_factor"
)
PROJECT_TYPE = "01_project_technical_details.project.project_type"
SENDING_SOURCE = "01_project_technical_details.project.sending_source"
AGREEMENT = "01_project_technical_details.project.row_agreement_type"
EXISTING_ROW = "01_project_technical_details.project.uses_existing_row"
COMPARISON_MW = "01_project_technical_details.project.greenfield_comparison_capacity_mw"
COMPARISON_CONDUCTOR = (
    "01_project_technical_details.project.greenfield_comparison_conductor_type"
)


def test_old_escalation_key_is_a_rename():
    assert classify_changes({ESCALATION: 0.04}) == [(ESCALATION, "rename")]
    nested = {
        "03_financing": {
            "financial": {"construction_cost_escalation_rate": 0.04},
        }
    }
    assert classify_changes(nested) == [(ESCALATION, "rename")]


def test_removed_timing_inputs_are_listed():
    changes = {TIMING: 0.5, TIMING_OTHER: 0.5, AFUDC: True}
    assert classify_changes(changes) == [
        (AFUDC, "removed"),
        (TIMING, "removed"),
        (TIMING_OTHER, "removed"),
    ]


def test_non_whole_timeline_years_are_listed():
    changes = {DELAY: 1.5, CONSTRUCTION: 2.25, LIFETIME: 40.5}
    assert classify_changes(changes) == [
        (CONSTRUCTION, "non-whole"),
        (DELAY, "non-whole"),
        (LIFETIME, "non-whole"),
    ]


def test_whole_timeline_years_are_clean():
    assert classify_changes({DELAY: 1.0, CONSTRUCTION: 3, LIFETIME: 40}) == []


def test_old_underground_ignition_multiplier_is_removed():
    assert classify_changes({UNDERGROUND: 0.01}) == [(UNDERGROUND, "removed")]


def test_constrained_hours_with_and_without_a_price():
    with_price = classify_changes({HOURS: 4000, PRICE: 15})
    without_price = classify_changes({INCREMENTAL_HOURS: 1200})
    assert with_price == [(HOURS, "constrained_hours with price")]
    assert without_price == [(INCREMENTAL_HOURS, "constrained_hours without price")]


def test_a_price_in_another_section_does_not_pair():
    changes = {HOURS: 4000, INCREMENTAL_PRICE: 11.47}
    assert classify_changes(changes) == [(HOURS, "constrained_hours without price")]


def test_flow_factor_zero_on_a_greenfield_margin_row():
    assert classify_changes({FLOW: 0}) == [(FLOW, "flow_factor 0 on greenfield margin")]
    assert classify_changes({FLOW: 0.0}) == [(FLOW, "flow_factor 0 on greenfield margin")]
    assert classify_changes({FLOW: "0", PROJECT_TYPE: "greenfield"}) == [
        (FLOW, "flow_factor 0 on greenfield margin")
    ]


def test_flow_factor_zero_is_not_reported_off_the_greenfield_margin():
    assert classify_changes({FLOW: 0, PROJECT_TYPE: "reconductoring"}) == []
    assert classify_changes({FLOW: 0, SENDING_SOURCE: "dedicated"}) == []
    assert classify_changes({FLOW: 0.5}) == []


def test_fee_simple_existing_row_and_greenfield_comparison():
    changes = {
        AGREEMENT: "fee_simple",
        EXISTING_ROW: True,
        COMPARISON_MW: 500,
        COMPARISON_CONDUCTOR: "Standard Aluminum Conductor",
    }
    assert classify_changes(changes) == [
        (COMPARISON_MW, "removed"),
        (COMPARISON_CONDUCTOR, "removed"),
        (AGREEMENT, "rejected"),
        (EXISTING_ROW, "ignored"),
    ]


def test_a_clean_dict_returns_nothing():
    changes = {
        "03_financing.financial.construction_cost_escalation_nominal": 0.04,
        DELAY: 2,
        CONSTRUCTION: 3.0,
        LIFETIME: 40,
        "06_wildfire_costs.wildfire.ignition_rate_multiplier.overhead": 1,
        "06_wildfire_costs.wildfire.ignition_rate_multiplier.underground_direct_buried": 0.01,
        "06_wildfire_costs.wildfire.ignition_rate_multiplier.underground_tunnel": 0.01,
        FLOW: 0.5,
        PRICE: 6.85,
        AGREEMENT: "permanent_easement_new",
        PROJECT_TYPE: "greenfield",
        SENDING_SOURCE: "margin",
    }
    assert classify_changes(changes) == []
