"""
FORGE calculation processor for FastAPI.
Calls the calculator in-process via run_calculation() for speed.
"""

import json
from pathlib import Path
from typing import Any, Dict
from datetime import datetime

from .models import UserMergeInput
from forge import run_calculation


def merge_user_data_with_template(user_data: Dict[str, Any], template: Dict[str, Any]) -> Dict[str, Any]:
    """
    Merge simplified user input data with the full FORGE template structure.

    Args:
        user_data: Simplified data from web interface
        template: Full FORGE template with all required sections

    Returns:
        Merged data ready for FORGE processing
    """
    merged = template.copy()

    if "project" in user_data:
        project = user_data["project"]

        project_tech = merged["01_project_technical_details"]["project"]
        if "line_miles" in project:
            total_miles = project["line_miles"]
            terrain = merged["02_project_physical_details"]["terrain"]["terrain_miles"]
            if total_miles:
                existing_total = sum(terrain.values())
                if existing_total > 0:
                    scale_factor = total_miles / existing_total
                    for terrain_type in terrain:
                        terrain[terrain_type] = terrain[terrain_type] * scale_factor
        if "voltage_kv" in project:
            voltage = project["voltage_kv"]
            if voltage >= 500:
                merged["10_project_category_build_costs"]["category"] = "Above_500kV"
            elif voltage >= 345:
                merged["10_project_category_build_costs"]["category"] = "300_to_500kV"
            elif voltage >= 138:
                merged["10_project_category_build_costs"]["category"] = "138_to_300kV"
            else:
                merged["10_project_category_build_costs"]["category"] = "Below_138kV"
        if "capacity_mw" in project:
            project_tech["capacity_mw"] = project["capacity_mw"]
        if "project_type" in project:
            if project["project_type"] == "reconductoring":
                project_tech["reconductoring"] = True
            else:
                project_tech["reconductoring"] = False

    if "project_costs" in user_data:
        costs = user_data["project_costs"]
        if "build_costs_per_mile" in costs:
            merged["10_project_category_build_costs"]["costs"]["structures_per_mile"] = costs["build_costs_per_mile"] * 0.6
            merged["10_project_category_build_costs"]["costs"]["conductor_per_mile"] = costs["build_costs_per_mile"] * 0.4

    if "financial" in user_data:
        financial = user_data["financial"]
        if "discount_rate" in financial:
            merged["01_project_technical_details"]["project"]["social_discount_rate"] = financial["discount_rate"]
            merged["03_financing"]["wacc"]["real_wacc"] = financial["discount_rate"]
        if "analysis_period_years" in financial:
            merged["01_project_technical_details"]["timeline"]["project_lifetime"] = financial["analysis_period_years"]

    return merged


def run_forge_calculation(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Run FORGE calculations in-process.

    Args:
        payload: Dictionary containing:
            - combined_data: Full or simplified configuration JSON
            - scenario_id: Optional scenario identifier
            - input_mode: Must be "json"; pydantic rejects any other value

    Returns:
        Dictionary containing calculation results or error information
    """
    input_mode = payload.get("input_mode", "json")
    scenario_id = payload.get("scenario_id") or datetime.now().strftime("%b %d %Y %H.%M.%S")
    combined_data = payload.get("combined_data")

    if combined_data:
        is_full_format = any(
            key.startswith(("0", "1")) and "_" in key for key in combined_data.keys()
        )
        if not is_full_format:
            template_file = Path(__file__).parent.parent / "json" / "final_combined.json"
            if template_file.exists():
                with open(template_file, "r") as f:
                    full_template = json.load(f)
                user_input = UserMergeInput.model_validate(combined_data)
                combined_data = merge_user_data_with_template(
                    user_input.model_dump(exclude_none=True), full_template
                )

    try:
        results = run_calculation(
            combined_data=combined_data or {},
            scenario_id=scenario_id,
            quiet=True,
        )
        return {
            "success": True,
            "scenario_id": scenario_id,
            "timestamp": results.get("timestamp", datetime.now().isoformat()),
            "input_mode": input_mode,
            "results": results,
            "error": None,
        }
    except Exception as e:
        return {
            "success": False,
            "scenario_id": scenario_id,
            "timestamp": datetime.now().isoformat(),
            "input_mode": input_mode,
            "results": None,
            "error": str(e),
        }
