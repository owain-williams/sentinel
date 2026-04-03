# Plan: Milestone 1.1 — Infrastructure Foundation

> Source PRD: PRD-sentinel.md, Phase 1 Milestone 1.1

## Architectural decisions

Durable decisions that apply across all phases:

- **Toolchain**: VitePlus (`vp` CLI) for all TS packages — build, dev, test, lint
- **Monorepo packages**: `shared`, `ingestion`, `engine`, `dashboard` (TS/React), `signals` (Python, standalone)
- **Database**: SQLite via Drizzle ORM + better-sqlite3
- **Message bus**: Plain Redis Streams with consumer groups (not BullMQ)
- **Schema**: 5 core tables — `events`, `signals`, `trades`, `wealth_snapshots`, `regime_indicators`
- **Key models**: `NormalisedEvent`, `SignalEvent`, `DataSource` enum, `EventCategory` enum
- **Python ↔ TS contract**: JSON-serialised `NormalisedEvent` over Redis Streams
- **Testing**: Vitest (via VitePlus) + msw for TS; pytest for Python
- **Local dev**: Redis in Docker, everything else native

---

## Phase 1: Monorepo Skeleton & Shared Types

**User stories**: As the operator, I need a consistent project structure so that all packages share types and build correctly.

### What to build

Scaffold the monorepo with `vp create`. Establish `shared`, `ingestion`, `engine`, and `dashboard` as TS packages. Create the `signals` Python package with `pyproject.toml`. Define the core domain types in `shared` — `NormalisedEvent`, `DataSource` enum, `EventCategory` enum, and Zod schemas for runtime validation. Prove cross-package imports work with a test.

### Acceptance criteria

- [ ] `vp create` scaffolds the monorepo; `vp check` passes with no errors
- [ ] `shared` package exports `NormalisedEvent`, `DataSource`, `EventCategory` types and Zod schemas
- [ ] `ingestion` and `engine` packages can import from `shared` and compile
- [ ] `signals` Python package exists with `pyproject.toml` and a placeholder module
- [ ] `.env.example` documents all required API keys from the PRD
- [ ] A test in `ingestion` imports `NormalisedEvent` from `shared` and validates a sample event against the Zod schema
- [ ] `docker-compose.yml` with Redis 7 Alpine service for local dev

---

## Phase 2: Redis Streams Pipeline

**User stories**: As the operator, I need connectors to publish normalised events to a message bus so that downstream consumers can process them independently.

### What to build

A Redis Streams publisher in `shared` (or `ingestion`) that serialises a `NormalisedEvent` and writes it to a named stream. A Redis Streams subscriber utility that reads from the stream using consumer groups. Both use `ioredis`. Verified end-to-end: publish an event, consume it, assert it deserialises correctly.

### Acceptance criteria

- [ ] Redis connection module with configurable URL (from `REDIS_URL` env var)
- [ ] Publisher function: accepts a `NormalisedEvent`, writes to Redis Stream `events:raw`
- [ ] Consumer function: reads from `events:raw` via consumer group, returns deserialised `NormalisedEvent`
- [ ] Integration test: starts Redis (Docker), publishes 3 events, consumes all 3, asserts field-level equality
- [ ] Consumer acknowledges messages after processing (XACK)

---

## Phase 3: Database Foundation (Drizzle + SQLite)

**User stories**: As the operator, I need a persistent store for events, signals, trades, and wealth data so that I have a complete audit trail.

### What to build

Drizzle ORM schema matching the PRD's 5 SQLite tables. Migration generation and execution. A thin repository layer for inserting and querying each table. Verified by tests that exercise CRUD operations.

### Acceptance criteria

- [ ] Drizzle schema defines all 5 tables: `events`, `signals`, `trades`, `wealth_snapshots`, `regime_indicators`
- [ ] Schema matches PRD column definitions (types, defaults, foreign keys)
- [ ] `drizzle-kit` generates and applies migrations to a fresh SQLite file
- [ ] Tests insert a row into each table and query it back, asserting all fields
- [ ] Database path configurable via `DATABASE_PATH` env var

---

## Phase 4: Python Worker Skeleton

**User stories**: As the operator, I need the Python signal processing worker to consume events from Redis so that anomaly detection can run independently of the TS ingestion layer.

### What to build

A Python worker in `packages/signals` that connects to Redis Streams using `redis-py`, joins a consumer group, reads `NormalisedEvent` JSON payloads, and deserialises them into a Python dataclass. Verified by a cross-language integration test: TS publishes, Python consumes.

### Acceptance criteria

- [ ] `packages/signals` has `pyproject.toml` with `redis`, `pytest` dependencies
- [ ] Python `NormalisedEvent` dataclass mirrors the TS type
- [ ] Worker connects to Redis, creates/joins consumer group on `events:raw`
- [ ] Worker reads and deserialises events, logs them
- [ ] pytest: publishes a `NormalisedEvent` via `redis-py`, worker consumes and validates it
- [ ] Cross-language integration test: TS script publishes event → Python worker reads and asserts correctness
