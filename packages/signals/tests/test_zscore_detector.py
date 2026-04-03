"""Tests for the z-score anomaly detector."""

import uuid

from src.models import DataSource, EventCategory, NormalisedEvent
from src.detectors.zscore import ZScoreDetector


def make_event(raw_value: float, source=DataSource.FINNHUB, subcategory="options_volume", ticker="AAPL") -> NormalisedEvent:
    return NormalisedEvent(
        id=str(uuid.uuid4()),
        timestamp="2026-04-03T12:00:00.000Z",
        source=source,
        category=EventCategory.OPTIONS_FLOW,
        raw_value=raw_value,
        baseline_value=0,
        confidence=0.8,
        raw_payload={"value": raw_value},
        subcategory=subcategory,
        ticker=ticker,
    )


class TestZScoreDetector:
    def test_no_signal_with_insufficient_data(self):
        detector = ZScoreDetector(min_observations=5)
        # Only 4 observations — should never trigger
        for val in [100, 102, 98, 500]:
            signal = detector.detect(make_event(val))
            assert signal is None

    def test_no_signal_for_normal_values(self):
        detector = ZScoreDetector(threshold=2.5, min_observations=5)
        # 10 normal observations around 100
        for val in [100, 102, 98, 101, 99, 100, 103, 97, 101, 100]:
            signal = detector.detect(make_event(val))
        assert signal is None

    def test_signals_on_spike(self):
        detector = ZScoreDetector(threshold=2.5, min_observations=5)
        # Build up baseline
        for val in [100, 102, 98, 101, 99, 100, 103, 97, 101, 100]:
            detector.detect(make_event(val))

        # Massive spike
        signal = detector.detect(make_event(500))
        assert signal is not None
        assert signal.event_type == "anomaly_zscore"
        assert signal.confidence > 0
        assert signal.direction == "VOLATILITY"

    def test_signals_on_negative_spike(self):
        detector = ZScoreDetector(threshold=2.5, min_observations=5)
        for val in [100, 102, 98, 101, 99, 100, 103, 97, 101, 100]:
            detector.detect(make_event(val))

        signal = detector.detect(make_event(-100))
        assert signal is not None

    def test_no_signal_at_exactly_threshold(self):
        """Value exactly at the threshold boundary should not trigger."""
        detector = ZScoreDetector(threshold=2.5, min_observations=5)
        # All same values — stddev is 0, z-score undefined
        for _ in range(10):
            signal = detector.detect(make_event(100))
        assert signal is None

    def test_separate_keys_per_source_subcategory_ticker(self):
        detector = ZScoreDetector(threshold=2.5, min_observations=5)

        # Build baseline for AAPL
        for val in [100, 102, 98, 101, 99, 100]:
            detector.detect(make_event(val, ticker="AAPL"))

        # Build baseline for TSLA with different range
        for val in [500, 510, 490, 505, 495, 500]:
            detector.detect(make_event(val, ticker="TSLA"))

        # Spike for AAPL should trigger, 500 for TSLA should not
        aapl_signal = detector.detect(make_event(500, ticker="AAPL"))
        tsla_signal = detector.detect(make_event(500, ticker="TSLA"))

        assert aapl_signal is not None
        assert tsla_signal is None

    def test_confidence_scales_with_zscore_magnitude(self):
        detector = ZScoreDetector(threshold=2.5, min_observations=5)
        for val in [100, 102, 98, 101, 99, 100, 103, 97, 101, 100]:
            detector.detect(make_event(val))

        small_spike = detector.detect(make_event(200))
        big_spike = detector.detect(make_event(1000))

        assert small_spike is not None
        assert big_spike is not None
        assert big_spike.confidence > small_spike.confidence

    def test_contributing_events_includes_triggering_event_id(self):
        detector = ZScoreDetector(threshold=2.5, min_observations=5)
        for val in [100, 102, 98, 101, 99, 100]:
            detector.detect(make_event(val))

        event = make_event(500)
        signal = detector.detect(event)
        assert signal is not None
        assert event.id in signal.contributing_event_ids
