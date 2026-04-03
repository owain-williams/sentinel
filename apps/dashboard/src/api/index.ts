import { Hono } from "hono";
import type { SentinelDatabase } from "@sentinel/shared";

export function createApi(db: SentinelDatabase) {
  const app = new Hono();

  app.get("/api/signals", (c) => {
    const signals = db.listSignals(50);
    return c.json({ signals });
  });

  app.get("/api/trades", (c) => {
    const trades = db.listTrades(50);
    return c.json({ trades });
  });

  app.get("/api/trades/summary", (c) => {
    const closed = db.listTradesByStatus("closed");
    const open = db.listTradesByStatus("open");

    let realizedPnL = 0;
    let winCount = 0;
    let lossCount = 0;

    for (const trade of closed) {
      const pnl = trade.pnl ?? 0;
      realizedPnL += pnl;
      if (pnl > 0) winCount++;
      else if (pnl < 0) lossCount++;
    }

    return c.json({
      realizedPnL,
      closedTradeCount: closed.length,
      openTradeCount: open.length,
      winCount,
      lossCount,
    });
  });

  app.get("/api/wealth", (c) => {
    const snapshot = db.latestWealthSnapshot() ?? null;
    return c.json({ snapshot });
  });

  app.post("/api/wealth", async (c) => {
    const body = await c.req.json();
    db.insertWealthSnapshot({
      id: crypto.randomUUID(),
      date: body.date,
      isaValue: body.isaValue ?? null,
      sippValue: body.sippValue ?? null,
      spreadBettingValue: body.spreadBettingValue ?? null,
      betfairValue: body.betfairValue ?? null,
      cryptoValue: body.cryptoValue ?? null,
      cashValue: body.cashValue ?? null,
      totalValue: body.totalValue ?? null,
      regimeScore: body.regimeScore ?? null,
    });
    return c.json({ ok: true }, 201);
  });

  app.get("/api/regime", (c) => {
    const regime = db.latestRegimeIndicator() ?? null;
    return c.json({ regime });
  });

  app.get("/api/health", (c) => {
    return c.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      trades: {
        open: db.listTradesByStatus("open").length,
      },
    });
  });

  return app;
}
