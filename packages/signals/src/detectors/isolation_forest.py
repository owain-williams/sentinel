"""Isolation Forest anomaly detector."""

import uuid
from datetime import datetime, timezone
from typing import Optional

import numpy as np
from sklearn.ensemble import IsolationForest

from src.models import NormalisedEvent, SignalEvent


def _extract_features(event: NormalisedEvent) -> list[float]:
    hour = datetime.fromisoformat(event.timestamp.replace("Z", "+00:00")).hour
    return [
        event.raw_value,
        event.baseline_value,
        event.z_score if event.z_score is not None else 0.0,
        event.confidence,
        float(hour),
    ]


class IsolationForestDetector:
    def __init__(
        self,
        n_estimators: int = 100,
        contamination: float = 0.05,
        min_samples: int = 50,
    ):
        self._n_estimators = n_estimators
        self._contamination = contamination
        self._min_samples = min_samples
        self._model: IsolationForest | None = None
        self._buffer: list[list[float]] = []
        self._trained = False
        self._train_mean: np.ndarray | None = None
        self._train_std: np.ndarray | None = None

    def _fit_model(self, X: np.ndarray) -> None:
        self._model = IsolationForest(
            n_estimators=self._n_estimators,
            contamination=self._contamination,
            random_state=42,
        )
        self._model.fit(X)
        self._train_mean = X.mean(axis=0)
        self._train_std = X.std(axis=0)
        self._trained = True

    def train(self, events: list[NormalisedEvent]) -> None:
        features = [_extract_features(e) for e in events]
        X = np.array(features)
        self._fit_model(X)

    def score(self, event: NormalisedEvent) -> float:
        if not self._trained or self._model is None:
            return 0.0
        features = _extract_features(event)
        X = np.array([features])
        raw_score = self._model.decision_function(X)[0]
        if self._train_mean is not None and self._train_std is not None:
            diff = (np.array(features) - self._train_mean) / np.clip(self._train_std, 1e-10, None)
            distance = float(np.linalg.norm(diff))
            anomaly_component = max(0.0, -raw_score)
            distance_component = 1.0 - (1.0 / (1.0 + distance))
            return max(0.0, min(1.0, (anomaly_component + distance_component) / 2.0))
        return max(0.0, min(1.0, -raw_score))

    def detect(self, event: NormalisedEvent) -> Optional[SignalEvent]:
        features = _extract_features(event)

        if not self._trained:
            self._buffer.append(features)
            if len(self._buffer) >= self._min_samples:
                X = np.array(self._buffer)
                self._fit_model(X)
            return None

        assert self._model is not None
        prediction = self._model.predict(np.array([features]))[0]

        if prediction == -1:
            confidence = self.score(event)
            return SignalEvent(
                id=str(uuid.uuid4()),
                timestamp=datetime.now(timezone.utc).isoformat(),
                event_type="anomaly_isolation_forest",
                confidence=confidence,
                direction="VOLATILITY",
                urgency="IMMEDIATE",
                contributing_event_ids=[event.id],
            )

        return None


def compare_detectors(
    zscore_detector: object,
    iforest_detector: "IsolationForestDetector",
    events: list[NormalisedEvent],
) -> dict[str, int]:
    """Run both detectors on the same events and compare detection rates."""
    zscore_count = 0
    iforest_count = 0

    for event in events:
        zresult = zscore_detector.detect(event)  # type: ignore[union-attr]
        if zresult is not None:
            zscore_count += 1

        iresult = iforest_detector.detect(event)
        if iresult is not None:
            iforest_count += 1

    return {
        "zscore_detections": zscore_count,
        "iforest_detections": iforest_count,
        "total_events": len(events),
    }
