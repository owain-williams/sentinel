"""Tests for Isolation Forest anomaly detector."""

from src.detectors.isolation_forest import IsolationForestDetector, _extract_features
from src.models import DataSource, EventCategory, NormalisedEvent


def _make_event(
    raw_value: float = 100.0,
    baseline_value: float = 100.0,
    z_score: float | None = None,
    confidence: float = 0.5,
    source: DataSource = DataSource.FINNHUB,
    timestamp: str = "2026-04-03T14:00:00Z",
) -> NormalisedEvent:
    return NormalisedEvent(
        id="evt-001",
        timestamp=timestamp,
        source=source,
        category=EventCategory.OPTIONS_FLOW,
        raw_value=raw_value,
        baseline_value=baseline_value,
        confidence=confidence,
        raw_payload={},
        z_score=z_score,
    )


class TestIsolationForestDetector:
    def test_returns_none_before_training(self):
        detector = IsolationForestDetector(min_samples=50)

        event = _make_event(raw_value=9999.0)
        result = detector.detect(event)

        assert result is None

    def test_detects_anomaly_after_training_on_normal_data(self):
        detector = IsolationForestDetector(min_samples=50, contamination=0.05)

        # Train on 100 normal events (raw_value ~100, z_score ~0)
        normal_events = [
            _make_event(raw_value=100 + i * 0.1, z_score=0.1 * (i % 5))
            for i in range(100)
        ]
        detector.train(normal_events)

        # An extreme outlier should be detected
        outlier = _make_event(raw_value=9999.0, z_score=50.0, confidence=0.99)
        result = detector.detect(outlier)

        assert result is not None
        assert result.event_type == "anomaly_isolation_forest"
        assert result.direction == "VOLATILITY"
        assert result.confidence > 0

    def test_normal_data_after_training_returns_none(self):
        detector = IsolationForestDetector(min_samples=50, contamination=0.05)

        normal_events = [
            _make_event(raw_value=100 + i * 0.1, z_score=0.1 * (i % 5))
            for i in range(100)
        ]
        detector.train(normal_events)

        # A value within normal range should not trigger
        normal = _make_event(raw_value=102.0, z_score=0.2)
        result = detector.detect(normal)

        assert result is None

    def test_score_increases_with_outlierness(self):
        detector = IsolationForestDetector(min_samples=50, contamination=0.05)

        normal_events = [
            _make_event(raw_value=100 + i * 0.1, z_score=0.1 * (i % 5))
            for i in range(100)
        ]
        detector.train(normal_events)

        mild_outlier = _make_event(raw_value=200.0, z_score=5.0)
        extreme_outlier = _make_event(raw_value=10000.0, z_score=50.0)

        mild_score = detector.score(mild_outlier)
        extreme_score = detector.score(extreme_outlier)

        assert extreme_score > mild_score

    def test_feature_extraction_from_normalised_event(self):
        event = _make_event(
            raw_value=150.0,
            baseline_value=100.0,
            z_score=3.5,
            confidence=0.8,
            timestamp="2026-04-03T14:30:00Z",  # hour = 14
        )

        features = _extract_features(event)

        assert features == [150.0, 100.0, 3.5, 0.8, 14.0]

    def test_feature_extraction_defaults_z_score_to_zero(self):
        event = _make_event(z_score=None)

        features = _extract_features(event)

        assert features[2] == 0.0  # z_score defaults to 0

    def test_ab_comparison_returns_detection_rates_for_both_detectors(self):
        from src.detectors.isolation_forest import compare_detectors
        from src.detectors.zscore import ZScoreDetector

        zscore = ZScoreDetector(threshold=2.5, min_observations=5)
        iforest = IsolationForestDetector(min_samples=10, contamination=0.1)

        # Build up baseline for both detectors
        normal_events = [
            _make_event(raw_value=100.0 + (i % 3) * 0.1, z_score=0.0)
            for i in range(50)
        ]

        # Sprinkle in a few anomalies
        anomaly_events = [
            _make_event(raw_value=9999.0, z_score=50.0),
            _make_event(raw_value=1.0, z_score=-40.0),
        ]

        all_events = normal_events + anomaly_events

        result = compare_detectors(zscore, iforest, all_events)

        assert "zscore_detections" in result
        assert "iforest_detections" in result
        assert "total_events" in result
        assert result["total_events"] == len(all_events)
        assert isinstance(result["zscore_detections"], int)
        assert isinstance(result["iforest_detections"], int)

    def test_auto_trains_after_accumulating_min_samples_via_detect(self):
        """Detector trains itself after seeing min_samples events via detect()."""
        detector = IsolationForestDetector(min_samples=20, contamination=0.1)

        # Feed 20 normal events — should auto-train after 20th
        for i in range(20):
            result = detector.detect(
                _make_event(raw_value=100.0 + i * 0.1, z_score=0.0)
            )
            assert result is None  # all normal, no detection during training

        # Now the model is trained — an extreme outlier should be detected
        outlier = _make_event(raw_value=9999.0, z_score=50.0)
        result = detector.detect(outlier)

        assert result is not None
        assert result.event_type == "anomaly_isolation_forest"
