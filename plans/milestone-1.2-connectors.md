# Plan: Milestone 1.2 — First Connectors (Finnhub, GDELT, FRED)

> Source PRD: PRD-sentinel.md, Phase 1 Milestone 1.2

## Architectural decisions

Durable decisions that apply across all phases:

- **Connector interface**: All connectors implement `Connector` — `connect()`, `disconnect()`, `onData()`, `healthCheck()`
- **Normalisation**: Every connector emits `NormalisedEvent` (from `@sentinel/shared`) before publishing to Redis
- **Redis stream**: All connectors publish to `events:raw` stream
- **Config**: API keys from environment variables, polling intervals configurable
- **Testing**: msw for HTTP mocking, fixtures for WebSocket mocking
- **Health checks**: Each connector tracks last successful fetch timestamp

---

## Phase 1: Connector Interface + FRED

**User stories**: As the operator, I need macro regime data (VIX, yield curve, dollar index) ingested daily so the system can assess market conditions.

### What to build

Define the `Connector` interface in `@sentinel/ingestion`. Implement the FRED connector that fetches VIX (VIXCLS), 2Y yield (DGS2), 10Y yield (DGS10), Fed Funds Rate (FEDFUNDS), and Dollar Index (DTWEXBGS) from the FRED REST API. Each series observation becomes a `NormalisedEvent` with category `MACRO`. The connector publishes to Redis on each poll. Tested end-to-end with msw intercepting FRED API calls.

### Acceptance criteria

- [ ] `Connector` interface defined and exported from `@sentinel/ingestion`
- [ ] FRED connector fetches all 6 series via REST
- [ ] Each series observation is normalised with source=FRED, category=MACRO
- [ ] 2s10s spread calculated from DGS10 - DGS2
- [ ] Events published to `events:raw` Redis stream
- [ ] Health check returns true when last fetch < 25 hours ago
- [ ] Integration test: msw intercepts FRED API → connector runs → events appear in Redis

---

## Phase 2: GDELT Connector

**User stories**: As the operator, I need real-time geopolitical event monitoring so the system can detect emerging crises.

### What to build

GDELT connector that polls the GDELT Doc API every 15 minutes with configurable keyword sets (military, energy, trade/sanctions, financial). Returns article counts, tone scores, and source countries. Each keyword set poll produces a `NormalisedEvent` with category `GEOPOLITICAL`. Calculates article volume vs a rolling 24-hour baseline for anomaly scoring. Tested with msw.

### Acceptance criteria

- [ ] GDELT connector polls with 4 default keyword sets
- [ ] Each poll produces `NormalisedEvent`s with tone and article count data
- [ ] Baseline tracking: maintains rolling 24h mean article count per keyword set
- [ ] z-score calculated against baseline
- [ ] Events published to `events:raw`
- [ ] Health check tracks last successful poll
- [ ] Integration test: msw intercepts GDELT API → events in Redis with correct categories

---

## Phase 3: Finnhub REST Connector (Options Chains)

**User stories**: As the operator, I need unusual options activity detection so the system can identify potential event trades.

### What to build

Finnhub REST connector that fetches options chain snapshots and historical candle data for a configurable watchlist. Calculates anomaly metrics per ticker: volume z-score vs 20-day average, put/call volume ratio vs 20-day average, IV percentile rank. Polls on a configurable interval (default 5 min). Each ticker with anomalous readings produces a `NormalisedEvent` with category `OPTIONS_FLOW`. Tested with msw.

### Acceptance criteria

- [ ] Finnhub REST connector fetches options chains for watchlist tickers
- [ ] Historical candle data used to build volume baseline (20-day)
- [ ] Anomaly metrics calculated: volume z-score, put/call ratio, IV percentile
- [ ] Events published to `events:raw` with subcategory (unusual_volume, iv_spike, etc.)
- [ ] Respects rate limit (60 calls/min) with request throttling
- [ ] Health check tracks last successful fetch
- [ ] Integration test: msw intercepts Finnhub REST → anomaly events in Redis

---

## Phase 4: Finnhub WebSocket Connector (Real-time Trades)

**User stories**: As the operator, I need real-time price streaming so the system has continuous market awareness.

### What to build

Finnhub WebSocket connector that streams real-time trade data for up to 50 symbols. Manages subscriptions, handles reconnection on disconnect, and emits `NormalisedEvent`s for significant price movements. Configurable watchlist. Health check verifies WebSocket connection is alive and receiving data. Tested with fixture-based WebSocket mock.

### Acceptance criteria

- [ ] WebSocket connector subscribes to configurable watchlist (up to 50 symbols)
- [ ] Emits `NormalisedEvent`s with category `OPTIONS_FLOW`, subcategory `price_update`
- [ ] Automatic reconnection with exponential backoff on disconnect
- [ ] Health check: connection alive + last message < 60 seconds ago
- [ ] Events published to `events:raw`
- [ ] Test with fixture data verifying event normalisation and publish
