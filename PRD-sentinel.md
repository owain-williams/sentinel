# Product Requirements Document: Sentinel

**Version:** 1.0
**Author:** Owain / Claude
**Date:** April 2026
**Status:** Draft

---

## 1. Product Overview

### 1.1 What Is Sentinel?

Sentinel is a self-hosted, multi-mode financial intelligence platform that ingests publicly available market data from diverse sources, detects anomalous patterns that may precede significant events, and enables the operator to act on those signals across tax-efficient UK trading venues.

It also serves as a personal wealth dashboard and systematic trend-following engine, sharing a common data pipeline across all three modes.

### 1.2 The Three Modes

**Mode 1 — Anomaly Detection & Event Trading.** The core innovation. Monitors options flow, commodity volumes, geopolitical signals (flight tracking, vessel tracking, news events), and prediction market movements. Detects cross-asset anomalies. Classifies probable event types. Alerts the operator and optionally executes trades via spread betting (IG Markets) and prediction markets (Betfair Exchange).

**Mode 2 — Passive Wealth Dashboard.** Aggregates ISA holdings, SIPP balances, spread betting account value, crypto positions, and savings into a single net worth view. Monitors macro regime indicators (VIX, yield curve, credit spreads) and generates alerts when conditions suggest reducing equity exposure or hedging.

**Mode 3 — Systematic Trend Following.** A rules-based, lower-variance strategy that trades major indices and commodities via spread betting. Uses moving average crossovers, momentum indicators, and volatility filters. Runs alongside Mode 1 as a steady return stream. Tax-free via UK spread betting.

### 1.3 Design Principles

The system is built for a single operator (not a team), designed to run on minimal infrastructure (under £15/month), and optimised for UK tax efficiency. Every trading output should be expressible through spread betting (tax-free) or UK-licensed prediction markets (tax-free). The system must maintain a complete audit trail from data source to trade decision, ensuring all signals derive from public data only.

---

## 2. Target User

Solo UK-based developer-trader. Comfortable with TypeScript and Python. Running a limited company. Contributing £500/month to trading capital with 50% profit reinvestment. Operating expenses budget of £10–50/month depending on phase. Existing ISA and SIPP in place or planned.

---

## 3. Critical UK Constraint: Data Source Availability

Research revealed that several data sources commonly cited in US-centric guides are **not available to UK residents.** The PRD accounts for this:

| Source                 | UK Access       | Status                               |
| ---------------------- | --------------- | ------------------------------------ |
| Tradier (options data) | **Blocked**     | Does not accept UK clients           |
| Polymarket (trading)   | **Blocked**     | FCA binary options ban; geofenced    |
| Polymarket (data only) | **Accessible**  | API readable from UK, cannot trade   |
| Betfair Exchange       | **Full access** | UK Gambling Commission licensed      |
| Smarkets               | **Full access** | UK Gambling Commission licensed      |
| IG Markets API         | **Full access** | FCA regulated, API available         |
| CMC Markets API        | **No API**      | No public API for individual traders |
| Finnhub                | **Full access** | Free tier with WebSocket streaming   |
| FRED (macro data)      | **Full access** | Free, 120 req/min                    |
| GDELT (news/events)    | **Full access** | Free, rate-limited                   |
| ADS-B Exchange         | **Full access** | Free tier via RapidAPI               |
| Quiver Quantitative    | **Full access** | Free tier available                  |
| Arkham Intelligence    | **Full access** | Free tier available                  |

**The UK-compatible options data solution:** Finnhub provides options chain data and WebSocket streaming to UK users (60 calls/min free, 50 WebSocket symbols). This replaces Tradier as the primary options data source. EODHD is a secondary option recommended for EU/UK users.

---

## 4. System Architecture

### 4.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        DATA INGESTION (TypeScript)               │
│                                                                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │ Finnhub  │ │ Quiver   │ │  GDELT   │ │  ADS-B   │            │
│  │ Options  │ │ Congress │ │  News    │ │ Flights  │            │
│  │ WS+REST  │ │  REST    │ │  REST    │ │  REST    │            │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘            │
│       │             │            │             │                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │Polymarket│ │ Betfair  │ │  FRED    │ │ Marine   │            │
│  │ Data WS  │ │ Stream   │ │  Macro   │ │ Traffic  │            │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘            │
│       │             │            │             │                  │
│       └──────┬──────┴─────┬──────┴──────┬──────┘                 │
│              ▼            ▼             ▼                         │
│         ┌─────────────────────────────────┐                      │
│         │     Redis Streams (BullMQ)      │                      │
│         │   Normalised Event Schema       │                      │
│         └──────────────┬──────────────────┘                      │
│                        │                                         │
└────────────────────────┼─────────────────────────────────────────┘
                         │
┌────────────────────────┼─────────────────────────────────────────┐
│                        ▼                                         │
│              SIGNAL PROCESSING (Python)                          │
│                                                                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │  Per-Source      │  │  Cross-Source    │  │  Event           │  │
│  │  Anomaly Detect  │  │  Correlation    │  │  Classifier     │  │
│  │  (z-score, IF)   │  │  Engine         │  │                 │  │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  │
│           │                    │                     │            │
│           └────────────┬───────┴─────────────────────┘            │
│                        ▼                                         │
│              ┌──────────────────┐                                 │
│              │  Signal Events   │                                 │
│              │  → Redis Stream  │                                 │
│              └────────┬─────────┘                                 │
│                       │                                          │
└───────────────────────┼──────────────────────────────────────────┘
                        │
┌───────────────────────┼──────────────────────────────────────────┐
│                       ▼                                          │
│              DECISION & EXECUTION (TypeScript)                   │
│                                                                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │  Decision Engine │  │  Risk Manager   │  │  Execution       │  │
│  │  (trade sizing,  │  │  (position      │  │  (IG API,        │  │
│  │   venue select)  │  │   limits, DD)   │  │   Betfair API)   │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
│                                                                   │
│  ┌─────────────────┐  ┌─────────────────┐                       │
│  │  Alert Service   │  │  Audit Logger   │                       │
│  │  (push notif,   │  │  (full trail)   │                       │
│  │   Telegram, etc)│  │                 │                       │
│  └─────────────────┘  └─────────────────┘                       │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
                        │
┌───────────────────────┼──────────────────────────────────────────┐
│                       ▼                                          │
│              DASHBOARD (TypeScript — Web UI)                     │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │  Mode 1: Signal Feed | Mode 2: Wealth Dashboard           │   │
│  │  Mode 3: Trend Status | Position Tracker | P&L             │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

### 4.2 Technology Stack

| Layer             | Technology                        | Rationale                                                                                                 |
| ----------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Data Ingestion    | TypeScript (Node.js)              | Developer's primary language. Strong async/event-loop model for multiple concurrent API connections.      |
| Message Queue     | Redis Streams via BullMQ          | Lightweight, TypeScript-native. Avoids Kafka operational overhead. Consumer groups enable Python workers. |
| Signal Processing | Python 3.11+                      | scipy, scikit-learn, pandas for statistical analysis. Thin worker consuming from Redis.                   |
| Decision Engine   | TypeScript                        | Business logic, risk rules, venue selection. Same codebase as ingestion.                                  |
| Execution         | TypeScript                        | IG Markets REST API, Betfair Exchange API. Order management.                                              |
| Dashboard         | TypeScript (Next.js or SvelteKit) | Lightweight web UI for monitoring. SSR for initial load, WebSocket for live updates.                      |
| Database          | SQLite (via better-sqlite3)       | Trade log, signal history, position tracking. No need for a separate DB server at this scale.             |
| Deployment        | Hetzner CX23 VPS (€3.49/mo)       | Docker Compose: Node.js + Python + Redis on a single box.                                                 |

### 4.3 Monorepo Structure

```
sentinel/
├── packages/
│   ├── ingestion/          # TypeScript — API connectors
│   │   ├── src/
│   │   │   ├── connectors/
│   │   │   │   ├── finnhub.ts
│   │   │   │   ├── quiver.ts
│   │   │   │   ├── gdelt.ts
│   │   │   │   ├── adsb.ts
│   │   │   │   ├── polymarket.ts
│   │   │   │   ├── betfair.ts
│   │   │   │   ├── fred.ts
│   │   │   │   └── marine.ts
│   │   │   ├── normaliser.ts
│   │   │   └── publisher.ts
│   │   └── package.json
│   │
│   ├── signals/            # Python — anomaly detection
│   │   ├── src/
│   │   │   ├── detectors/
│   │   │   │   ├── zscore.py
│   │   │   │   ├── isolation_forest.py
│   │   │   │   └── volume_profile.py
│   │   │   ├── correlator.py
│   │   │   ├── classifier.py
│   │   │   └── worker.py
│   │   └── requirements.txt
│   │
│   ├── engine/             # TypeScript — decision + execution
│   │   ├── src/
│   │   │   ├── decision.ts
│   │   │   ├── risk.ts
│   │   │   ├── execution/
│   │   │   │   ├── ig-markets.ts
│   │   │   │   └── betfair.ts
│   │   │   ├── audit.ts
│   │   │   └── alerts.ts
│   │   └── package.json
│   │
│   ├── dashboard/          # TypeScript — web UI
│   │   ├── src/
│   │   │   ├── pages/
│   │   │   │   ├── signals.tsx
│   │   │   │   ├── wealth.tsx
│   │   │   │   ├── trends.tsx
│   │   │   │   └── positions.tsx
│   │   │   └── components/
│   │   └── package.json
│   │
│   └── shared/             # TypeScript — shared types + utils
│       ├── src/
│       │   ├── types/
│       │   │   ├── events.ts
│       │   │   ├── signals.ts
│       │   │   └── trades.ts
│       │   └── schemas/
│       └── package.json
│
├── docker-compose.yml
├── pnpm-workspace.yaml
├── turbo.json
└── README.md
```

---

## 5. Mode 1: Anomaly Detection & Event Trading

### 5.1 Data Connectors

Each connector follows a common interface:

```typescript
interface Connector {
  name: string;
  source: DataSource;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  onData(handler: (event: NormalisedEvent) => void): void;
  healthCheck(): Promise<boolean>;
}
```

#### 5.1.1 Finnhub Options Connector

**Purpose:** Detect unusual options activity on US equities.
**API:** WebSocket (`wss://ws.finnhub.io`) + REST (`https://finnhub.io/api/v1/`)
**Authentication:** API key (free registration)
**Rate limits:** 60 REST calls/min, 50 WebSocket symbols
**UK access:** Confirmed

**Data collected:**

- Real-time trade prices for up to 50 tickers via WebSocket
- Options chain snapshots via REST (`/stock/option/chain`)
- Historical daily candles for volume baseline (`/stock/candle`)

**Anomaly metrics calculated locally:**

- Current volume vs 20-day average volume (z-score)
- Put/call volume ratio vs 20-day average
- Implied volatility percentile rank (vs 30-day range)
- Volume-weighted average strike distance from spot price

**Polling schedule:** Options chain snapshots every 5 minutes during US market hours (14:30–21:00 UTC). WebSocket streaming continuous.

**Watchlist:** Configurable. Default: 50 highest-volume US equities + sector ETFs (XLE, XLF, XLV, ITA, GDX, USO).

#### 5.1.2 Quiver Quantitative Connector

**Purpose:** Monitor US congressional trading, government contracts, lobbying.
**API:** REST (`https://api.quiverquant.com/`)
**Authentication:** API token
**Rate limits:** Free tier (exact limits undocumented, implement backoff)
**UK access:** Confirmed

**Data collected:**

- Congressional trades (new disclosures)
- Government contract awards (new contracts > $1M)
- Off-exchange short volume by ticker

**Polling schedule:** Every 30 minutes (data updates are infrequent — disclosures lag by days).

**Anomaly metrics:**

- Cluster detection: multiple congress members trading same sector within 7 days
- Volume anomaly: off-exchange short volume spike vs 20-day mean

#### 5.1.3 GDELT Connector

**Purpose:** Real-time global news and geopolitical event monitoring.
**API:** REST (`https://api.gdeltproject.org/api/v2/doc/doc`)
**Authentication:** None (open API)
**Rate limits:** Rate-limited (implement exponential backoff)
**UK access:** Confirmed

**Data collected:**

- Articles matching configurable keyword sets
- Event counts by CAMEO code (military: 190–195, sanctions: 163, trade: 090)
- Tone/sentiment analysis per event cluster

**Polling schedule:** Every 15 minutes.

**Keyword sets (configurable):**

- Military: "military strike", "troops deployed", "naval exercise", "airspace violation"
- Trade/sanctions: "trade sanctions", "tariff", "embargo", "trade war"
- Energy: "oil production cut", "OPEC", "pipeline", "refinery shutdown"
- Financial: "rate decision", "emergency meeting", "bank failure", "default"

**Anomaly metrics:**

- Article volume spike vs 24-hour rolling mean (by keyword set)
- Tone shift: average sentiment dropping below -2 standard deviations
- Geographic clustering: multiple events in same region within 6 hours

#### 5.1.4 ADS-B Exchange Connector

**Purpose:** Military and government aircraft tracking.
**API:** REST via RapidAPI (`/v2/mil/`)
**Authentication:** RapidAPI key (free tier)
**Rate limits:** Free tier (personal/non-commercial use)
**UK access:** Confirmed

**Data collected:**

- All military-tagged aircraft positions (via `dbFlags & 1`)
- Government VIP aircraft positions
- Historical flight patterns for baseline

**Polling schedule:** Every 10 minutes.

**Anomaly metrics:**

- E-6B Mercury ("doomsday plane") airborne when not scheduled
- Unusual tanker/refuelling aircraft activity near conflict zones
- Government jet patterns deviating from normal routes (e.g., DC to undisclosed locations)

#### 5.1.5 Polymarket Data Connector (Read-Only)

**Purpose:** Monitor prediction market prices as a signal source. Not for trading (UK-blocked).
**API:** WebSocket (`wss://`) + REST (`https://clob.polymarket.com`)
**Authentication:** None for public data
**Rate limits:** 60 REST req/min, WebSocket virtually unlimited
**UK access:** API data readable, trading blocked

**Data collected:**

- Real-time prices on geopolitical, policy, and event markets
- Order book depth and spread
- Volume and trade count

**Anomaly metrics:**

- Price movement > 10% in < 1 hour
- Volume spike > 5× average on specific market
- Spread narrowing (increased certainty signal)

#### 5.1.6 Betfair Exchange Connector

**Purpose:** Monitor prediction market prices AND execute trades.
**API:** Exchange Stream API (WebSocket) + REST (`https://api.betfair.com/exchange/`)
**Authentication:** Certificate-based (self-signed RSA 2048-bit) + session token
**Rate limits:** Data weight system, 200 markets per stream subscription
**UK access:** Full access. £499 one-time fee for live data. Delayed data (15 min) is free.
**Phase:** Phase 2 (live data), Phase 1 (delayed data for development)

**Data collected:**

- Political and event market odds
- Market depth and liquidity
- Price movements and volume

**Anomaly metrics:**

- Odds movement > 20% in < 2 hours on political/event markets
- Liquidity surge (matched volume spike)
- Correlation with Polymarket price movements (cross-platform signal validation)

#### 5.1.7 FRED Macro Data Connector

**Purpose:** Monitor macro regime indicators for Modes 2 and 3.
**API:** REST (`https://api.stlouisfed.org/fred/`)
**Authentication:** Free API key
**Rate limits:** 120 req/min
**UK access:** Confirmed

**Data collected:**

- VIX (VIXCLS) — daily
- 2-Year Treasury yield (DGS2) — daily
- 10-Year Treasury yield (DGS10) — daily
- 2s10s spread (calculated: DGS10 - DGS2)
- Fed Funds Rate (FEDFUNDS) — monthly
- US Dollar Index proxy (DTWEXBGS) — daily

**Polling schedule:** Once daily at 22:00 UTC (after US market close).

### 5.2 Normalised Event Schema

All connectors emit events in a common format before publishing to Redis:

```typescript
interface NormalisedEvent {
  id: string; // UUID v4
  timestamp: string; // ISO 8601
  source: DataSource; // enum: FINNHUB | QUIVER | GDELT | ADSB | POLYMARKET | BETFAIR | FRED
  category: EventCategory; // enum: OPTIONS_FLOW | CONGRESS_TRADE | GEOPOLITICAL | FLIGHT | PREDICTION_MARKET | MACRO
  subcategory: string; // e.g., "unusual_volume", "military_activity", "odds_shift"

  // Core data
  ticker?: string; // Financial instrument (if applicable)
  region?: string; // Geographic region (ISO-3)
  sector?: string; // GICS sector (if applicable)

  // Anomaly scoring (set by connector)
  zScore?: number; // Standard deviations from mean
  percentileRank?: number; // 0-100 percentile vs historical
  rawValue: number; // The observed value
  baselineValue: number; // The expected/mean value

  // Metadata
  confidence: number; // 0-1, connector's self-assessed reliability
  rawPayload: Record<string, unknown>; // Original API response (for audit)
}
```

### 5.3 Signal Processing Pipeline (Python)

#### 5.3.1 Per-Source Anomaly Detection

Each data source stream is processed independently. The Python worker subscribes to a Redis consumer group and processes events as they arrive.

**Z-Score Detector:** Maintains a rolling 20-period mean and standard deviation for each metric. Flags events where |z-score| > 2.5 (configurable). Fast, interpretable, low false-positive rate with proper baseline.

**Volume Profile Detector:** Compares current volume to a time-of-day-adjusted historical profile. Options and equity volume follow intraday patterns (high at open, low midday, high at close). Adjusting for this reduces false positives from normal intraday cycles.

**Isolation Forest (Phase 2):** Trained on rolling 500-event windows per source. Retrains every 100 events. Detects multivariate anomalies that z-score misses (e.g., volume is normal but the combination of strike distribution + IV skew + put/call ratio is unusual).

#### 5.3.2 Cross-Source Correlation Engine

This is where the edge lives. The correlator maintains a sliding 4-hour window of all flagged anomalies across all sources and looks for temporal clustering.

**Correlation rules (configurable):**

```python
@dataclass
class CorrelationRule:
    name: str
    required_sources: list[DataSource]    # Must see anomalies from ALL of these
    optional_sources: list[DataSource]    # Boost confidence if also present
    time_window_minutes: int              # All signals must fall within this window
    min_confidence: float                 # Minimum combined confidence score
    event_type: str                       # What this pattern likely means
```

**Default correlation rules:**

| Rule Name         | Required Sources                                             | Optional Sources                 | Window  | Inferred Event                    |
| ----------------- | ------------------------------------------------------------ | -------------------------------- | ------- | --------------------------------- |
| Military Action   | GDELT (military keywords) + ADSB (mil aircraft)              | FINNHUB (defence/energy options) | 240 min | Military strike or deployment     |
| Policy Shift      | QUIVER (congress cluster) + FINNHUB (sector options)         | GDELT (policy keywords)          | 480 min | Regulatory or policy announcement |
| Energy Disruption | FINNHUB (energy sector options) + GDELT (energy keywords)    | ADSB (tanker activity)           | 240 min | Oil supply disruption             |
| Market Event      | POLYMARKET (price spike) + BETFAIR (odds shift)              | FINNHUB (broad options activity) | 120 min | Major news event imminent         |
| Financial Stress  | FRED (VIX spike + yield curve) + FINNHUB (financial options) | GDELT (financial keywords)       | 480 min | Financial crisis signal           |

#### 5.3.3 Event Classifier

Takes correlated signal clusters and assigns a classification:

```python
@dataclass
class SignalEvent:
    id: str
    timestamp: str
    event_type: str              # From correlation rule
    confidence: float            # 0-1, combined score
    sector_impact: list[str]     # Affected GICS sectors
    direction: str               # BULLISH | BEARISH | VOLATILITY
    urgency: str                 # IMMEDIATE | HOURS | DAYS
    contributing_events: list[str]  # IDs of source NormalisedEvents
    suggested_instruments: list[SuggestedTrade]
```

### 5.4 Decision Engine

The decision engine receives SignalEvents and determines whether and how to trade.

#### 5.4.1 Trade Expression Logic

For each SignalEvent, the engine selects the best instrument based on event type:

| Event Type        | Primary Instrument                       | Venue            | Fallback                 |
| ----------------- | ---------------------------------------- | ---------------- | ------------------------ |
| Military Action   | Crude oil (long) or defence ETF          | IG spread bet    | Betfair political market |
| Policy Shift      | Sector ETF (direction depends on policy) | IG spread bet    | —                        |
| Energy Disruption | Crude oil spread bet                     | IG spread bet    | Gold spread bet          |
| Market Event      | Betfair event market                     | Betfair Exchange | IG VIX spread bet        |
| Financial Stress  | VIX (long) or equity index (short)       | IG spread bet    | Gold spread bet          |

#### 5.4.2 Position Sizing

```typescript
interface PositionSizeParams {
  accountValue: number; // Current trading capital
  riskPerTradePct: number; // From Assumptions (default 3%)
  signalConfidence: number; // 0-1, from SignalEvent
  maxOpenPositions: number; // Hard limit (default 5)
  currentOpenPositions: number;
  maxDailyRisk: number; // Max total risk in a day (default 10% of capital)
}

function calculatePositionSize(params: PositionSizeParams): number {
  const baseRisk = params.accountValue * params.riskPerTradePct;
  const confidenceAdjusted = baseRisk * params.signalConfidence;
  const positionLimitAdjusted = Math.min(
    confidenceAdjusted,
    params.maxDailyRisk * params.accountValue - currentDailyRisk,
  );
  return Math.max(0, positionLimitAdjusted);
}
```

#### 5.4.3 Execution Modes

**Manual (Phase 1):** System generates alerts with full context (signal, suggested trade, size, rationale). Operator places trades manually via IG/Betfair. Alert channels: Telegram bot, push notification, dashboard.

**Semi-automated (Phase 2):** System prepares orders and presents them for one-click confirmation. Operator reviews and approves. Orders execute immediately on confirmation.

**Automated (Phase 3):** System executes trades autonomously within configured risk limits. Operator receives post-trade notifications. Kill switch available via dashboard and Telegram.

### 5.5 Execution Integrations

#### 5.5.1 IG Markets (Spread Betting)

**API:** REST (`https://api.ig.com/gateway/deal/`)
**Authentication:** API key + OAuth session token
**Capabilities:** Create/modify/close positions, streaming price data, account info
**Python wrapper:** `trading-ig` (PyPI) — though we'll build a TypeScript client
**Key endpoints:**

- `POST /positions/otc` — Open position
- `PUT /positions/otc/{dealId}` — Modify position (stop/limit)
- `DELETE /positions/otc/{dealId}` — Close position
- `GET /positions` — List open positions
- Lightstreamer streaming for live prices

**Spread bet specifics:**

- Bet size in £/point
- Stop-loss and take-profit as point distances
- Guaranteed stops available (wider spread)

#### 5.5.2 Betfair Exchange (Prediction Markets)

**API:** Exchange API REST + Exchange Stream API (WebSocket)
**Authentication:** Certificate-based (self-signed RSA) + session token
**Capabilities:** Place/cancel bets, stream market data, full order book
**Phase 1:** Delayed data (free). Monitor only.
**Phase 2:** Live data (£499 one-time). Full execution.

**Key endpoints:**

- `listMarketCatalogue` — Discover markets
- `listMarketBook` — Get prices and depth
- `placeOrders` — Place bets
- Exchange Stream API — Low-latency WebSocket for price/order updates

---

## 6. Mode 2: Passive Wealth Dashboard

### 6.1 Purpose

Aggregate all financial holdings into a single view. Provide macro regime awareness that protects long-term wealth.

### 6.2 Data Sources

| Holding Type           | Data Source                | Method          |
| ---------------------- | -------------------------- | --------------- |
| ISA (index funds)      | Manual input or broker API | Periodic update |
| SIPP (pension)         | Manual input               | Monthly update  |
| Spread betting account | IG Markets API             | Real-time       |
| Betfair account        | Betfair API                | Real-time       |
| Crypto holdings        | Arkham/manual              | Periodic        |
| Cash savings           | Manual input               | Monthly         |
| Macro indicators       | FRED API                   | Daily           |

### 6.3 Macro Regime Monitor

The dashboard calculates a "regime score" from 0 (risk-off) to 100 (risk-on) using:

- VIX level (below 15 = risk-on, above 25 = risk-off)
- 2s10s yield curve spread (inverted = risk-off)
- VIX term structure (backwardation = risk-off)
- 200-day moving average of S&P 500 (price below = risk-off)

When the regime score drops below 30, the dashboard generates an alert suggesting reducing equity exposure in the ISA and/or hedging via VIX spread bet.

### 6.4 Dashboard Views

**Net Worth:** Total across all accounts. Month-over-month change. Year-over-year. Breakdown by account type. Pie chart of allocation.

**Regime Status:** Current score, historical chart, contributing factors, active alerts.

**Tax Summary:** Year-to-date spread betting P&L (tax-free), CGT-liable gains, ISA contributions vs allowance remaining, SIPP contributions vs allowance remaining.

---

## 7. Mode 3: Systematic Trend Following

### 7.1 Purpose

A rules-based strategy that generates steady tax-free returns via spread betting on major indices and commodities. Lower variance than Mode 1. Runs on the same data pipeline.

### 7.2 Instruments

| Instrument        | IG Market            | Direction  | Rationale                 |
| ----------------- | -------------------- | ---------- | ------------------------- |
| FTSE 100          | IX.D.FTSE.DAILY.IP   | Long/Short | UK index, GBP-denominated |
| S&P 500           | IX.D.SPTRD.DAILY.IP  | Long/Short | Global equity benchmark   |
| Crude Oil (Brent) | EN.D.LCO.Month1.IP   | Long/Short | Energy, geopolitical      |
| Gold              | CS.D.USCGC.TODAY.IP  | Long/Short | Safe haven, inflation     |
| EUR/USD           | CS.D.EURUSD.TODAY.IP | Long/Short | FX, macro sentiment       |

### 7.3 Strategy Rules

**Entry signals** are generated by a dual moving average crossover combined with a volatility filter:

- Go long when the 20-day EMA crosses above the 50-day EMA AND the 14-day ATR is below 2× its 50-day average (trend confirmation without excessive volatility).
- Go short when the 20-day EMA crosses below the 50-day EMA AND the same volatility filter is met.
- No entry when ATR exceeds 2× its average (choppy market, sit out).

**Position sizing:** Same risk-percentage-of-capital approach as Mode 1 (default 3% risk per trade). Stop-loss at 2× ATR from entry.

**Exit rules:**

- Stop-loss hit (2× ATR)
- Take-profit at 3× ATR (1.5:1 reward-to-risk)
- Trailing stop: once profit exceeds 2× ATR, trail stop at 1× ATR below price
- Regime override: close all long positions if Mode 2 regime score drops below 20

**Expected performance:** Trend-following strategies have returned 5–15% annualised over multi-decade periods (AQR, Man AHL data). With 3% risk per trade and this ruleset, moderate expectation is 8–12% annualised on allocated capital, tax-free via spread betting.

### 7.4 Rebalancing

Strategy parameters are checked daily at 22:00 UTC (after US close). New positions or exits execute at next market open. No intraday management required for Mode 3 — this is intentionally low-maintenance.

---

## 8. Data Storage

### 8.1 SQLite Schema (Core Tables)

```sql
-- Raw events from connectors (append-only log)
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  source TEXT NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT,
  ticker TEXT,
  region TEXT,
  sector TEXT,
  z_score REAL,
  percentile_rank REAL,
  raw_value REAL,
  baseline_value REAL,
  confidence REAL,
  raw_payload TEXT,  -- JSON
  created_at TEXT DEFAULT (datetime('now'))
);

-- Detected signals (from Python processing)
CREATE TABLE signals (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  event_type TEXT NOT NULL,
  confidence REAL NOT NULL,
  direction TEXT,
  urgency TEXT,
  sector_impact TEXT,  -- JSON array
  contributing_event_ids TEXT,  -- JSON array
  suggested_trades TEXT,  -- JSON array
  status TEXT DEFAULT 'pending',  -- pending | acted | expired | dismissed
  created_at TEXT DEFAULT (datetime('now'))
);

-- Trade log (every trade, whether manual or automated)
CREATE TABLE trades (
  id TEXT PRIMARY KEY,
  signal_id TEXT REFERENCES signals(id),
  timestamp TEXT NOT NULL,
  venue TEXT NOT NULL,  -- IG | BETFAIR | SMARKETS
  instrument TEXT NOT NULL,
  direction TEXT NOT NULL,  -- LONG | SHORT
  size REAL NOT NULL,
  entry_price REAL,
  exit_price REAL,
  stop_loss REAL,
  take_profit REAL,
  pnl REAL,
  status TEXT DEFAULT 'open',  -- open | closed | cancelled
  mode TEXT NOT NULL,  -- MODE_1 | MODE_3
  execution_type TEXT,  -- MANUAL | SEMI_AUTO | AUTO
  audit_notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  closed_at TEXT
);

-- Wealth snapshot (daily)
CREATE TABLE wealth_snapshots (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  isa_value REAL,
  sipp_value REAL,
  spread_betting_value REAL,
  betfair_value REAL,
  crypto_value REAL,
  cash_value REAL,
  total_value REAL,
  regime_score REAL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Regime indicator history
CREATE TABLE regime_indicators (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  vix REAL,
  yield_2y REAL,
  yield_10y REAL,
  spread_2s10s REAL,
  sp500_vs_200dma REAL,
  regime_score REAL,
  created_at TEXT DEFAULT (datetime('now'))
);
```

---

## 9. Alerting

### 9.1 Alert Channels

**Telegram Bot (Primary):** Free, real-time, works on mobile. Bot sends structured messages with signal details, suggested trades, and one-tap confirmation links (Phase 2).

**Dashboard notifications:** In-app notification feed with sound alerts for high-confidence signals.

**Email (Fallback):** Daily digest of signals and P&L summary.

### 9.2 Alert Priority Levels

| Level    | Criteria                              | Notification            |
| -------- | ------------------------------------- | ----------------------- |
| Critical | Confidence > 0.8, urgency = IMMEDIATE | Telegram + push + sound |
| High     | Confidence > 0.6, urgency = HOURS     | Telegram + dashboard    |
| Medium   | Confidence > 0.4                      | Dashboard only          |
| Low      | Confidence < 0.4                      | Logged, no notification |

---

## 10. Risk Controls

### 10.1 Hard Limits (Non-Overridable)

- Maximum 5 concurrent open positions across all modes
- Maximum 10% of capital at risk in any single day
- Maximum 3% of capital at risk per trade
- No position held longer than 30 days without manual review
- Kill switch: single command to close all positions and halt trading

### 10.2 Circuit Breakers

- If daily P&L drops below -5% of capital, halt all automated trading for 24 hours
- If 5 consecutive losing trades occur, reduce position size to 50% for next 5 trades
- If a connector fails health check 3 times consecutively, mark its signals as degraded (reduced confidence multiplier)

### 10.3 Audit Trail

Every trade must be traceable back to: the specific signal(s) that triggered it, the raw events that composed the signal, the data source API responses that generated those events, and the position sizing calculation. This is stored in SQLite and exportable as CSV for regulatory review if ever required.

---

## 11. Development Roadmap

### Phase 1: Foundation (Weeks 1–6)

**Milestone 1.1 — Infrastructure (Week 1)** ✅

- ~~Set up monorepo (pnpm workspaces + Turborepo)~~ → VitePlus monorepo with `vp` CLI
- ~~Docker Compose: Node.js + Python + Redis~~ → Redis 7 Alpine in Docker for local dev
- ~~Deploy to Hetzner CX23~~ → Deferred to post-Phase 1
- ~~CI/CD pipeline (GitHub Actions → Docker build → SSH deploy)~~ → Deferred to post-Phase 1
- ✅ Shared types package (`@sentinel/shared`): NormalisedEvent Zod schema, DataSource/EventCategory enums
- ✅ Redis Streams pub/sub: `publishEvent()`, `consumeEvents()` with consumer groups
- ✅ SQLite database with Drizzle ORM: events, signals, trades, wealthSnapshots, regimeIndicators tables
- ✅ Python signal worker scaffold: `pyproject.toml`, venv, redis-py consumer, cross-language integration test

**Milestone 1.2 — First Connectors (Weeks 2–3)** ✅

- ✅ Finnhub WebSocket connector (trade data, exponential backoff reconnection)
- ✅ Finnhub REST connector (options chain, volume baseline, z-score calculation)
- ✅ GDELT connector (4 keyword sets, rolling baseline, z-score)
- ✅ FRED connector (5 macro series: VIX, 2Y, 10Y, Fed Funds, Dollar Index + 2s10s spread)
- ✅ Normalised event schema + Redis publishing
- ✅ Health check monitoring per connector
- ✅ All tested with msw HTTP mocking and real Redis integration tests

**Milestone 1.3 — Python Signal Worker (Week 4)** ✅

- ✅ Redis consumer group setup (`signal-workers` on `events:raw`)
- ✅ Z-score anomaly detector (rolling stats per key, configurable threshold, outlier exclusion)
- ✅ Volume profile detector (24 hourly buckets per ticker, configurable multiplier)
- ✅ Signal event publishing back to Redis (`signals:detected` stream)
- ✅ Worker loop: consumes events, runs both detectors, publishes SignalEvents
- ✅ 25 pytest tests passing

**Milestone 1.4 — Alert System (Week 5)** ✅

- ✅ SignalEvent Zod schema in `@sentinel/shared` + `consumeSignals()` consumer
- ✅ Alert priority router: Critical/High/Medium/Low classification with channel routing
- ✅ Telegram notifier: formatted messages via Bot API with graceful error handling
- ✅ AlertWorker: end-to-end consume → classify → route pipeline
- ⬜ Signal feed in terminal/simple web page (deferred to dashboard milestone)
- ✅ 14 engine tests passing (msw-mocked Telegram API + real Redis)

**Milestone 1.5 — Manual Trading Support (Week 6)** ✅

- ~~SQLite database setup~~ → Already done in Milestone 1.1 (trades table exists)
- ✅ Trade logging (manual entry): `createTradeService(db)` with `openTrade()`, `closeTrade()`, `listOpenTrades()`
- ✅ Basic P&L tracking: `closeTrade()` calculates P&L for long/short, `getPnLSummary()` aggregates wins/losses
- ✅ Signal → suggested trade pipeline: `mapSignalToTrades()` maps event types to venue/instrument/direction per PRD §5.4.1
- ✅ DB layer extended with `updateTrade()` and `listTradesByStatus()` queries
- ✅ 14 new tests (7 trade-service + 7 trade-mapper), 70 total tests passing

**Phase 1 Exit Criteria:** System is running 24/7, ingesting 3+ data sources, detecting anomalies, and sending Telegram alerts. Operator is manually placing trades based on alerts.

### Phase 2: Expansion (Weeks 7–14)

**Milestone 2.1 — Additional Connectors (Weeks 7–8)** ✅

- ✅ Quiver Quantitative connector: congressional trades + government contracts (>$1M filter), auth via Bearer token
- ✅ ADS-B Exchange connector: military aircraft via RapidAPI, high-interest aircraft flagging (E-6B, E-4B, VC-25 get 0.9 confidence)
- ✅ Polymarket data connector (read-only): market prices with rolling price baseline tracking, inactive market filtering
- ⬜ MarineTraffic connector — deferred (free tier insufficient)
- ✅ 15 new tests (5 quiver + 5 adsb + 5 polymarket), 85 total tests passing

**Milestone 2.2 — Cross-Source Correlation (Weeks 9–10)** ✅

- ✅ Correlation engine: `CorrelationEngine` with sliding time window, configurable `CorrelationRule` dataclass
- ✅ Default correlation rules: 5 rules from PRD (military_action, policy_shift, energy_disruption, market_event, financial_stress)
- ✅ Event classifier: compound SignalEvents with inferred event_type, direction, urgency, sector_impact
- ✅ Compound signal generation: optional sources boost confidence (+0.1 per source), min_confidence threshold
- ✅ Worker integration: `SignalWorker.process_batch()` feeds per-source detector signals through correlator
- ✅ SignalEvent model extended with `source` and `subcategory` fields for cross-source tracking
- ✅ 8 new Python tests (7 correlator + 1 integration), 33 total Python tests passing

**Milestone 2.3 — IG Markets Integration (Weeks 11–12)** ✅

- ✅ IG Markets API client: `IGClient` with login (CST + security token auth), session management, error handling
- ✅ Account data retrieval: `getAccounts()` (balances, available funds), `getPositions()` (open positions)
- ✅ Semi-automated order preparation: `prepareOrder()` maps SuggestedTrade → IG-ready order with position sizing (risk % × confidence), instrument epic lookup, stop/limit distances
- ✅ Trade execution: `createPosition()` and `closePosition()` with correct IG API payloads
- ✅ One-click trade confirmation via Telegram: `sendTradeConfirmation()` with formatted order details and inline keyboard (confirm/reject buttons with signal ID callback data)
- ✅ 13 new tests (7 ig-client + 4 order-preparer + 2 telegram-trade), 98 total TS tests passing

**Milestone 2.4 — Unusual Whales (Optional) (Week 12)**

- Evaluate whether Unusual Whales subscription is justified
- If account value > £2,000: add Unusual Whales connector
- Replace/supplement Finnhub options data

**Milestone 2.5 — Dashboard v1 (Weeks 13–14)** ✅

- Signal feed page ✅
- Open positions view ✅
- P&L tracking ✅
- Wealth dashboard (manual input for ISA/SIPP/cash) ✅

> **Completed:** `apps/dashboard` — Hono API server (6 routes: signals, trades, trades/summary, wealth GET/POST, regime), React SPA with react-router-dom (3 pages: SignalsPage, PositionsPage, WealthPage), useFetch hook with polling, summary cards with realized P&L/win rate, allocation bar, macro regime indicators, manual wealth snapshot form. 7 API integration tests passing.

**Phase 2 Exit Criteria:** Cross-source correlation operational. IG Markets semi-automated. 4+ months of signal history. Measurable win rate data.

### Phase 3: Automation & Scale (Weeks 15–24)

**Milestone 3.1 — Mode 3: Trend Following (Weeks 15–17)** ✅

- Trend-following strategy implementation ✅
- Backtesting framework
- Paper trading (1 month)
- Live deployment with minimum position sizes

> **Completed (strategy engine):** `packages/engine/src/strategy/trend.ts` — `computeIndicators()` (EMA-20, EMA-50, ATR-14, ATR-avg-50), `evaluateTrend()` (dual MA crossover with ATR volatility filter, 3% risk sizing, 2×ATR stop, 3×ATR TP), `evaluateExits()` (trailing stop at 1×ATR when profit > 2×ATR, regime override closes longs when score < 20). 10 tests. Backtesting, paper trading, and live deployment are operational tasks for later.

**Milestone 3.2 — Betfair Integration (Weeks 18–19)** ✅

- Betfair Exchange API client ✅
- Certificate-based auth ✅
- Live market data (£499 one-time cost)
- Prediction market execution ✅

> **Completed:** `packages/engine/src/execution/betfair-client.ts` — `BetfairClient` class with cert-based login (identitysso-cert endpoint), `listMarketCatalogue()`, `listMarketBook()`, `placeOrders()`, `getAccountFunds()`. Session token reuse across calls. Full type exports. 7 tests. Live data activation (£499) is an operational step.

**Milestone 3.3 — Full Automation (Weeks 20–22)** ✅

- Automated execution for Mode 3 (trend following) ✅
- Semi-automated for Mode 1 (event trading — higher stakes, keep human in loop) ✅
- Circuit breakers and kill switch ✅
- Monitoring and alerting for system health

> **Completed:** `packages/engine/src/risk/circuit-breaker.ts` — `createRiskGate()` with max 5 positions, 3% per-trade risk, 10% daily risk cap, -5% daily P&L halt, 50% size reduction after 5 consecutive losses, kill switch + resume. 6 tests. `packages/engine/src/automation/executor.ts` — `createExecutor()` with Mode 3 auto-execution, Mode 1 awaiting_approval (human in loop), risk gate integration, size multiplier pass-through. 4 tests. System health monitoring is an operational/infra task.

**Milestone 3.4 — Isolation Forest + ML (Weeks 23–24)** ✅

- Isolation Forest anomaly detection ✅
- Model training pipeline ✅
- A/B comparison: z-score vs IF detection rates ✅
- Classifier improvement with labelled historical data

> **Completed:** `packages/signals/src/detectors/isolation_forest.py` — `IsolationForestDetector` with same `detect()` interface as existing detectors, scikit-learn IsolationForest backend, 5-feature extraction (raw_value, baseline, z_score, confidence, hour), auto-trains after min_samples via detect() or explicit `train()`, blended anomaly score (IF decision function + normalised distance), `compare_detectors()` A/B helper. Wired into `worker_loop.py` as third detector. 8 tests. Labelled data improvement is an ongoing operational task.

**Phase 3 Exit Criteria:** Trend following running autonomously. Event trading semi-automated. 6+ months of performance data. Clear P&L attribution by mode.

---

## 12. Infrastructure & Deployment

### 12.1 Docker Compose

```yaml
version: "3.8"

services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes

  ingestion:
    build:
      context: .
      dockerfile: packages/ingestion/Dockerfile
    depends_on:
      - redis
    env_file: .env
    restart: unless-stopped

  signals:
    build:
      context: .
      dockerfile: packages/signals/Dockerfile
    depends_on:
      - redis
    env_file: .env
    restart: unless-stopped

  engine:
    build:
      context: .
      dockerfile: packages/engine/Dockerfile
    depends_on:
      - redis
    env_file: .env
    restart: unless-stopped

  dashboard:
    build:
      context: .
      dockerfile: packages/dashboard/Dockerfile
    depends_on:
      - redis
      - engine
    ports:
      - "3000:3000"
    env_file: .env
    restart: unless-stopped

volumes:
  redis-data:
```

### 12.2 Environment Variables

```env
# API Keys
FINNHUB_API_KEY=
QUIVER_API_TOKEN=
FRED_API_KEY=
ADSB_RAPIDAPI_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# IG Markets (Phase 2)
IG_API_KEY=
IG_USERNAME=
IG_PASSWORD=
IG_ACCOUNT_ID=

# Betfair (Phase 3)
BETFAIR_APP_KEY=
BETFAIR_USERNAME=
BETFAIR_PASSWORD=
BETFAIR_CERT_PATH=
BETFAIR_KEY_PATH=

# System
REDIS_URL=redis://redis:6379
DATABASE_PATH=/data/sentinel.db
NODE_ENV=production
LOG_LEVEL=info

# Risk Parameters
MAX_OPEN_POSITIONS=5
MAX_DAILY_RISK_PCT=0.10
RISK_PER_TRADE_PCT=0.03
CIRCUIT_BREAKER_DAILY_LOSS_PCT=0.05
```

### 12.3 Monitoring

- **Uptime:** UptimeRobot (free tier) pinging health endpoint
- **Logs:** Docker logs → simple log rotation on disk
- **Metrics:** Custom `/health` endpoint reporting: connector status, last event timestamps, queue depth, open positions, daily P&L
- **Alerts:** Telegram message if any connector fails health check or if the system goes offline

---

## 13. Cost Summary

### Phase 1 (Months 1–2)

| Item              | Monthly Cost       |
| ----------------- | ------------------ |
| Hetzner CX23 VPS  | ~£3                |
| Domain (optional) | ~£1                |
| API keys          | £0 (all free tier) |
| **Total OpEx**    | **~£4/month**      |

### Phase 2 (Months 3–6)

| Item                          | Monthly Cost    |
| ----------------------------- | --------------- |
| Hetzner CX23 VPS              | ~£3             |
| Unusual Whales (if triggered) | £40             |
| **Total OpEx**                | **£4–44/month** |

Plus one-time: Betfair live API activation: £499

### Phase 3 (Months 6+)

| Item                                 | Monthly Cost   |
| ------------------------------------ | -------------- |
| Hetzner CPX22 (upgrade for headroom) | ~£7            |
| Unusual Whales                       | £40            |
| **Total OpEx**                       | **~£47/month** |

---

## 14. Success Metrics

| Metric                        | Phase 1 Target | Phase 2 Target | Phase 3 Target        |
| ----------------------------- | -------------- | -------------- | --------------------- |
| System uptime                 | 95%            | 99%            | 99.5%                 |
| Connectors operational        | 3              | 6              | 8+                    |
| Signals generated/month       | 10+            | 30+            | 50+                   |
| High-confidence signals/month | 2+             | 5+             | 10+                   |
| Mode 1 win rate               | Track only     | 52%+           | 55%+                  |
| Mode 3 win rate               | —              | —              | 50%+ (with 1.5:1 R:R) |
| Monthly net P&L (Mode 1)      | Track only     | > £0           | > OpEx                |
| Monthly net P&L (Mode 3)      | —              | —              | > £0                  |
| Max drawdown                  | < 15%          | < 15%          | < 12%                 |

---

## 15. Open Questions & Risks

**Finnhub free tier sufficiency.** The 50-symbol WebSocket limit may be constraining for broad options monitoring. Mitigation: rotate watchlist based on sector relevance, upgrade to paid tier ($50/mo) if signal quality improves with broader coverage.

**Betfair £499 activation cost.** This is a meaningful upfront cost for Phase 2/3. Mitigation: defer until Mode 1 has proven 3+ months of positive signal quality using delayed data. The delayed data is sufficient for correlation detection.

**IG Markets API reliability.** The IG API has historically had outages during high-volatility events (exactly when you need it most). Mitigation: implement retry logic with exponential backoff. Consider Spreadex as a backup venue (manual execution).

**False positive rate.** Cross-source correlation should reduce false positives, but the system has no labelled training data initially. Mitigation: first 3 months are observation-only. Log all signals, track outcomes, build a labelled dataset. Use this to tune thresholds before risking capital on automated execution.

**Regulatory evolution.** UK regulation of prediction markets and crypto is evolving rapidly. Mitigation: keep all trading within FCA-regulated (IG) or Gambling Commission-licensed (Betfair, Smarkets) venues. Avoid unregulated platforms.

---

## Appendix A: API Quick Reference

| API        | Base URL                               | Auth            | Rate Limit    | WebSocket             |
| ---------- | -------------------------------------- | --------------- | ------------- | --------------------- |
| Finnhub    | `https://finnhub.io/api/v1/`           | API key         | 60/min        | `wss://ws.finnhub.io` |
| Quiver     | `https://api.quiverquant.com/`         | Token           | Backoff       | No                    |
| GDELT      | `https://api.gdeltproject.org/api/v2/` | None            | Backoff       | No                    |
| ADS-B      | RapidAPI                               | API key         | Free tier     | No                    |
| Polymarket | `https://clob.polymarket.com`          | None (data)     | 60/min        | `wss://`              |
| Betfair    | `https://api.betfair.com/exchange/`    | Cert + token    | Weight system | Yes                   |
| FRED       | `https://api.stlouisfed.org/fred/`     | API key         | 120/min       | No                    |
| IG Markets | `https://api.ig.com/gateway/deal/`     | API key + OAuth | Per-endpoint  | Lightstreamer         |

## Appendix B: Glossary

**ATR:** Average True Range. A volatility measure.
**EMA:** Exponential Moving Average. A weighted moving average giving more weight to recent prices.
**GICS:** Global Industry Classification Standard. Sector taxonomy.
**IV:** Implied Volatility. Market's forecast of future price movement.
**R:R:** Reward-to-Risk ratio. Expected profit divided by expected loss.
**CAMEO:** Conflict and Mediation Event Observations. Event coding system used by GDELT.
**CLOB:** Central Limit Order Book. Polymarket's order matching system.
**2s10s:** Spread between 2-year and 10-year Treasury yields. A recession indicator when inverted.
