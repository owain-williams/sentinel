"""Domain models mirroring @sentinel/shared TypeScript types."""

from dataclasses import dataclass
from enum import StrEnum
from typing import Optional


class DataSource(StrEnum):
    FINNHUB = "FINNHUB"
    QUIVER = "QUIVER"
    GDELT = "GDELT"
    ADSB = "ADSB"
    POLYMARKET = "POLYMARKET"
    BETFAIR = "BETFAIR"
    FRED = "FRED"


class EventCategory(StrEnum):
    OPTIONS_FLOW = "OPTIONS_FLOW"
    CONGRESS_TRADE = "CONGRESS_TRADE"
    GEOPOLITICAL = "GEOPOLITICAL"
    FLIGHT = "FLIGHT"
    PREDICTION_MARKET = "PREDICTION_MARKET"
    MACRO = "MACRO"


@dataclass
class NormalisedEvent:
    id: str
    timestamp: str
    source: DataSource
    category: EventCategory
    raw_value: float
    baseline_value: float
    confidence: float
    raw_payload: dict

    subcategory: Optional[str] = None
    ticker: Optional[str] = None
    region: Optional[str] = None
    sector: Optional[str] = None
    z_score: Optional[float] = None
    percentile_rank: Optional[float] = None


@dataclass
class SignalEvent:
    id: str
    timestamp: str
    event_type: str
    confidence: float
    direction: str  # BULLISH | BEARISH | VOLATILITY
    urgency: str  # IMMEDIATE | HOURS | DAYS
    contributing_event_ids: list[str]
    source: str | None = None  # DataSource of the originating event
    subcategory: str | None = None
    sector_impact: list[str] | None = None
    suggested_instruments: list[dict] | None = None
