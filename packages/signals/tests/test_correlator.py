"""Tests for the cross-source correlation engine."""

from datetime import datetime, timezone

import pytest
import redis as redis_lib

from src.correlator import CorrelationEngine, CorrelationRule
from src.models import DataSource, SignalEvent


@pytest.fixture
def redis_client():
    r = redis_lib.from_url("redis://localhost:6379", decode_responses=True)
    yield r
    r.close()


def _make_signal(
    source: str = "GDELT",
    event_type: str = "anomaly_zscore",
    confidence: float = 0.7,
    timestamp: str | None = None,
    subcategory: str | None = None,
) -> SignalEvent:
    import uuid

    return SignalEvent(
        id=str(uuid.uuid4()),
        timestamp=timestamp or datetime.now(timezone.utc).isoformat(),
        event_type=event_type,
        confidence=confidence,
        direction="VOLATILITY",
        urgency="IMMEDIATE",
        contributing_event_ids=["evt-1"],
        sector_impact=None,
        suggested_instruments=None,
        source=source,
        subcategory=subcategory,
    )


MILITARY_RULE = CorrelationRule(
    name="military_action",
    required_sources=[DataSource.GDELT, DataSource.ADSB],
    optional_sources=[DataSource.FINNHUB],
    time_window_minutes=240,
    min_confidence=0.5,
    event_type="military_action",
    direction="BULLISH",
    urgency="IMMEDIATE",
    sector_impact=["Energy", "Industrials"],
)


def test_no_match_with_single_source():
    engine = CorrelationEngine(rules=[MILITARY_RULE])

    results = engine.ingest(_make_signal(source="GDELT"))

    assert results == []


def test_match_when_required_sources_within_window():
    engine = CorrelationEngine(rules=[MILITARY_RULE])

    # First required source — no match yet
    results1 = engine.ingest(_make_signal(source="GDELT"))
    assert results1 == []

    # Second required source — should trigger
    results2 = engine.ingest(_make_signal(source="ADSB"))
    assert len(results2) == 1

    compound = results2[0]
    assert compound.event_type == "military_action"
    assert compound.direction == "BULLISH"
    assert compound.urgency == "IMMEDIATE"
    assert compound.sector_impact == ["Energy", "Industrials"]
    assert compound.confidence >= 0.5


def test_no_match_when_outside_time_window():
    from datetime import timedelta

    engine = CorrelationEngine(rules=[MILITARY_RULE])

    # Signal from 5 hours ago (outside 240-min window)
    old_time = (datetime.now(timezone.utc) - timedelta(hours=5)).isoformat()
    engine.ingest(_make_signal(source="GDELT", timestamp=old_time))

    # Recent signal — but the GDELT one is too old
    results = engine.ingest(_make_signal(source="ADSB"))
    assert results == []


def test_optional_sources_boost_confidence():
    engine = CorrelationEngine(rules=[MILITARY_RULE])

    # Required sources only
    engine_base = CorrelationEngine(rules=[MILITARY_RULE])
    engine_base.ingest(_make_signal(source="GDELT", confidence=0.7))
    base_results = engine_base.ingest(_make_signal(source="ADSB", confidence=0.7))
    base_confidence = base_results[0].confidence

    # Required + optional sources
    engine.ingest(_make_signal(source="GDELT", confidence=0.7))
    engine.ingest(_make_signal(source="FINNHUB", confidence=0.8))  # optional
    boosted_results = engine.ingest(_make_signal(source="ADSB", confidence=0.7))
    boosted_confidence = boosted_results[0].confidence

    assert boosted_confidence > base_confidence


def test_rejects_match_below_min_confidence():
    high_threshold_rule = CorrelationRule(
        name="strict_rule",
        required_sources=[DataSource.GDELT, DataSource.ADSB],
        optional_sources=[],
        time_window_minutes=240,
        min_confidence=0.9,  # Very high threshold
        event_type="strict_event",
        direction="BEARISH",
        urgency="HOURS",
    )
    engine = CorrelationEngine(rules=[high_threshold_rule])

    engine.ingest(_make_signal(source="GDELT", confidence=0.3))
    results = engine.ingest(_make_signal(source="ADSB", confidence=0.3))

    # Average confidence 0.3 < min 0.9, should not match
    assert results == []


def test_multiple_rules_can_fire_independently():
    energy_rule = CorrelationRule(
        name="energy_disruption",
        required_sources=[DataSource.FINNHUB, DataSource.GDELT],
        optional_sources=[],
        time_window_minutes=240,
        min_confidence=0.5,
        event_type="energy_disruption",
        direction="BULLISH",
        urgency="HOURS",
    )
    engine = CorrelationEngine(rules=[MILITARY_RULE, energy_rule])

    # Signals that satisfy the energy rule but not military
    engine.ingest(_make_signal(source="FINNHUB", confidence=0.7))
    results = engine.ingest(_make_signal(source="GDELT", confidence=0.7))

    # Only energy rule should fire (military needs ADSB)
    assert len(results) == 1
    assert results[0].event_type == "energy_disruption"


def test_default_rules_are_loadable():
    """Default correlation rules from the PRD should be importable and valid."""
    from src.correlator import DEFAULT_RULES

    assert len(DEFAULT_RULES) == 5
    names = {r.name for r in DEFAULT_RULES}
    assert names == {
        "military_action",
        "policy_shift",
        "energy_disruption",
        "market_event",
        "financial_stress",
    }


def test_worker_feeds_detector_signals_through_correlator(redis_client):
    """Integration: SignalWorker should feed detector outputs into the correlator."""
    import json
    import uuid

    from src.worker_loop import SignalWorker

    events_stream = "test:corr:events"
    signals_stream = "test:corr:signals"

    redis_client.delete(events_stream, signals_stream)

    worker = SignalWorker(
        redis_url="redis://localhost:6379",
        events_stream=events_stream,
        signals_stream=signals_stream,
        group_name="test-corr-group",
        consumer_name="test-corr-worker",
    )

    # Build baseline for z-score detector (GDELT source)
    for val in [10, 12, 11, 9, 10, 11, 10, 12, 9, 10]:
        event = {
            "id": str(uuid.uuid4()),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "source": "GDELT",
            "category": "GEOPOLITICAL",
            "rawValue": val,
            "baselineValue": 10,
            "confidence": 0.8,
            "rawPayload": {},
            "subcategory": "military",
            "ticker": None,
        }
        redis_client.xadd(events_stream, {"data": json.dumps(event)})
    worker.process_batch()

    # Build baseline for ADSB source
    for val in [5, 6, 5, 4, 5, 6, 5, 4, 5, 6]:
        event = {
            "id": str(uuid.uuid4()),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "source": "ADSB",
            "category": "FLIGHT",
            "rawValue": val,
            "baselineValue": 5,
            "confidence": 0.7,
            "rawPayload": {},
            "subcategory": "military_activity",
            "ticker": None,
        }
        redis_client.xadd(events_stream, {"data": json.dumps(event)})
    worker.process_batch()

    # Now spike both GDELT and ADSB — should trigger per-source anomalies
    # that then correlate into a military_action compound signal
    gdelt_spike = {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source": "GDELT",
        "category": "GEOPOLITICAL",
        "rawValue": 500,
        "baselineValue": 10,
        "confidence": 0.9,
        "rawPayload": {},
        "subcategory": "military",
        "ticker": None,
    }
    adsb_spike = {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source": "ADSB",
        "category": "FLIGHT",
        "rawValue": 500,
        "baselineValue": 5,
        "confidence": 0.9,
        "rawPayload": {},
        "subcategory": "military_activity",
        "ticker": None,
    }

    redis_client.xadd(events_stream, {"data": json.dumps(gdelt_spike)})
    redis_client.xadd(events_stream, {"data": json.dumps(adsb_spike)})
    worker.process_batch()

    # Read all signals from the stream
    entries = redis_client.xrange(signals_stream, count=50)
    signals = [json.loads(fields["data"]) for _id, fields in entries]

    # Should have per-source anomalies AND at least one compound signal
    event_types = [s["event_type"] for s in signals]
    assert "military_action" in event_types, f"Expected military_action in {event_types}"

    redis_client.delete(events_stream, signals_stream)
