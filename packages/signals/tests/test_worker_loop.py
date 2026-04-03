"""Tests for the worker loop that wires detectors to Redis streams."""

import json
import uuid

import pytest
import redis as redis_lib

from src.models import DataSource, EventCategory, NormalisedEvent, SignalEvent
from src.worker_loop import SignalWorker

EVENTS_STREAM = "test:events:raw"
SIGNALS_STREAM = "test:signals:detected"
GROUP = "test-signal-workers"
CONSUMER = "test-worker-1"


def make_raw_event(raw_value: float, ticker: str = "AAPL", subcategory: str = "trade") -> dict:
    """Create a raw event dict as it would appear on the Redis stream (camelCase keys)."""
    return {
        "id": str(uuid.uuid4()),
        "timestamp": "2026-04-03T14:00:00.000Z",
        "source": "FINNHUB",
        "category": "OPTIONS_FLOW",
        "rawValue": raw_value,
        "baselineValue": 0,
        "confidence": 0.8,
        "rawPayload": {"volume": raw_value},
        "subcategory": subcategory,
        "ticker": ticker,
    }


@pytest.fixture
def redis_client():
    r = redis_lib.from_url("redis://localhost:6379", decode_responses=True)
    r.delete(EVENTS_STREAM, SIGNALS_STREAM)
    yield r
    r.delete(EVENTS_STREAM, SIGNALS_STREAM)
    r.close()


def publish_event(r: redis_lib.Redis, event_dict: dict) -> None:
    r.xadd(EVENTS_STREAM, {"data": json.dumps(event_dict)})


def read_signals(r: redis_lib.Redis, count: int = 20) -> list[dict]:
    """Read raw signal dicts from the signals stream."""
    entries = r.xrange(SIGNALS_STREAM, count=count)
    return [json.loads(fields["data"]) for _id, fields in entries]


class TestSignalWorker:
    def test_processes_events_through_detectors(self, redis_client):
        worker = SignalWorker(
            redis_url="redis://localhost:6379",
            events_stream=EVENTS_STREAM,
            signals_stream=SIGNALS_STREAM,
            group_name=GROUP,
            consumer_name=CONSUMER,
        )

        # Build baseline (10 normal events)
        for val in [100, 102, 98, 101, 99, 100, 103, 97, 101, 100]:
            publish_event(redis_client, make_raw_event(val))

        worker.process_batch()

        # Spike event
        publish_event(redis_client, make_raw_event(500))
        worker.process_batch()

        signals = read_signals(redis_client)
        assert len(signals) >= 1
        assert signals[0]["event_type"] == "anomaly_zscore"

    def test_no_signals_for_normal_data(self, redis_client):
        worker = SignalWorker(
            redis_url="redis://localhost:6379",
            events_stream=EVENTS_STREAM,
            signals_stream=SIGNALS_STREAM,
            group_name=GROUP,
            consumer_name=CONSUMER,
        )

        for val in [100, 102, 98, 101, 99]:
            publish_event(redis_client, make_raw_event(val))

        worker.process_batch()

        signals = read_signals(redis_client)
        assert len(signals) == 0

    def test_multiple_detectors_can_fire(self, redis_client):
        worker = SignalWorker(
            redis_url="redis://localhost:6379",
            events_stream=EVENTS_STREAM,
            signals_stream=SIGNALS_STREAM,
            group_name=GROUP,
            consumer_name=CONSUMER,
        )

        # Build baseline for both detectors (same hour, same ticker)
        for val in [100, 102, 98, 101, 99, 100, 103, 97, 101, 100]:
            publish_event(redis_client, make_raw_event(val))
        worker.process_batch()

        # Massive spike should trigger both z-score and volume profile
        publish_event(redis_client, make_raw_event(5000))
        worker.process_batch()

        signals = read_signals(redis_client)
        event_types = [s["event_type"] for s in signals]
        assert "anomaly_zscore" in event_types
        assert "anomaly_volume_profile" in event_types

    def test_malformed_event_does_not_crash(self, redis_client):
        worker = SignalWorker(
            redis_url="redis://localhost:6379",
            events_stream=EVENTS_STREAM,
            signals_stream=SIGNALS_STREAM,
            group_name=GROUP,
            consumer_name=CONSUMER,
        )

        # Publish malformed data
        redis_client.xadd(EVENTS_STREAM, {"data": "not valid json{"})
        # And a valid event after it
        publish_event(redis_client, make_raw_event(100))

        # Should not raise — logs and skips the bad event
        worker.process_batch()

    def test_signal_event_is_valid_json_on_stream(self, redis_client):
        worker = SignalWorker(
            redis_url="redis://localhost:6379",
            events_stream=EVENTS_STREAM,
            signals_stream=SIGNALS_STREAM,
            group_name=GROUP,
            consumer_name=CONSUMER,
        )

        for val in [100, 102, 98, 101, 99, 100, 103, 97, 101, 100]:
            publish_event(redis_client, make_raw_event(val))
        worker.process_batch()

        publish_event(redis_client, make_raw_event(500))
        worker.process_batch()

        signals = read_signals(redis_client)
        assert len(signals) >= 1
        signal = signals[0]
        # Verify required SignalEvent fields
        assert "id" in signal
        assert "timestamp" in signal
        assert "event_type" in signal
        assert "confidence" in signal
        assert "direction" in signal
        assert "urgency" in signal
        assert "contributing_event_ids" in signal
