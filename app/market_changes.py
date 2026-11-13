"""Congestion spread and receiving-end energy value for one route.

Status follows the price-archive precedence. Measured numbers are copied
from the archive rows already fetched. A measured status with no row raises
ArchiveIncomplete. Spread and energy cross this boundary as floats; hour
counts stay ints.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

SPREAD = "01_project_technical_details.market_measurements.congestion_spread_per_mwh"
HOURS_RECEIVING = (
    "01_project_technical_details.market_measurements.hours_receiving_more_congested"
)
HOURS_SENDING = (
    "01_project_technical_details.market_measurements.hours_sending_more_congested"
)
ENERGY = "01_project_technical_details.market_measurements.receiving_energy_value_per_mwh"

# These markets are unmeasured as a whole. MISO is unmeasured zone by zone.
_ISO_WIDE = frozenset({"PJM", "SPP", "ERCOT"})


class ArchiveIncomplete(Exception):
    """A measured terminal is missing the archive row that supplies its number."""


def market_changes(
    sending: Mapping[str, Any],
    receiving: Mapping[str, Any],
    pair: Mapping[str, Any] | None = None,
    energy: Mapping[str, Any] | None = None,
) -> tuple[dict[str, float | int | None], dict[str, dict[str, str]]]:
    """Return the four measurement paths and the two status records."""
    spread_status, spread_reason = _spread_status(sending, receiving)
    energy_status, energy_reason = _energy_status(receiving)
    if spread_status in {"measured", "same_zone"} and pair is None:
        raise ArchiveIncomplete(spread_status)
    if energy_status == "measured" and energy is None:
        raise ArchiveIncomplete(energy_status)

    if pair is None or spread_status not in {"measured", "same_zone"}:
        spread_value: float | None = None
        hours_receiving: int | None = None
        hours_sending: int | None = None
    else:
        spread_value = float(pair["spread"])
        # hours_fwd counts hours the receiving zone was more congested.
        hours_receiving = int(pair["hours_fwd"])
        hours_sending = int(pair["hours_rev"])

    if energy is None or energy_status != "measured":
        energy_value: float | None = None
    else:
        energy_value = float(energy["energy_value_per_mwh"])

    measured = {
        SPREAD: spread_value,
        HOURS_RECEIVING: hours_receiving,
        HOURS_SENDING: hours_sending,
        ENERGY: energy_value,
    }
    status = {
        "spread": {"status": spread_status, "reason": spread_reason},
        "receiving_energy_value": {
            "status": energy_status,
            "reason": energy_reason,
        },
    }
    return measured, status


def _spread_status(
    sending: Mapping[str, Any], receiving: Mapping[str, Any]
) -> tuple[str, str]:
    send_zone = sending.get("zone")
    recv_zone = receiving.get("zone")
    send_iso = sending.get("iso")
    recv_iso = receiving.get("iso")
    both_priced = bool(sending.get("priced")) and bool(receiving.get("priced"))
    if both_priced and send_zone is not None and send_zone == recv_zone:
        return "same_zone", f"Both ends are in {send_zone}."
    if both_priced and send_iso is not None and send_iso == recv_iso:
        return "measured", f"Both ends are in {send_iso}."
    if send_iso is not None and recv_iso is not None and send_iso != recv_iso:
        return "different_markets", f"The ends are in {send_iso} and {recv_iso}."
    if send_iso is None or recv_iso is None:
        return "outside_markets", _outside_reason(send_iso, recv_iso)
    end, name = _unmeasured_end(sending, receiving)
    return (
        "market_not_measured",
        f"{end} end is in {name}; FORGE has no {name} congestion prices yet.",
    )


def _energy_status(receiving: Mapping[str, Any]) -> tuple[str, str]:
    if receiving.get("priced"):
        return "measured", f"Receiving end is in {receiving.get('zone')}."
    if receiving.get("iso") is None:
        return "outside_markets", "Receiving end is outside the seven ISOs."
    name = _market_name(receiving)
    return (
        "market_not_measured",
        f"Receiving end is in {name}; FORGE has no {name} energy value yet.",
    )


def _outside_reason(sending_iso: object, receiving_iso: object) -> str:
    sending_out = sending_iso is None
    receiving_out = receiving_iso is None
    if sending_out and receiving_out:
        return "Both ends are outside the seven ISOs."
    if sending_out:
        return "Sending end is outside the seven ISOs."
    return "Receiving end is outside the seven ISOs."


def _unmeasured_end(sending: Mapping[str, Any], receiving: Mapping[str, Any]) -> tuple[str, str]:
    if not sending.get("priced"):
        return "Sending", _market_name(sending)
    return "Receiving", _market_name(receiving)


def _market_name(end: Mapping[str, Any]) -> str:
    iso = end.get("iso")
    if iso in _ISO_WIDE:
        return str(iso)
    zone = end.get("zone")
    if zone:
        return str(zone)
    return str(iso) if iso else ""
