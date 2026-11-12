"""Cambium terminal paths from route endpoint attribution."""

from __future__ import annotations


def test_portland_style_endpoints_keep_null_receiving_gea():
    from app.region_changes import region_changes

    endpoints = {
        "sending_subregion": "NWPP",
        "receiving_subregion": "CAMX",
        "sending_gea": "NorthernGrid_West",
        "receiving_gea": None,
        "sending_state": "OR",
        "receiving_state": "CA",
    }

    assert region_changes(endpoints) == {
        "01_project_technical_details.terminals.sending.gea": "NorthernGrid_West",
        "01_project_technical_details.terminals.sending.egrid_subregion": "NWPP",
        "01_project_technical_details.terminals.sending.state": "OR",
        "01_project_technical_details.terminals.receiving.gea": None,
        "01_project_technical_details.terminals.receiving.egrid_subregion": "CAMX",
        "01_project_technical_details.terminals.receiving.state": "CA",
    }
