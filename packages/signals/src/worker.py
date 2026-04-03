"""Redis Streams consumer for the signal processing worker."""

import json
import logging

import redis as redis_lib

from src.models import DataSource, EventCategory, NormalisedEvent

logger = logging.getLogger(__name__)


def ensure_consumer_group(
    r: redis_lib.Redis, stream_key: str, group_name: str
) -> None:
    try:
        r.xgroup_create(stream_key, group_name, id="0", mkstream=True)
    except redis_lib.ResponseError as e:
        if "BUSYGROUP" in str(e):
            return
        raise


def _deserialise_event(data: dict) -> NormalisedEvent:
    return NormalisedEvent(
        id=data["id"],
        timestamp=data["timestamp"],
        source=DataSource(data["source"]),
        category=EventCategory(data["category"]),
        raw_value=data["rawValue"],
        baseline_value=data["baselineValue"],
        confidence=data["confidence"],
        raw_payload=data["rawPayload"],
        subcategory=data.get("subcategory"),
        ticker=data.get("ticker"),
        region=data.get("region"),
        sector=data.get("sector"),
        z_score=data.get("zScore"),
        percentile_rank=data.get("percentileRank"),
    )


def consume_events(
    r: redis_lib.Redis,
    stream_key: str,
    group_name: str,
    consumer_name: str,
    count: int = 10,
    block_ms: int = 100,
) -> list[NormalisedEvent]:
    ensure_consumer_group(r, stream_key, group_name)

    results = r.xreadgroup(
        group_name,
        consumer_name,
        {stream_key: ">"},
        count=count,
        block=block_ms,
    )

    if not results:
        return []

    events: list[NormalisedEvent] = []
    message_ids: list[str] = []

    for _stream_name, messages in results:
        for message_id, fields in messages:
            raw = json.loads(fields["data"])
            event = _deserialise_event(raw)
            events.append(event)
            message_ids.append(message_id)

    if message_ids:
        r.xack(stream_key, group_name, *message_ids)

    return events
