"""Generate tests/browser/fixtures/laredo-changes.json from the installed calculator.

`forge.diff_changes` is the canonical diff: it walks the calculator's defaults
template against a full input document and returns only the leaves that
differ. `static/changes.js`'s `diffChanges(defaults, current)` must produce
the same output for the same inputs, so this fixture pins one real scenario
(the Laredo new-build) as a cross-language regression check.

Run with: .venv/bin/python tests/browser/generate_laredo_fixture.py
Re-run whenever the pinned `forge-calc` version changes.
"""

import json
import sys
from pathlib import Path

import forge

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from app.models import sanitize_for_json  # noqa: E402

SCENARIO_ID = "AEP_LRGV_Laredo_NewBuild"


def _match_template_number_types(template_node, current_node):
    """Cast `current_node`'s int/float type to match `template_node`'s, leaf by leaf.

    JSON (and JS numbers) have no int/float distinction: `2` and `2.0` both
    become the same JS `Number`. Python's `json.loads` does preserve it, so
    a `.forge` fixture authored with `2.0` where the live template happens
    to hold `2` (or vice versa) makes `forge.diff_changes`'s type-sensitive
    `canonical_dumps` comparison record a "change" for a value that never
    actually changed -- a diff that is real in Python but unreachable in the
    browser, since the browser never holds a Python float, only numbers
    that already round-tripped through JSON (both `defaults` and `current`
    come from the same `GET /api/defaults` response in that case). Matching
    `current`'s numeric type to the template's before diffing removes those
    spurious entries, so the expected `changes` this fixture pins only
    contains differences `static/changes.js` can actually detect.
    """
    if isinstance(template_node, dict) and isinstance(current_node, dict):
        return {
            key: _match_template_number_types(template_node.get(key), value)
            for key, value in current_node.items()
        }
    if isinstance(template_node, list) and isinstance(current_node, list):
        return [
            _match_template_number_types(
                template_node[index] if index < len(template_node) else None, value
            )
            for index, value in enumerate(current_node)
        ]
    if isinstance(current_node, bool):
        return current_node
    if isinstance(template_node, float) and isinstance(current_node, int):
        return float(current_node)
    if (
        isinstance(template_node, int)
        and isinstance(current_node, float)
        and current_node.is_integer()
    ):
        return int(current_node)
    return current_node


def main() -> None:
    scenario_path = Path(forge.get_scenarios_path(), f"{SCENARIO_ID}.forge")
    document = json.loads(scenario_path.read_text())
    current = _match_template_number_types(forge.get_defaults_template(), document["inputs"])

    # Sanitize the same way the API does for every JSON response (Infinity /
    # -Infinity / NaN as strings) so the fixture is valid JSON and matches
    # what the browser actually receives over the wire.
    fixture = {
        "defaults": sanitize_for_json(forge.get_defaults_template()),
        "current": sanitize_for_json(current),
        "changes": sanitize_for_json(forge.diff_changes(current)),
    }

    out_path = Path(__file__).resolve().parent / "fixtures" / "laredo-changes.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(fixture, indent=2, sort_keys=True) + "\n")
    print(f"Wrote {out_path}")


if __name__ == "__main__":
    main()
