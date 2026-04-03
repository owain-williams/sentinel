"""Volume profile detector — time-of-day aware anomaly detection."""

import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import Optional

from src.models import NormalisedEvent, SignalEvent


class VolumeProfileDetector:
    def __init__(self, multiplier: float = 2.0, min_observations: int = 3):
        self.multiplier = multiplier
        self.min_observations = min_observations
        # key -> hour -> list of values
        self._profiles: dict[str, dict[int, list[float]]] = defaultdict(
            lambda: defaultdict(list)
        )

    def _key(self, event: NormalisedEvent) -> str:
        return event.ticker or ""

    def _hour(self, event: NormalisedEvent) -> int:
        return datetime.fromisoformat(event.timestamp).hour

    def detect(self, event: NormalisedEvent) -> Optional[SignalEvent]:
        key = self._key(event)
        hour = self._hour(event)
        values = self._profiles[key][hour]

        result = None

        if len(values) >= self.min_observations:
            mean = sum(values) / len(values)
            if mean > 0 and event.raw_value > self.multiplier * mean:
                ratio = event.raw_value / mean
                confidence = min(1.0, ratio / (ratio + 5.0))
                result = SignalEvent(
                    id=str(uuid.uuid4()),
                    timestamp=datetime.now(timezone.utc).isoformat(),
                    event_type="anomaly_volume_profile",
                    confidence=confidence,
                    direction="VOLATILITY",
                    urgency="HOURS",
                    contributing_event_ids=[event.id],
                )

        if result is None:
            values.append(event.raw_value)
        return result
