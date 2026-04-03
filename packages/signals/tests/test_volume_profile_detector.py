"""Tests for the volume profile detector."""

import uuid
from datetime import datetime, timezone

from src.models import DataSource, EventCategory, NormalisedEvent
from src.detectors.volume_profile import VolumeProfileDetector


def make_event(
    raw_value: float,
    hour: int = 14,
    ticker: str = "AAPL",
) -> NormalisedEvent:
    ts = datetime(2026, 4, 3, hour, 0, 0, tzinfo=timezone.utc).isoformat()
    return NormalisedEvent(
        id=str(uuid.uuid4()),
        timestamp=ts,
        source=DataSource.FINNHUB,
        category=EventCategory.OPTIONS_FLOW,
        raw_value=raw_value,
        baseline_value=0,
        confidence=0.8,
        raw_payload={"volume": raw_value},
        subcategory="trade",
        ticker=ticker,
    )


class TestVolumeProfileDetector:
    def test_no_signal_with_insufficient_data(self):
        detector = VolumeProfileDetector(min_observations=3)
        # Only 2 observations for hour 14 — should not trigger
        for val in [1000, 1100]:
            signal = detector.detect(make_event(val, hour=14))
            assert signal is None

        # Even a huge spike shouldn't trigger with insufficient data
        signal = detector.detect(make_event(50000, hour=14))
        assert signal is None

    def test_no_signal_for_normal_volume(self):
        detector = VolumeProfileDetector(multiplier=2.0, min_observations=3)
        # Build baseline for hour 14
        for val in [1000, 1100, 900, 1050, 950]:
            signal = detector.detect(make_event(val, hour=14))
        # Normal volume should not trigger
        signal = detector.detect(make_event(1200, hour=14))
        assert signal is None

    def test_signals_on_volume_spike(self):
        detector = VolumeProfileDetector(multiplier=2.0, min_observations=3)
        # Build baseline for hour 14 (~1000 avg)
        for val in [1000, 1100, 900, 1050, 950]:
            detector.detect(make_event(val, hour=14))

        # 3x normal volume should trigger (> 2.0x multiplier)
        signal = detector.detect(make_event(3000, hour=14))
        assert signal is not None
        assert signal.event_type == "anomaly_volume_profile"
        assert signal.confidence > 0
        assert signal.direction == "VOLATILITY"

    def test_different_hours_have_separate_profiles(self):
        detector = VolumeProfileDetector(multiplier=2.0, min_observations=3)
        # Build baseline: hour 10 has ~100 volume, hour 14 has ~1000
        for val in [100, 110, 90, 105]:
            detector.detect(make_event(val, hour=10))
        for val in [1000, 1100, 900, 1050]:
            detector.detect(make_event(val, hour=14))

        # 500 is huge for hour 10 but normal for hour 14
        signal_10 = detector.detect(make_event(500, hour=10))
        signal_14 = detector.detect(make_event(500, hour=14))

        assert signal_10 is not None  # 5x the hour-10 baseline
        assert signal_14 is None  # below the hour-14 baseline

    def test_different_tickers_have_separate_profiles(self):
        detector = VolumeProfileDetector(multiplier=2.0, min_observations=3)
        # AAPL baseline ~1000
        for val in [1000, 1100, 900, 1050]:
            detector.detect(make_event(val, ticker="AAPL"))
        # TSLA baseline ~5000
        for val in [5000, 5100, 4900, 5050]:
            detector.detect(make_event(val, ticker="TSLA"))

        # 3000 is a spike for AAPL but not for TSLA
        aapl_signal = detector.detect(make_event(3000, ticker="AAPL"))
        tsla_signal = detector.detect(make_event(3000, ticker="TSLA"))

        assert aapl_signal is not None
        assert tsla_signal is None

    def test_confidence_based_on_exceedance_ratio(self):
        detector = VolumeProfileDetector(multiplier=2.0, min_observations=3)
        for val in [1000, 1100, 900, 1050, 950]:
            detector.detect(make_event(val, hour=14))

        small_spike = detector.detect(make_event(2500, hour=14))
        big_spike = detector.detect(make_event(5000, hour=14))

        assert small_spike is not None
        assert big_spike is not None
        assert big_spike.confidence > small_spike.confidence

    def test_contributing_events_includes_triggering_event_id(self):
        detector = VolumeProfileDetector(multiplier=2.0, min_observations=3)
        for val in [1000, 1100, 900, 1050]:
            detector.detect(make_event(val, hour=14))

        event = make_event(5000, hour=14)
        signal = detector.detect(event)
        assert signal is not None
        assert event.id in signal.contributing_event_ids
