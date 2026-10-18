"""Accuracy-weighted ensemble vote, beside the majority vote."""

from __future__ import annotations

import numpy as np
import pytest

from app.audit_features import FEATURE_NAMES
from app.audit_models import (
    CANONICAL_LABELS,
    MODEL_ORDER,
    AuditEnsemble,
    _FittedModel,
    _vote_weight,
    _weighted_decision,
)


class _StubEstimator:
    def __init__(self, probabilities: dict[str, float]) -> None:
        self.classes_ = np.array(CANONICAL_LABELS)
        self._row = [float(probabilities.get(label, 0.0)) for label in CANONICAL_LABELS]

    def predict_proba(self, rows: np.ndarray) -> np.ndarray:
        return np.tile(self._row, (len(rows), 1))


def _model(probabilities: dict[str, float], cv_accuracy: float | None) -> _FittedModel:
    return _FittedModel(_StubEstimator(probabilities), cv_accuracy=cv_accuracy)


def _bundle(
    specs: dict[str, tuple[dict[str, float], float | None]],
) -> dict[str, _FittedModel]:
    return {
        name: _model(probabilities, cv_accuracy)
        for name, (probabilities, cv_accuracy) in specs.items()
    }


def test_missing_cv_accuracy_weighs_half():
    assert _vote_weight(_model({"accept": 1.0}, None)) == 0.5
    assert _vote_weight(_model({"accept": 1.0}, float("nan"))) == 0.5
    assert _vote_weight(_model({"accept": 1.0}, 0.86)) == 0.86


def test_weighted_vote_lets_the_more_accurate_model_count_more():
    # RF at 0.9 votes accept. The only other live vote is XGBoost with no CV
    # score, so it weighs 0.5 and votes keep. 0.9 beats 0.5.
    models = _bundle(
        {
            "logistic_regression": ({"keep": 1.0}, 0.0),
            "random_forest": ({"accept": 1.0}, 0.9),
            "xgboost": ({"keep": 1.0}, None),
            "adaboost": ({"keep": 1.0}, 0.0),
        }
    )
    decision = _weighted_decision(models, np.zeros((1, 1)))
    assert decision["prediction"] == "accept"
    assert decision["agreement"] == "64.3%"


def test_weighted_vote_normalizes_soft_probabilities():
    models = _bundle(
        {
            "logistic_regression": ({"accept": 0.82, "keep": 0.18}, 0.80),
            "random_forest": ({"accept": 0.10, "keep": 0.90}, 0.90),
            "xgboost": ({"accept": 0.50, "keep": 0.50}, 0.70),
            "adaboost": ({"keep": 1.0}, 0.60),
        }
    )
    decision = _weighted_decision(models, np.zeros((1, 1)))
    assert set(models) == set(MODEL_ORDER)
    assert decision == {"prediction": "keep", "agreement": "63.5%"}


def test_training_accuracies_match_full_sample_predictions():
    rng = np.random.default_rng(0)
    n_rows = AuditEnsemble.MIN_DECISIONS
    features = rng.normal(size=(n_rows, len(FEATURE_NAMES)))
    labels = np.where(features[:, 0] > 0, "accept", "keep")
    ensemble = AuditEnsemble()
    ensemble.train(features, labels)

    stats = ensemble.stats()
    point = stats["accuracy_history"][-1]
    assert stats["ready"] is True
    assert set(point) >= {"n", "lr", "rf", "xgb", "ada", "ensemble", "ensemble_weighted"}
    assert point["n"] == n_rows

    majority = []
    weighted = []
    for row in features:
        prediction = ensemble.predict(row)
        assert prediction is not None
        assert "ensemble_weighted" in prediction
        majority.append(prediction["ensemble"]["prediction"])
        weighted.append(prediction["ensemble_weighted"]["prediction"])
        assert prediction["ensemble_weighted"]["agreement"].endswith("%")

    assert point["ensemble"] == pytest.approx(float(np.mean(np.array(majority) == labels)))
    assert point["ensemble_weighted"] == pytest.approx(
        float(np.mean(np.array(weighted) == labels))
    )
