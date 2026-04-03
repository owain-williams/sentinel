"""Cross-source correlation engine.

Maintains a sliding window of recent signals and evaluates correlation rules
that require anomalies from multiple data sources within a time window.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from src.models import DataSource, SignalEvent


@dataclass
class CorrelationRule:
    name: str
    required_sources: list[DataSource]
    optional_sources: list[DataSource]
    time_window_minutes: int
    min_confidence: float
    event_type: str
    direction: str
    urgency: str
    sector_impact: list[str] | None = None


DEFAULT_RULES: list[CorrelationRule] = [
    CorrelationRule(
        name="military_action",
        required_sources=[DataSource.GDELT, DataSource.ADSB],
        optional_sources=[DataSource.FINNHUB],
        time_window_minutes=240,
        min_confidence=0.5,
        event_type="military_action",
        direction="BULLISH",
        urgency="IMMEDIATE",
        sector_impact=["Energy", "Industrials"],
    ),
    CorrelationRule(
        name="policy_shift",
        required_sources=[DataSource.QUIVER, DataSource.FINNHUB],
        optional_sources=[DataSource.GDELT],
        time_window_minutes=480,
        min_confidence=0.5,
        event_type="policy_shift",
        direction="VOLATILITY",
        urgency="HOURS",
        sector_impact=["Financials"],
    ),
    CorrelationRule(
        name="energy_disruption",
        required_sources=[DataSource.FINNHUB, DataSource.GDELT],
        optional_sources=[DataSource.ADSB],
        time_window_minutes=240,
        min_confidence=0.5,
        event_type="energy_disruption",
        direction="BULLISH",
        urgency="IMMEDIATE",
        sector_impact=["Energy"],
    ),
    CorrelationRule(
        name="market_event",
        required_sources=[DataSource.POLYMARKET, DataSource.BETFAIR],
        optional_sources=[DataSource.FINNHUB],
        time_window_minutes=120,
        min_confidence=0.5,
        event_type="market_event",
        direction="VOLATILITY",
        urgency="IMMEDIATE",
    ),
    CorrelationRule(
        name="financial_stress",
        required_sources=[DataSource.FRED, DataSource.FINNHUB],
        optional_sources=[DataSource.GDELT],
        time_window_minutes=480,
        min_confidence=0.5,
        event_type="financial_stress",
        direction="BEARISH",
        urgency="HOURS",
        sector_impact=["Financials"],
    ),
]


class CorrelationEngine:
    def __init__(self, rules: list[CorrelationRule]):
        self._rules = rules
        self._window: list[SignalEvent] = []

    def ingest(self, signal: SignalEvent) -> list[SignalEvent]:
        """Ingest a signal and return any compound signals triggered."""
        self._window.append(signal)
        self._prune_window()

        results: list[SignalEvent] = []
        for rule in self._rules:
            compound = self._evaluate_rule(rule)
            if compound is not None:
                results.append(compound)

        return results

    def _prune_window(self) -> None:
        """Remove signals older than the longest rule window."""
        if not self._rules:
            return
        max_window = max(r.time_window_minutes for r in self._rules)
        now = datetime.now(timezone.utc)
        self._window = [
            s for s in self._window
            if (now - datetime.fromisoformat(s.timestamp)).total_seconds() / 60 <= max_window
        ]

    def _evaluate_rule(self, rule: CorrelationRule) -> SignalEvent | None:
        """Check if all required sources have signals within the rule's time window."""
        now = datetime.now(timezone.utc)
        window_signals = [
            s for s in self._window
            if (now - datetime.fromisoformat(s.timestamp)).total_seconds() / 60 <= rule.time_window_minutes
        ]

        # Check required sources
        sources_present = {s.source for s in window_signals if s.source is not None}
        required_set = set(rule.required_sources)
        if not required_set.issubset(sources_present):
            return None

        # Gather contributing signals (those from required sources)
        contributing = [
            s for s in window_signals
            if s.source in required_set
        ]

        # Calculate base confidence from contributing signals
        avg_confidence = sum(s.confidence for s in contributing) / len(contributing)
        if avg_confidence < rule.min_confidence:
            return None

        # Boost confidence for optional sources present
        optional_set = set(rule.optional_sources)
        optional_present = sources_present & optional_set
        confidence_boost = len(optional_present) * 0.1
        combined_confidence = min(1.0, avg_confidence + confidence_boost)

        contributing_ids = []
        for s in contributing:
            contributing_ids.extend(s.contributing_event_ids)

        return SignalEvent(
            id=str(uuid.uuid4()),
            timestamp=datetime.now(timezone.utc).isoformat(),
            event_type=rule.event_type,
            confidence=combined_confidence,
            direction=rule.direction,
            urgency=rule.urgency,
            contributing_event_ids=contributing_ids,
            sector_impact=rule.sector_impact,
        )
