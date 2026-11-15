"""The web app requirement pins calculator v5.1.0 and the price layer keys."""

from pathlib import Path


def test_acceptance_health_v5_and_price_layer_releases():
    text = Path("pyproject.toml").read_text()
    assert "git+https://github.com/AndrewIgdal17/FORGE.git@v5.1.0" in text
    from app.layer_releases import layer_releases

    labels = layer_releases(
        ["nwi"],
        "Day-ahead energy, congestion, and loss, and hourly load, calendar 2025",
        "EIA Atlas RTO Regions via the public ArcGIS replica (item 0e6e5e784bc8458c81f2b05d70f5c3ae)",
    )
    assert "market_prices" in labels
    assert "price_zones" in labels
