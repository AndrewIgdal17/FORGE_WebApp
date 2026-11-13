"""Market edition strings can override the price-archive defaults."""

from app.layer_releases import layer_releases


def test_layer_releases_accepts_archive_and_polygon_labels():
    body = layer_releases(["x"], "archive-label", "polygon-label")
    assert body["market_prices"] == "archive-label"
    assert body["price_zones"] == "polygon-label"
