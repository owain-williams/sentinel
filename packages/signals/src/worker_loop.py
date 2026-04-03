"""Signal worker loop — consumes events, runs detectors, publishes signals."""

import json
import logging
from dataclasses import asdict
from typing import Optional

import redis as redis_lib

from src.correlator import CorrelationEngine, DEFAULT_RULES
from src.detectors.isolation_forest import IsolationForestDetector
from src.detectors.volume_profile import VolumeProfileDetector
from src.detectors.zscore import ZScoreDetector
from src.models import NormalisedEvent, SignalEvent
from src.worker import consume_events

logger = logging.getLogger(__name__)


class SignalWorker:
    def __init__(
        self,
        redis_url: str,
        events_stream: str = "events:raw",
        signals_stream: str = "signals:detected",
        group_name: str = "signal-workers",
        consumer_name: str = "worker-1",
    ):
        self._redis = redis_lib.from_url(redis_url, decode_responses=True)
        self._events_stream = events_stream
        self._signals_stream = signals_stream
        self._group_name = group_name
        self._consumer_name = consumer_name
        self._detectors = [
            ZScoreDetector(),
            VolumeProfileDetector(),
            IsolationForestDetector(),
        ]
        self._correlator = CorrelationEngine(rules=DEFAULT_RULES)

    def process_batch(self) -> list[SignalEvent]:
        """Consume a batch of events, run detectors, correlate, publish signals."""
        try:
            events = consume_events(
                self._redis,
                self._events_stream,
                self._group_name,
                self._consumer_name,
            )
        except Exception:
            logger.exception("Failed to consume events")
            return []

        signals: list[SignalEvent] = []

        for event in events:
            for detector in self._detectors:
                try:
                    signal = detector.detect(event)
                    if signal is not None:
                        # Tag the signal with its originating data source
                        signal.source = event.source
                        signal.subcategory = event.subcategory
                        self._publish_signal(signal)
                        signals.append(signal)

                        # Feed into correlator for cross-source detection
                        compound_signals = self._correlator.ingest(signal)
                        for compound in compound_signals:
                            self._publish_signal(compound)
                            signals.append(compound)
                except Exception:
                    logger.exception(
                        "Detector %s failed on event %s",
                        type(detector).__name__,
                        event.id,
                    )

        return signals

    def _publish_signal(self, signal: SignalEvent) -> None:
        data = asdict(signal)
        self._redis.xadd(self._signals_stream, {"data": json.dumps(data)})
