"""Z-score anomaly detector."""

import uuid
from collections import defaultdict
from datetime import datetime, timezone
from math import sqrt
from typing import Optional

from src.models import NormalisedEvent, SignalEvent


class ZScoreDetector:
    def __init__(self, threshold: float = 2.5, min_observations: int = 5):
        self.threshold = threshold
        self.min_observations = min_observations
        self._stats: dict[str, list[float]] = defaultdict(list)

    def _key(self, event: NormalisedEvent) -> str:
        return f"{event.source}:{event.subcategory or ''}:{event.ticker or ''}"

    def detect(self, event: NormalisedEvent) -> Optional[SignalEvent]:
        key = self._key(event)
        values = self._stats[key]

        result = None

        if len(values) >= self.min_observations:
            n = len(values)
            mean = sum(values) / n
            variance = sum((v - mean) ** 2 for v in values) / n
            stddev = sqrt(variance)

            if stddev > 0:
                z = (event.raw_value - mean) / stddev
                if abs(z) > self.threshold:
                    confidence = min(1.0, abs(z) / (abs(z) + 10.0))
                    result = SignalEvent(
                        id=str(uuid.uuid4()),
                        timestamp=datetime.now(timezone.utc).isoformat(),
                        event_type="anomaly_zscore",
                        confidence=confidence,
                        direction="VOLATILITY",
                        urgency="IMMEDIATE",
                        contributing_event_ids=[event.id],
                    )

        if result is None:
            values.append(event.raw_value)
        return result
