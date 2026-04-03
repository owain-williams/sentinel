# Plan: Milestone 1.3 — Python Signal Worker

> Source PRD: PRD-sentinel.md, Phase 1 Milestone 1.3 + §5.3

## Architectural decisions

- **Input stream**: `events:raw` (NormalisedEvent JSON)
- **Output stream**: `signals:detected` (SignalEvent JSON)
- **Consumer group**: `signal-workers` on `events:raw`
- **SignalEvent model**: Mirrors PRD §5.3.3 — id, timestamp, event_type, confidence, direction, urgency, sector_impact, contributing_events, suggested_instruments
- **Detector pattern**: Each detector receives a NormalisedEvent, returns Optional[SignalEvent]
- **Rolling state**: In-memory per-key rolling windows (not persisted — rebuilds on restart)
- **Thresholds**: Configurable via constructor, defaults from PRD (z-score > 2.5)

---

## Phase 1: Z-Score Detector

**User stories**: As the operator, I need automatic detection of statistical anomalies across all data sources so I'm alerted to unusual activity.

### What to build

A z-score detector that maintains rolling 20-period mean and standard deviation per unique key (source + subcategory + optional ticker). When a NormalisedEvent arrives with |z-score| > 2.5 (configurable), it emits a SignalEvent. Tested with synthetic events: a sequence of normal values followed by a spike that should trigger, and edge cases (insufficient data, zero variance).

### Acceptance criteria

- [ ] `SignalEvent` dataclass defined matching PRD schema
- [ ] Z-score detector maintains rolling stats per key
- [ ] Flags events where |z-score| > threshold (default 2.5)
- [ ] Does not flag when fewer than 5 observations exist (insufficient baseline)
- [ ] Returns `SignalEvent` with confidence derived from z-score magnitude
- [ ] pytest: normal sequence → no signal; spike sequence → signal emitted
- [ ] pytest: edge cases — zero variance, single observation, exactly at threshold

---

## Phase 2: Volume Profile Detector

**User stories**: As the operator, I need time-of-day aware anomaly detection so normal intraday volume patterns don't cause false positives.

### What to build

A volume profile detector that builds hourly volume profiles per ticker. When a NormalisedEvent with a ticker arrives, it compares the raw volume to the expected volume for that hour-of-day. Flags when volume exceeds the profile-adjusted baseline by a configurable multiplier (default 2.0x). Tested with synthetic intraday patterns.

### Acceptance criteria

- [ ] Builds hourly profiles (24 buckets) per ticker from incoming events
- [ ] Compares current volume to the hour-appropriate baseline
- [ ] Flags when volume > multiplier × hourly baseline (default 2.0x)
- [ ] Does not flag when fewer than 3 observations exist for that hour
- [ ] Returns `SignalEvent` with confidence based on exceedance ratio
- [ ] pytest: normal intraday pattern → no signal; spike at specific hour → signal
- [ ] pytest: different tickers maintain separate profiles

---

## Phase 3: Worker Loop Integration

**User stories**: As the operator, I need detectors running continuously so signals are generated automatically as data flows in.

### What to build

Wire both detectors into the worker's consume loop. The worker reads from `events:raw`, passes each event through all detectors, and publishes any resulting `SignalEvent`s to `signals:detected`. End-to-end cross-language test: TS connector publishes raw events to Redis → Python worker consumes and detects → signals appear on `signals:detected` stream.

### Acceptance criteria

- [ ] Worker loop consumes from `events:raw`, runs all registered detectors
- [ ] SignalEvents published to `signals:detected` Redis stream as JSON
- [ ] Multiple detectors can fire on the same event (both z-score and volume profile)
- [ ] End-to-end test: TS publishes synthetic anomalous events → Python worker detects → signals readable from `signals:detected`
- [ ] Worker handles malformed events gracefully (logs, skips, doesn't crash)
