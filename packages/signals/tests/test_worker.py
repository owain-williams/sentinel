"""Tests for the signal worker's Redis Streams consumer."""

import json
import uuid

import redis

from src.models import DataSource, EventCategory, NormalisedEvent
from src.worker import consume_events, ensure_consumer_group

REDIS_URL = "redis://localhost:6379"
STREAM_KEY = "test:python:events:raw"
GROUP_NAME = "test-python-group"
CONSUMER_NAME = "test-python-consumer"


def make_event(**overrides) -> dict:
    base = {
        "id": str(uuid.uuid4()),
        "timestamp": "2026-04-03T12:00:00.000Z",
        "source": DataSource.FINNHUB,
        "category": EventCategory.OPTIONS_FLOW,
        "subcategory": "unusual_volume",
        "ticker": "AAPL",
        "rawValue": 15000,
        "baselineValue": 5000,
        "confidence": 0.85,
        "rawPayload": {"volume": 15000},
    }
    base.update(overrides)
    return base


class TestWorkerConsumer:
    def setup_method(self):
        self.r = redis.from_url(REDIS_URL, decode_responses=True)
        self.r.delete(STREAM_KEY)

    def teardown_method(self):
        self.r.delete(STREAM_KEY)
        self.r.close()

    def _publish(self, event: dict):
        self.r.xadd(STREAM_KEY, {"data": json.dumps(event)})

    def test_consumes_single_event(self):
        event_data = make_event(ticker="TSLA")
        self._publish(event_data)

        events = consume_events(
            self.r, STREAM_KEY, GROUP_NAME, CONSUMER_NAME, count=10
        )

        assert len(events) == 1
        assert isinstance(events[0], NormalisedEvent)
        assert events[0].ticker == "TSLA"
        assert events[0].source == DataSource.FINNHUB
        assert events[0].confidence == 0.85

    def test_consumes_multiple_events_in_order(self):
        for ticker in ["AAPL", "GOOG", "MSFT"]:
            self._publish(make_event(ticker=ticker))

        events = consume_events(
            self.r, STREAM_KEY, GROUP_NAME, CONSUMER_NAME, count=10
        )

        assert len(events) == 3
        assert events[0].ticker == "AAPL"
        assert events[1].ticker == "GOOG"
        assert events[2].ticker == "MSFT"

    def test_acknowledges_messages(self):
        self._publish(make_event(ticker="NFLX"))

        first = consume_events(
            self.r, STREAM_KEY, GROUP_NAME, CONSUMER_NAME, count=10
        )
        assert len(first) == 1

        second = consume_events(
            self.r, STREAM_KEY, GROUP_NAME, CONSUMER_NAME, count=10
        )
        assert len(second) == 0

    def test_deserialises_all_fields(self):
        event_data = make_event(
            zScore=3.2,
            percentileRank=98,
            region="USA",
            sector="Energy",
        )
        self._publish(event_data)

        events = consume_events(
            self.r, STREAM_KEY, GROUP_NAME, CONSUMER_NAME, count=10
        )

        e = events[0]
        assert e.z_score == 3.2
        assert e.percentile_rank == 98
        assert e.region == "USA"
        assert e.sector == "Energy"
        assert e.raw_payload == {"volume": 15000}
