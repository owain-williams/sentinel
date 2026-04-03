import type { SignalEvent } from "@sentinel/shared";

export interface SuggestedTrade {
  venue: string;
  instrument: string;
  direction: "LONG" | "SHORT";
  rationale: string;
}

const EVENT_TYPE_MAP: Record<string, (signal: SignalEvent) => SuggestedTrade[]> = {
  military_action: () => [
    {
      venue: "IG",
      instrument: "Crude Oil",
      direction: "LONG",
      rationale: "Military action typically drives oil prices up",
    },
  ],

  energy_disruption: () => [
    {
      venue: "IG",
      instrument: "Crude Oil",
      direction: "LONG",
      rationale: "Energy supply disruption bullish for oil",
    },
  ],

  financial_stress: () => [
    {
      venue: "IG",
      instrument: "VIX",
      direction: "LONG",
      rationale: "Financial stress drives volatility higher",
    },
  ],

  market_event: () => [
    {
      venue: "BETFAIR",
      instrument: "Event Market",
      direction: "LONG",
      rationale: "Direct prediction market expression",
    },
  ],

  policy_shift: (signal) => {
    const direction = signal.direction === "BEARISH" ? ("SHORT" as const) : ("LONG" as const);
    const sector = signal.sector_impact?.[0] ?? "Sector";
    return [
      {
        venue: "IG",
        instrument: `${sector} ETF`,
        direction,
        rationale: `Policy shift impact on ${sector}`,
      },
    ];
  },
};

export function mapSignalToTrades(signal: SignalEvent): SuggestedTrade[] {
  const mapper = EVENT_TYPE_MAP[signal.event_type];
  if (!mapper) return [];
  return mapper(signal);
}
