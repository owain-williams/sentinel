import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { createDatabase, type SentinelDatabase } from "@sentinel/shared";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApi } from "../src/api/index.ts";

function makeTmpDb() {
  const dir = mkdtempSync(join(tmpdir(), "sentinel-dash-"));
  const db = createDatabase(join(dir, "test.db"));
  return { db, dir };
}

describe("Dashboard API", () => {
  let db: SentinelDatabase;
  let tmpDir: string;
  let app: ReturnType<typeof createApi>;

  beforeEach(() => {
    const tmp = makeTmpDb();
    db = tmp.db;
    tmpDir = tmp.dir;
    app = createApi(db);
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("GET /api/signals returns recent signals sorted by timestamp desc", async () => {
    db.insertSignal({
      id: "sig-1",
      timestamp: "2026-04-01T10:00:00.000Z",
      eventType: "anomaly_zscore",
      confidence: 0.8,
      direction: "VOLATILITY",
      urgency: "IMMEDIATE",
      contributingEventIds: JSON.stringify(["evt-1"]),
      status: "pending",
    });
    db.insertSignal({
      id: "sig-2",
      timestamp: "2026-04-02T10:00:00.000Z",
      eventType: "military_action",
      confidence: 0.9,
      direction: "BULLISH",
      urgency: "IMMEDIATE",
      contributingEventIds: JSON.stringify(["evt-2", "evt-3"]),
      status: "pending",
    });

    const res = await app.request("/api/signals");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { signals: Array<Record<string, unknown>> };
    expect(body.signals).toHaveLength(2);
    // Most recent first
    expect(body.signals[0].id).toBe("sig-2");
    expect(body.signals[1].id).toBe("sig-1");
  });

  test("GET /api/trades returns trades sorted by timestamp desc", async () => {
    db.insertTrade({
      id: "t-1",
      timestamp: "2026-04-01T10:00:00.000Z",
      venue: "IG",
      instrument: "Crude Oil",
      direction: "LONG",
      size: 2,
      entryPrice: 75,
      status: "open",
      mode: "MODE_1",
      executionType: "MANUAL",
    });
    db.insertTrade({
      id: "t-2",
      timestamp: "2026-04-02T10:00:00.000Z",
      venue: "IG",
      instrument: "Gold",
      direction: "SHORT",
      size: 1,
      entryPrice: 2000,
      exitPrice: 1950,
      pnl: 50,
      status: "closed",
      mode: "MODE_3",
      executionType: "MANUAL",
      closedAt: "2026-04-02T15:00:00.000Z",
    });

    const res = await app.request("/api/trades");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { trades: Array<Record<string, unknown>> };
    expect(body.trades).toHaveLength(2);
    expect(body.trades[0].id).toBe("t-2");
  });

  test("GET /api/trades/summary returns P&L aggregation", async () => {
    db.insertTrade({
      id: "t-1",
      timestamp: "2026-04-01T10:00:00.000Z",
      venue: "IG",
      instrument: "Oil",
      direction: "LONG",
      size: 2,
      entryPrice: 75,
      exitPrice: 80,
      pnl: 10,
      status: "closed",
      mode: "MODE_1",
      executionType: "MANUAL",
      closedAt: "2026-04-01T15:00:00.000Z",
    });
    db.insertTrade({
      id: "t-2",
      timestamp: "2026-04-02T10:00:00.000Z",
      venue: "IG",
      instrument: "Gold",
      direction: "SHORT",
      size: 1,
      entryPrice: 2000,
      exitPrice: 2050,
      pnl: -50,
      status: "closed",
      mode: "MODE_3",
      executionType: "MANUAL",
      closedAt: "2026-04-02T15:00:00.000Z",
    });
    db.insertTrade({
      id: "t-3",
      timestamp: "2026-04-03T10:00:00.000Z",
      venue: "IG",
      instrument: "FTSE",
      direction: "LONG",
      size: 1,
      entryPrice: 7500,
      status: "open",
      mode: "MODE_3",
      executionType: "MANUAL",
    });

    const res = await app.request("/api/trades/summary");
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.realizedPnL).toBe(-40);
    expect(body.closedTradeCount).toBe(2);
    expect(body.openTradeCount).toBe(1);
    expect(body.winCount).toBe(1);
    expect(body.lossCount).toBe(1);
  });

  test("GET /api/wealth returns latest wealth snapshot", async () => {
    db.insertWealthSnapshot({
      id: "ws-1",
      date: "2026-04-01",
      isaValue: 10000,
      sippValue: 5000,
      spreadBettingValue: 3000,
      cryptoValue: 1000,
      cashValue: 2000,
      totalValue: 21000,
    });
    db.insertWealthSnapshot({
      id: "ws-2",
      date: "2026-04-02",
      isaValue: 10200,
      sippValue: 5100,
      spreadBettingValue: 3200,
      cryptoValue: 900,
      cashValue: 2000,
      totalValue: 21400,
    });

    const res = await app.request("/api/wealth");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { snapshot: Record<string, unknown> };
    expect(body.snapshot.date).toBe("2026-04-02");
    expect(body.snapshot.totalValue).toBe(21400);
  });

  test("POST /api/wealth saves a new wealth snapshot", async () => {
    const res = await app.request("/api/wealth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: "2026-04-03",
        isaValue: 10500,
        sippValue: 5200,
        spreadBettingValue: 3300,
        cryptoValue: 800,
        cashValue: 2000,
        totalValue: 21800,
      }),
    });

    expect(res.status).toBe(201);

    // Verify it's persisted
    const getRes = await app.request("/api/wealth");
    const body = (await getRes.json()) as { snapshot: Record<string, unknown> };
    expect(body.snapshot.date).toBe("2026-04-03");
    expect(body.snapshot.totalValue).toBe(21800);
  });

  test("GET /api/regime returns latest regime indicators", async () => {
    db.insertRegimeIndicator({
      id: "ri-1",
      date: "2026-04-01",
      vix: 18.5,
      yield2y: 4.2,
      yield10y: 4.5,
      spread2s10s: 0.3,
      sp500Vs200dma: 1.02,
      regimeScore: 65,
    });

    const res = await app.request("/api/regime");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { regime: Record<string, unknown> };
    expect(body.regime.vix).toBe(18.5);
    expect(body.regime.regimeScore).toBe(65);
  });

  test("GET /api/wealth returns null when no snapshots exist", async () => {
    const res = await app.request("/api/wealth");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { snapshot: unknown };
    expect(body.snapshot).toBeNull();
  });
});
