# Plan: Milestone 1.4 — Alert System

> Source PRD: PRD-sentinel.md, Phase 1 Milestone 1.4 + §9

## Architectural decisions

- **Alert service location**: `packages/engine`, TypeScript — consumes from `signals:detected` Redis stream
- **SignalEvent shared type**: Zod schema in `@sentinel/shared`, mirrors Python `SignalEvent` dataclass
- **Telegram integration**: Send-only via Bot API HTTP calls (no webhook server). Uses `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` from env
- **Alert priority levels** (PRD §9.2):
  - Critical: confidence > 0.8 AND urgency = IMMEDIATE → Telegram + dashboard
  - High: confidence > 0.6 AND urgency = HOURS → Telegram + dashboard
  - Medium: confidence > 0.4 → dashboard only (logged)
  - Low: confidence ≤ 0.4 → logged only
- **Consumer group**: `alert-workers` on `signals:detected`
- **No persistence layer for alerts** — signals table already exists in SQLite schema; alerts are ephemeral notifications

---

## Phase 1: Signal Consumer & TypeScript SignalEvent Type

**User stories**: As the operator, I need the engine to consume detected signals from Redis so they can be routed to alert channels.

### What to build

Add a `SignalEventSchema` (Zod) to `@sentinel/shared` that mirrors the Python `SignalEvent` dataclass. Then build a consumer in the engine package that reads from the `signals:detected` Redis stream using consumer groups, deserialises each message into a validated `SignalEvent`, and returns them for downstream processing. Tested with synthetic signals published to Redis.

### Acceptance criteria

- [ ] `SignalEventSchema` Zod schema defined in shared types with all fields from the Python model
- [ ] `SignalEvent` TypeScript type exported from `@sentinel/shared`
- [ ] `consumeSignals()` function reads from `signals:detected` stream via consumer group
- [ ] Deserialises and validates JSON into `SignalEvent`
- [ ] pytest-style integration test: publish a synthetic signal dict to Redis → TS consumer reads and validates it

---

## Phase 2: Alert Priority Router

**User stories**: As the operator, I need signals classified by priority so I only get notified about what matters.

### What to build

A priority classifier that takes a `SignalEvent` and returns a priority level (Critical, High, Medium, Low) along with the set of channels to notify. Pure function with no side effects — takes a signal, returns a routing decision. Tested with signals at each confidence/urgency boundary.

### Acceptance criteria

- [ ] `AlertPriority` enum: CRITICAL, HIGH, MEDIUM, LOW
- [ ] `classifySignal(signal)` returns priority and list of target channels
- [ ] Critical: confidence > 0.8 AND urgency IMMEDIATE → channels: [telegram, dashboard]
- [ ] High: confidence > 0.6 AND urgency HOURS → channels: [telegram, dashboard]
- [ ] Medium: confidence > 0.4 → channels: [dashboard]
- [ ] Low: confidence ≤ 0.4 → channels: [] (logged only)
- [ ] Unit tests for each priority boundary including edge cases

---

## Phase 3: Telegram Notification

**User stories**: As the operator, I need Telegram alerts for Critical and High priority signals so I can act immediately from my phone.

### What to build

A Telegram notifier that formats a `SignalEvent` into a readable message and sends it via the Bot API `sendMessage` endpoint. Messages include: event type, confidence, direction, urgency, and contributing event count. Uses `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` from environment. Tested with msw mocking the Telegram API.

### Acceptance criteria

- [ ] `sendTelegramAlert(signal, priority)` sends a formatted message via Bot API
- [ ] Message includes event type, confidence percentage, direction, urgency
- [ ] Critical signals are prefixed with a warning indicator
- [ ] Handles API errors gracefully (logs, does not crash)
- [ ] msw test: verify correct HTTP request to Telegram API with expected message structure

---

## Phase 4: End-to-End Integration

**User stories**: As the operator, I need the full pipeline working: data → detection → alert on my phone.

### What to build

Wire the consumer loop in the engine: continuously read from `signals:detected`, classify each signal's priority, route to the appropriate channels (Telegram for Critical/High, log for all). The loop should handle malformed messages gracefully. End-to-end test: publish a synthetic high-confidence signal to Redis → engine consumes → Telegram API called with correct message.

### Acceptance criteria

- [ ] `AlertWorker` class consumes from `signals:detected` in a loop
- [ ] Each signal is classified and routed to the correct channels
- [ ] Multiple signals in a batch are each independently classified and routed
- [ ] Malformed signals are logged and skipped
- [ ] End-to-end test: publish synthetic signal to Redis → AlertWorker processes → Telegram API receives message (msw verified)
