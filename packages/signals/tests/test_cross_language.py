"""Cross-language integration test: TS publishes to Redis, Python consumes."""

import json
import subprocess
import sys
import uuid

import redis

from src.models import DataSource, EventCategory
from src.worker import consume_events

REDIS_URL = "redis://localhost:6379"
STREAM_KEY = "test:cross-lang:events"
GROUP_NAME = "test-cross-lang-group"
CONSUMER_NAME = "test-cross-lang-consumer"

# Inline TS script that publishes an event to Redis using ioredis
TS_PUBLISH_SCRIPT = """
import {{ Redis }} from "ioredis";

const redis = new Redis("{redis_url}");
const event = {{
  id: "{event_id}",
  timestamp: "2026-04-03T12:00:00.000Z",
  source: "FINNHUB",
  category: "OPTIONS_FLOW",
  subcategory: "unusual_volume",
  ticker: "NVDA",
  rawValue: 25000,
  baselineValue: 8000,
  confidence: 0.92,
  rawPayload: {{ gpu_demand: "high" }},
}};

await redis.xadd("{stream_key}", "*", "data", JSON.stringify(event));
await redis.quit();
"""


class TestCrossLanguage:
    def setup_method(self):
        self.r = redis.from_url(REDIS_URL, decode_responses=True)
        self.r.delete(STREAM_KEY)

    def teardown_method(self):
        self.r.delete(STREAM_KEY)
        self.r.close()

    def test_ts_publishes_python_consumes(self):
        event_id = str(uuid.uuid4())

        script = TS_PUBLISH_SCRIPT.format(
            redis_url="redis://localhost:6379",
            event_id=event_id,
            stream_key=STREAM_KEY,
        )

        # Run the TS script via vp exec to use the project's node/ioredis
        result = subprocess.run(
            ["node", "--input-type=module"],
            input=script,
            capture_output=True,
            text=True,
            cwd="/Users/owainwilliams/sentinel/packages/shared",
            timeout=10,
        )

        assert result.returncode == 0, f"TS script failed: {result.stderr}"

        # Now consume from Python
        events = consume_events(
            self.r, STREAM_KEY, GROUP_NAME, CONSUMER_NAME, count=10
        )

        assert len(events) == 1
        e = events[0]
        assert e.id == event_id
        assert e.source == DataSource.FINNHUB
        assert e.category == EventCategory.OPTIONS_FLOW
        assert e.ticker == "NVDA"
        assert e.raw_value == 25000
        assert e.baseline_value == 8000
        assert e.confidence == 0.92
        assert e.raw_payload == {"gpu_demand": "high"}
