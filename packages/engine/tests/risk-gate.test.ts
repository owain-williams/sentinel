import { describe, expect, test } from "vite-plus/test";
import { createRiskGate } from "../src/risk/circuit-breaker.ts";

describe("RiskGate", () => {
  test("approves trade when within all limits", () => {
    const gate = createRiskGate({ capitalBase: 10000 });

    const decision = gate.checkTrade({
      riskAmount: 200, // 2% of capital — under 3% limit
      openPositionCount: 3, // under 5 limit
    });

    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBeUndefined();
  });

  test("blocks trade when max positions (5) already open", () => {
    const gate = createRiskGate({ capitalBase: 10000 });

    const decision = gate.checkTrade({
      riskAmount: 200,
      openPositionCount: 5,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("max_positions_reached");
  });

  test("blocks trade when daily risk would exceed 10% of capital", () => {
    const gate = createRiskGate({ capitalBase: 10000 });

    // Place 4 trades at 250 each = 1000 total (exactly at 10% limit)
    for (let i = 0; i < 4; i++) {
      expect(gate.checkTrade({ riskAmount: 250, openPositionCount: i }).allowed).toBe(true);
    }

    // This 100 would push total to 1100 > 1000 limit
    const decision = gate.checkTrade({ riskAmount: 100, openPositionCount: 4 });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("exceeds_daily_risk_limit");
  });

  test("halts trading when daily P&L drops below -5% of capital", () => {
    const gate = createRiskGate({ capitalBase: 10000 });

    expect(gate.isHalted()).toBe(false);

    // Record -400 loss (4% — not yet halted)
    gate.recordOutcome(-400);
    expect(gate.isHalted()).toBe(false);

    // Record another -150 loss (total -550, exceeds 5% = 500)
    gate.recordOutcome(-150);
    expect(gate.isHalted()).toBe(true);

    // New trades should be blocked
    const decision = gate.checkTrade({ riskAmount: 100, openPositionCount: 0 });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("trading_halted");
  });

  test("reduces size to 50% after 5 consecutive losses", () => {
    const gate = createRiskGate({ capitalBase: 100000 }); // large base so P&L halt doesn't trigger

    // 4 losses — size still normal
    for (let i = 0; i < 4; i++) {
      gate.recordOutcome(-50);
    }
    let decision = gate.checkTrade({ riskAmount: 200, openPositionCount: 0 });
    expect(decision.sizeMultiplier).toBe(1);

    // 5th loss triggers reduction
    gate.recordOutcome(-50);
    decision = gate.checkTrade({ riskAmount: 200, openPositionCount: 0 });
    expect(decision.sizeMultiplier).toBe(0.5);

    // A win resets the counter
    gate.recordOutcome(100);
    decision = gate.checkTrade({ riskAmount: 200, openPositionCount: 0 });
    expect(decision.sizeMultiplier).toBe(1);
  });

  test("kill switch halts trading and resume re-enables it", () => {
    const gate = createRiskGate({ capitalBase: 10000 });

    gate.killSwitch();
    expect(gate.isHalted()).toBe(true);

    const blocked = gate.checkTrade({ riskAmount: 100, openPositionCount: 0 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe("trading_halted");

    gate.resume();
    expect(gate.isHalted()).toBe(false);

    const allowed = gate.checkTrade({ riskAmount: 100, openPositionCount: 0 });
    expect(allowed.allowed).toBe(true);
  });
});
