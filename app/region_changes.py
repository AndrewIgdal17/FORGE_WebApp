"""Cambium terminal paths from route endpoint attribution.

Values are copied as stored. A missing polygon stays None. Nothing here
rewrites one balancing-area name into another.
"""

from __future__ import annotations


def region_changes(endpoints: dict) -> dict[str, str | None]:
    """Map endpoint attribution onto the six Cambium terminal paths."""
    return {
        "01_project_technical_details.terminals.sending.gea": endpoints[
            "sending_gea"
        ],
        "01_project_technical_details.terminals.sending.egrid_subregion": (
            endpoints["sending_subregion"]
        ),
        "01_project_technical_details.terminals.sending.state": endpoints[
            "sending_state"
        ],
        "01_project_technical_details.terminals.receiving.gea": endpoints[
            "receiving_gea"
        ],
        "01_project_technical_details.terminals.receiving.egrid_subregion": (
            endpoints["receiving_subregion"]
        ),
        "01_project_technical_details.terminals.receiving.state": endpoints[
            "receiving_state"
        ],
    }
