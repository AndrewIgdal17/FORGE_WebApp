"""Four-model ensemble for the substation-name audit.

Trains logistic regression, random forest, XGBoost, and AdaBoost on the
audit features in ``FEATURE_NAMES``. The ensemble is a majority vote. A tie
goes to the tied label with the highest individual confidence. Predictions
stay unavailable until 30 decisions have been trained.

`train` publishes a new model bundle in one assignment. An in-flight `predict`
keeps the previous bundle and does not observe a half-updated set of models.
"""

from __future__ import annotations

import copy
import threading
import warnings
from collections import Counter
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any

import numpy as np
from sklearn.base import clone
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import AdaBoostClassifier, RandomForestClassifier
from sklearn.exceptions import (
    ConvergenceWarning,
    FitFailedWarning,
    UndefinedMetricWarning,
)
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score
from sklearn.model_selection import GridSearchCV, StratifiedKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.tree import DecisionTreeClassifier
from sklearn.utils.class_weight import compute_sample_weight
from xgboost import XGBClassifier, set_config

from app.audit_features import FEATURE_NAMES

set_config(verbosity=0)

MODEL_ORDER = (
    "logistic_regression",
    "random_forest",
    "xgboost",
    "adaboost",
)
CANONICAL_LABELS = ("accept", "keep", "relabel", "skip")
_HISTORY_KEY = {
    "logistic_regression": "lr",
    "random_forest": "rf",
    "xgboost": "xgb",
    "adaboost": "ada",
}
_SMALL_GRID_ROWS = 80
_XGB_STRONGER_L2_ROWS = 100
_SCORING = {"balanced_accuracy": "balanced_accuracy", "accuracy": "accuracy"}
_LR_GRID = {"clf__C": [0.01, 0.1, 1.0, 10.0]}
_RF_GRID = {
    "n_estimators": [50, 100],
    "max_depth": [3, 5, 10],
    "min_samples_leaf": [1, 3, 5],
}
_SEARCH_FAILURE_MARKERS = ("fits failed", "non-finite", "worse than random")


@dataclass(frozen=True)
class _State:
    n_decisions: int
    models: dict[str, _FittedModel] | None
    best_params: dict[str, dict[str, Any]]
    accuracy_history: tuple[dict[str, Any], ...]


class _FittedModel:
    """Fitted estimator plus the label decoding `predict` needs."""

    def __init__(self, estimator: Any, encoder: LabelEncoder | None = None) -> None:
        self.estimator = estimator
        self.encoder = encoder

    def predict_labels(self, rows: np.ndarray) -> np.ndarray:
        raw = self.estimator.predict(rows)
        if self.encoder is None:
            return np.asarray(raw, dtype=object)
        encoded = np.asarray(raw).astype(int)
        return np.asarray(self.encoder.inverse_transform(encoded), dtype=object)

    def confidences(self, rows: np.ndarray, labels: np.ndarray) -> np.ndarray:
        probabilities = self.estimator.predict_proba(rows)
        class_index = {self._label(cls): i for i, cls in enumerate(self.estimator.classes_)}
        scores = np.empty(len(labels), dtype=np.float64)
        for i, label in enumerate(labels):
            column = class_index.get(str(label))
            scores[i] = float(probabilities[i, column]) if column is not None else 0.0
        return scores

    def predict_one(self, row: np.ndarray) -> dict[str, Any]:
        labels = self.predict_labels(row)
        label = str(labels[0])
        confidence = float(self.confidences(row, labels)[0])
        probabilities = self.estimator.predict_proba(row)[0]
        decoded: dict[str, float] = {}
        for cls, prob in zip(self.estimator.classes_, probabilities):
            decoded[self._label(cls)] = float(prob)
        proba = {name: float(decoded.get(name, 0.0)) for name in CANONICAL_LABELS}
        for name, prob in decoded.items():
            proba.setdefault(name, prob)
        return {"prediction": label, "confidence": confidence, "proba": proba}

    def _label(self, value: object) -> str:
        if self.encoder is None:
            return str(value)
        encoded = np.asarray([value]).astype(int)
        return str(self.encoder.inverse_transform(encoded)[0])


@contextmanager
def _quiet():
    """Hide convergence noise and failed AdaBoost parameter trials."""
    with warnings.catch_warnings():
        warnings.filterwarnings("ignore", category=ConvergenceWarning)
        warnings.filterwarnings("ignore", category=FitFailedWarning)
        warnings.filterwarnings("ignore", category=UndefinedMetricWarning)
        yield


def _plain(value: Any) -> Any:
    if isinstance(value, np.generic):
        value = value.item()
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return int(value)
    if isinstance(value, float):
        return float(value)
    return value


def _plain_params(params: dict[str, Any]) -> dict[str, Any]:
    return {str(key): _plain(value) for key, value in params.items()}


def _class_counts(y: np.ndarray) -> np.ndarray:
    _, counts = np.unique(y, return_counts=True)
    return counts


def _make_cv(counts: np.ndarray) -> StratifiedKFold | None:
    """Stratified folds when every class has at least two rows. Otherwise skip search."""
    if len(counts) < 2 or int(counts.min()) < 2:
        return None
    n_splits = min(3, int(counts.min()))
    return StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)


def _is_search_failure(exc: BaseException) -> bool:
    message = str(exc).lower()
    return any(marker in message for marker in _SEARCH_FAILURE_MARKERS)


def _xgb_grid(n_rows: int) -> dict[str, list]:
    if n_rows < _SMALL_GRID_ROWS:
        return {
            "n_estimators": [50, 100],
            "max_depth": [3],
            "learning_rate": [0.1],
        }
    return {
        "n_estimators": [50, 100],
        "max_depth": [3, 5, 7],
        "learning_rate": [0.05, 0.1, 0.2],
    }


def _ada_grid(n_rows: int) -> dict[str, list]:
    if n_rows < _SMALL_GRID_ROWS:
        return {
            "n_estimators": [50, 100],
            "learning_rate": [0.5, 1.0],
        }
    return {
        "n_estimators": [50, 100, 200],
        "learning_rate": [0.05, 0.1, 0.5, 1.0],
    }


def _xgb_estimator(n_rows: int, n_classes: int) -> XGBClassifier:
    kwargs: dict[str, Any] = {
        "tree_method": "hist",
        "verbosity": 0,
        "n_jobs": 1,
        "random_state": 42,
    }
    if n_rows < _XGB_STRONGER_L2_ROWS:
        kwargs["reg_lambda"] = 5
    if n_classes >= 3:
        kwargs["objective"] = "multi:softprob"
        kwargs["eval_metric"] = "mlogloss"
    else:
        kwargs["objective"] = "binary:logistic"
        kwargs["eval_metric"] = "logloss"
    return XGBClassifier(**kwargs)


def _logistic_estimator() -> Pipeline:
    # The step name `clf` is what the `clf__C` grid addresses.
    return Pipeline(
        [
            ("scaler", StandardScaler()),
            (
                "clf",
                LogisticRegression(
                    solver="lbfgs",
                    class_weight="balanced",
                    max_iter=1000,
                    l1_ratio=0.0,
                    random_state=42,
                ),
            ),
        ]
    )


def _forest_estimator() -> RandomForestClassifier:
    return RandomForestClassifier(
        max_features="sqrt",
        class_weight="balanced_subsample",
        n_jobs=1,
        random_state=42,
    )


def _ada_estimator() -> AdaBoostClassifier:
    return AdaBoostClassifier(
        estimator=DecisionTreeClassifier(max_depth=1, random_state=42),
        random_state=42,
    )


def _constant_model(X: np.ndarray, y: np.ndarray) -> tuple[_FittedModel, dict[str, Any], float]:
    dummy = DummyClassifier(strategy="most_frequent")
    dummy.fit(X, y)
    model = _FittedModel(dummy)
    accuracy = float(accuracy_score(y, model.predict_labels(X)))
    return model, {"fallback": "most_frequent"}, accuracy


def _reported_params(name: str, estimator: Any, searched: dict[str, Any]) -> dict[str, Any]:
    if isinstance(estimator, DummyClassifier):
        return {"fallback": "most_frequent"}
    if searched:
        params = dict(searched)
    elif name == "logistic_regression":
        params = {"clf__C": estimator.named_steps["clf"].C}
    elif name == "random_forest":
        params = {
            "n_estimators": estimator.n_estimators,
            "max_depth": estimator.max_depth,
            "min_samples_leaf": estimator.min_samples_leaf,
        }
    elif name == "xgboost":
        params = {
            "n_estimators": estimator.n_estimators,
            "max_depth": estimator.max_depth,
            "learning_rate": estimator.learning_rate,
        }
    elif name == "adaboost":
        params = {
            "n_estimators": estimator.n_estimators,
            "learning_rate": estimator.learning_rate,
        }
    else:
        params = {}
    if name == "xgboost" and "reg_lambda" in estimator.get_params():
        # Always surface the L2 value. Below 100 rows the trainer sets it to 5.
        params["reg_lambda"] = estimator.get_params()["reg_lambda"]
    return _plain_params(params)


def _search_or_fit(
    estimator: Any,
    param_grid: dict[str, list],
    X: np.ndarray,
    y: np.ndarray,
    cv: StratifiedKFold | None,
    fit_params: dict[str, np.ndarray],
    n_jobs: int,
    error_score: str | float,
) -> tuple[Any, dict[str, Any], float | None]:
    """Grid-search when a stratified split exists. Otherwise fit the base estimator."""
    if cv is None:
        estimator.fit(X, y, **fit_params)
        return estimator, {}, None

    search = GridSearchCV(
        estimator,
        param_grid,
        scoring=_SCORING,
        refit="balanced_accuracy",
        cv=cv,
        n_jobs=n_jobs,
        error_score=error_score,
    )
    try:
        search.fit(X, y, **fit_params)
    except ValueError as exc:
        if not _is_search_failure(exc):
            raise
        estimator.fit(X, y, **fit_params)
        return estimator, {}, None

    if search.best_index_ is None or not np.isfinite(search.best_score_):
        estimator.fit(X, y, **fit_params)
        return estimator, {}, None

    accuracy = float(search.cv_results_["mean_test_accuracy"][search.best_index_])
    if not np.isfinite(accuracy):
        accuracy = None
    return search.best_estimator_, dict(search.best_params_), accuracy


def _finish(
    name: str,
    estimator: Any,
    searched: dict[str, Any],
    accuracy: float | None,
    X: np.ndarray,
    y: np.ndarray,
    encoder: LabelEncoder | None = None,
) -> tuple[_FittedModel, dict[str, Any], float]:
    model = _FittedModel(estimator, encoder)
    if accuracy is None or not np.isfinite(accuracy):
        accuracy = float(accuracy_score(y, model.predict_labels(X)))
    return model, _reported_params(name, estimator, searched), float(accuracy)


def _train_logistic(
    X: np.ndarray, y: np.ndarray, cv: StratifiedKFold | None
) -> tuple[_FittedModel, dict[str, Any], float]:
    if len(np.unique(y)) < 2:
        return _constant_model(X, y)
    try:
        estimator, searched, accuracy = _search_or_fit(
            _logistic_estimator(),
            _LR_GRID,
            X,
            y,
            cv,
            {},
            n_jobs=1,
            error_score="raise",
        )
    except ValueError as exc:
        if not _is_search_failure(exc):
            raise
        return _constant_model(X, y)
    return _finish("logistic_regression", estimator, searched, accuracy, X, y)


def _train_forest(
    X: np.ndarray, y: np.ndarray, cv: StratifiedKFold | None
) -> tuple[_FittedModel, dict[str, Any], float]:
    if len(np.unique(y)) < 2:
        return _constant_model(X, y)
    try:
        estimator, searched, accuracy = _search_or_fit(
            _forest_estimator(),
            _RF_GRID,
            X,
            y,
            cv,
            {},
            n_jobs=-1,
            error_score="raise",
        )
    except ValueError as exc:
        if not _is_search_failure(exc):
            raise
        return _constant_model(X, y)
    return _finish("random_forest", estimator, searched, accuracy, X, y)


def _train_xgboost(
    X: np.ndarray,
    y: np.ndarray,
    cv: StratifiedKFold | None,
    sample_weight: np.ndarray,
) -> tuple[_FittedModel, dict[str, Any], float]:
    if len(np.unique(y)) < 2:
        return _constant_model(X, y)
    encoder = LabelEncoder()
    y_int = encoder.fit_transform(y)
    try:
        estimator, searched, accuracy = _search_or_fit(
            _xgb_estimator(X.shape[0], len(encoder.classes_)),
            _xgb_grid(X.shape[0]),
            X,
            y_int,
            cv,
            {"sample_weight": sample_weight},
            n_jobs=1,
            error_score="raise",
        )
    except ValueError as exc:
        if not _is_search_failure(exc):
            raise
        return _constant_model(X, y)
    return _finish("xgboost", estimator, searched, accuracy, X, y, encoder)


def _train_adaboost(
    X: np.ndarray,
    y: np.ndarray,
    cv: StratifiedKFold | None,
    sample_weight: np.ndarray,
) -> tuple[_FittedModel, dict[str, Any], float]:
    if len(np.unique(y)) < 2:
        return _constant_model(X, y)
    try:
        estimator, searched, accuracy = _search_or_fit(
            _ada_estimator(),
            _ada_grid(X.shape[0]),
            X,
            y,
            cv,
            {"sample_weight": sample_weight},
            n_jobs=1,
            error_score=np.nan,
        )
    except ValueError as exc:
        if not _is_search_failure(exc):
            raise
        return _constant_model(X, y)
    return _finish("adaboost", estimator, searched, accuracy, X, y)


def _ensemble_decision(outputs: dict[str, dict[str, Any]]) -> dict[str, str]:
    """Majority vote. Tied labels break toward the highest model confidence."""
    predictions = [str(outputs[name]["prediction"]) for name in MODEL_ORDER]
    counts = Counter(predictions)
    top = max(counts.values())
    tied = {label for label, count in counts.items() if count == top}
    if len(tied) == 1:
        winner = next(iter(tied))
    else:
        winner = predictions[0]
        best_confidence = -1.0
        for name in MODEL_ORDER:
            prediction = str(outputs[name]["prediction"])
            confidence = float(outputs[name]["confidence"])
            if prediction in tied and confidence > best_confidence:
                best_confidence = confidence
                winner = prediction
    return {"prediction": winner, "agreement": f"{counts[winner]}/{len(MODEL_ORDER)}"}


def _vote_many(
    predictions: dict[str, np.ndarray],
    confidences: dict[str, np.ndarray],
) -> np.ndarray:
    n_rows = len(next(iter(predictions.values())))
    winners = np.empty(n_rows, dtype=object)
    for i in range(n_rows):
        outputs = {
            name: {
                "prediction": str(predictions[name][i]),
                "confidence": float(confidences[name][i]),
            }
            for name in MODEL_ORDER
        }
        winners[i] = _ensemble_decision(outputs)["prediction"]
    return winners


def _label_and_confidence(model: _FittedModel, rows: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    labels = model.predict_labels(rows)
    return labels, model.confidences(rows, labels)


def _ensemble_accuracy(
    models: dict[str, _FittedModel],
    X: np.ndarray,
    y: np.ndarray,
    cv: StratifiedKFold | None,
    sample_weight: np.ndarray | None,
    encoder: LabelEncoder | None,
) -> float:
    """Mean per-fold accuracy of the majority vote. In-sample when search was skipped."""
    if cv is None or sample_weight is None or encoder is None:
        return _insample_ensemble_accuracy(models, X, y)

    fold_scores: list[float] = []
    try:
        for train_idx, test_idx in cv.split(X, y):
            fold_models = _fit_fold(models, X, y, sample_weight, encoder, train_idx)
            predictions: dict[str, np.ndarray] = {}
            confidences: dict[str, np.ndarray] = {}
            test_rows = X[test_idx]
            for name in MODEL_ORDER:
                predictions[name], confidences[name] = _label_and_confidence(
                    fold_models[name], test_rows
                )
            voted = _vote_many(predictions, confidences)
            fold_scores.append(float(accuracy_score(y[test_idx], voted)))
    except ValueError as exc:
        if not _is_search_failure(exc):
            raise
        return _insample_ensemble_accuracy(models, X, y)
    if not fold_scores:
        return _insample_ensemble_accuracy(models, X, y)
    return float(np.mean(fold_scores))


def _fit_fold(
    models: dict[str, _FittedModel],
    X: np.ndarray,
    y: np.ndarray,
    sample_weight: np.ndarray,
    encoder: LabelEncoder,
    train_idx: np.ndarray,
) -> dict[str, _FittedModel]:
    rows = X[train_idx]
    labels = y[train_idx]
    weights = sample_weight[train_idx]
    fitted: dict[str, _FittedModel] = {}
    for name in MODEL_ORDER:
        estimator = clone(models[name].estimator)
        if isinstance(estimator, DummyClassifier):
            estimator.fit(rows, labels)
            fitted[name] = _FittedModel(estimator)
            continue
        if name == "xgboost":
            estimator.fit(rows, encoder.transform(labels), sample_weight=weights)
            fitted[name] = _FittedModel(estimator, encoder)
        elif name == "adaboost":
            estimator.fit(rows, labels, sample_weight=weights)
            fitted[name] = _FittedModel(estimator)
        else:
            estimator.fit(rows, labels)
            fitted[name] = _FittedModel(estimator)
    return fitted


def _insample_ensemble_accuracy(
    models: dict[str, _FittedModel], X: np.ndarray, y: np.ndarray
) -> float:
    predictions: dict[str, np.ndarray] = {}
    confidences: dict[str, np.ndarray] = {}
    for name in MODEL_ORDER:
        predictions[name], confidences[name] = _label_and_confidence(models[name], X)
    voted = _vote_many(predictions, confidences)
    return float(accuracy_score(y, voted))


def _history_point(n_rows: int, scores: dict[str, float]) -> dict[str, Any]:
    return {
        "n": int(n_rows),
        "lr": float(scores["lr"]),
        "rf": float(scores["rf"]),
        "xgb": float(scores["xgb"]),
        "ada": float(scores["ada"]),
        "ensemble": float(scores["ensemble"]),
    }


def _validate_training(X: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    features = np.asarray(X, dtype=np.float64)
    labels = np.asarray([str(value) for value in np.asarray(y).reshape(-1)])
    if features.ndim != 2:
        raise ValueError(f"X must be a 2-d array of shape (n, {len(FEATURE_NAMES)})")
    if features.shape[1] != len(FEATURE_NAMES):
        raise ValueError(f"X must have {len(FEATURE_NAMES)} features")
    if features.shape[0] == 0:
        raise ValueError("X is empty")
    if features.shape[0] != labels.shape[0]:
        raise ValueError("X and y have different lengths")
    if not np.isfinite(features).all():
        raise ValueError("X contains non-finite values")
    unknown = sorted(set(labels.tolist()) - set(CANONICAL_LABELS))
    if unknown:
        raise ValueError(f"Unknown audit labels: {unknown}")
    return features, labels


def _as_row(x: np.ndarray) -> np.ndarray:
    array = np.asarray(x, dtype=np.float64)
    n_features = len(FEATURE_NAMES)
    if array.ndim == 1:
        row = array.reshape(1, -1)
    elif array.ndim == 2 and array.shape[0] == 1:
        row = array
    else:
        raise ValueError("predict expects one feature vector")
    if row.shape[1] != n_features:
        raise ValueError(f"expected {n_features} features, got {row.shape[1]}")
    if not np.isfinite(row).all():
        raise ValueError("feature vector contains non-finite values")
    return row


def _is_ready(state: _State | None) -> bool:
    return (
        state is not None
        and state.n_decisions >= AuditEnsemble.MIN_DECISIONS
        and bool(state.models)
    )


def _train_bundle(
    X: np.ndarray, y: np.ndarray
) -> tuple[dict[str, _FittedModel], dict[str, dict[str, Any]], dict[str, float]]:
    counts = _class_counts(y)
    cv = _make_cv(counts)
    weights = compute_sample_weight("balanced", y) if len(counts) >= 2 else None
    trained = {
        "logistic_regression": _train_logistic(X, y, cv),
        "random_forest": _train_forest(X, y, cv),
        "xgboost": _train_xgboost(X, y, cv, _weights_or_ones(weights, len(y))),
        "adaboost": _train_adaboost(X, y, cv, _weights_or_ones(weights, len(y))),
    }
    models = {name: trained[name][0] for name in MODEL_ORDER}
    best_params = {name: trained[name][1] for name in MODEL_ORDER}
    scores = {_HISTORY_KEY[name]: trained[name][2] for name in MODEL_ORDER}
    encoder = models["xgboost"].encoder
    if encoder is None and len(counts) >= 2:
        encoder = LabelEncoder().fit(y)
    scores["ensemble"] = _ensemble_accuracy(models, X, y, cv, weights, encoder)
    return models, best_params, scores


def _weights_or_ones(weights: np.ndarray | None, n_rows: int) -> np.ndarray:
    if weights is None:
        return np.ones(n_rows, dtype=np.float64)
    return weights


class AuditEnsemble:
    """In-memory majority-vote ensemble over the four audit classifiers."""

    MIN_DECISIONS = 30

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._state: _State | None = None

    def train(self, X: np.ndarray, y: np.ndarray) -> None:
        """Train all 4 models.

        `X` has one column per name in ``FEATURE_NAMES`` and `y` is
        `accept` / `keep` / `relabel` / `skip`. Appends one accuracy-history
        point when `n` is at least 30.
        """
        features, labels = _validate_training(X, y)
        with _quiet():
            models, best_params, scores = _train_bundle(features, labels)
        point = None
        if features.shape[0] >= self.MIN_DECISIONS:
            point = _history_point(features.shape[0], scores)
        with self._lock:
            previous = () if self._state is None else self._state.accuracy_history
            history = previous if point is None else previous + (point,)
            self._state = _State(
                n_decisions=int(features.shape[0]),
                models=models,
                best_params=best_params,
                accuracy_history=history,
            )

    def predict(self, x: np.ndarray) -> dict | None:
        """Predict one feature vector.

        Returns `None` until 30 decisions have been trained. Otherwise returns
        each model's label, confidence, and class probabilities, plus the
        ensemble label and agreement fraction.
        """
        with self._lock:
            state = self._state
        if not _is_ready(state) or state is None or state.models is None:
            return None
        row = _as_row(x)
        models = {
            name: state.models[name].predict_one(row)
            for name in MODEL_ORDER
        }
        return {
            "models": models,
            "ensemble": _ensemble_decision(models),
            "ready": True,
        }

    def stats(self) -> dict:
        """Decision count, readiness, accuracy history, and chosen parameters."""
        with self._lock:
            state = self._state
        if state is None:
            return {
                "n_decisions": 0,
                "ready": False,
                "accuracy_history": [],
                "best_params": {},
            }
        return {
            "n_decisions": state.n_decisions,
            "ready": _is_ready(state),
            "accuracy_history": [dict(point) for point in state.accuracy_history],
            "best_params": copy.deepcopy(state.best_params),
        }

    @property
    def ready(self) -> bool:
        """True when at least 30 decisions have been trained into a model bundle."""
        with self._lock:
            state = self._state
        return _is_ready(state)
