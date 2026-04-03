import { describe, expect, test } from "vite-plus/test";
import { createExecutor, type ExecutionResult } from "../src/automation/executor.ts";
import { createRiskGate } from "../src/risk/circuit-breaker.ts";

describe("TradeExecutor", () => {
  test("Mode 3 trend signal auto-executes when risk gate approves", () => {
    const executions: Array<{ instrument: string; direction: string; size: number }> = [];
    const gate = createRiskGate({ capitalBase: 10000 });

    const executor = createExecutor({
      riskGate: gate,
      execute: (order) => {
        executions.push(order);
        return { success: true, dealId: "deal-001" };
      },
    });

    const result: ExecutionResult = executor.evaluateAndExecute(
      {
        instrument: "FTSE_100",
        direction: "LONG",
        size: 5,
        riskAmount: 200,
        stopLoss: 7900,
        takeProfit: 8200,
      },
      "trend_following",
    );

    expect(result.status).toBe("executed");
    expect(result.dealId).toBe("deal-001");
    expect(executions).toHaveLength(1);
    expect(executions[0].instrument).toBe("FTSE_100");
  });

  test("Mode 1 event signal returns awaiting_approval without executing", () => {
    const executions: unknown[] = [];
    const gate = createRiskGate({ capitalBase: 10000 });

    const executor = createExecutor({
      riskGate: gate,
      execute: (order) => {
        executions.push(order);
        return { success: true, dealId: "deal-002" };
      },
    });

    const result = executor.evaluateAndExecute(
      {
        instrument: "CRUDE_OIL",
        direction: "LONG",
        size: 3,
        riskAmount: 150,
        stopLoss: 72,
        takeProfit: 82,
      },
      "event_trading",
    );

    expect(result.status).toBe("awaiting_approval");
    expect(result.dealId).toBeUndefined();
    expect(executions).toHaveLength(0); // should NOT have executed
  });

  test("rejects trade when risk gate blocks it", () => {
    const gate = createRiskGate({ capitalBase: 10000 });
    gate.killSwitch();

    const executor = createExecutor({
      riskGate: gate,
      execute: () => ({ success: true, dealId: "nope" }),
    });

    const result = executor.evaluateAndExecute(
      {
        instrument: "GOLD",
        direction: "LONG",
        size: 2,
        riskAmount: 100,
        stopLoss: 1900,
        takeProfit: 2000,
      },
      "trend_following",
    );

    expect(result.status).toBe("rejected");
    expect(result.reason).toBe("trading_halted");
  });

  test("applies size multiplier from risk gate to execution", () => {
    const executedSizes: number[] = [];
    const gate = createRiskGate({ capitalBase: 100000 });

    // Trigger 5 consecutive losses for 50% size reduction
    for (let i = 0; i < 5; i++) {
      gate.recordOutcome(-50);
    }

    const executor = createExecutor({
      riskGate: gate,
      execute: (order) => {
        executedSizes.push(order.size);
        return { success: true, dealId: "deal-half" };
      },
    });

    executor.evaluateAndExecute(
      {
        instrument: "SP500",
        direction: "LONG",
        size: 10,
        riskAmount: 200,
        stopLoss: 4900,
        takeProfit: 5100,
      },
      "trend_following",
    );

    expect(executedSizes[0]).toBe(5); // 10 * 0.5
  });
});
