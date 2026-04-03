import { useState } from "react";
import { useFetch } from "../hooks";

interface WealthSnapshot {
  date: string;
  isaValue: number | null;
  sippValue: number | null;
  spreadBettingValue: number | null;
  betfairValue: number | null;
  cryptoValue: number | null;
  cashValue: number | null;
  totalValue: number | null;
  regimeScore: number | null;
}

interface RegimeIndicator {
  date: string;
  vix: number | null;
  yield2y: number | null;
  yield10y: number | null;
  spread2s10s: number | null;
  sp500Vs200dma: number | null;
  regimeScore: number | null;
}

function regimeColor(score: number | null): string {
  if (score == null) return "#8b949e";
  if (score >= 70) return "#3fb950";
  if (score >= 30) return "#d29922";
  return "#f85149";
}

function AllocationBar({ snapshot }: { snapshot: WealthSnapshot }) {
  const total = snapshot.totalValue ?? 1;
  const items = [
    { label: "ISA", value: snapshot.isaValue ?? 0, color: "#58a6ff" },
    { label: "SIPP", value: snapshot.sippValue ?? 0, color: "#3fb950" },
    { label: "Spread Bet", value: snapshot.spreadBettingValue ?? 0, color: "#d29922" },
    { label: "Betfair", value: snapshot.betfairValue ?? 0, color: "#f0883e" },
    { label: "Crypto", value: snapshot.cryptoValue ?? 0, color: "#bc8cff" },
    { label: "Cash", value: snapshot.cashValue ?? 0, color: "#8b949e" },
  ].filter((i) => i.value > 0);

  return (
    <div style={{ marginBottom: "24px" }}>
      <div
        style={{
          display: "flex",
          height: "24px",
          borderRadius: "6px",
          overflow: "hidden",
          marginBottom: "8px",
        }}
      >
        {items.map((item) => (
          <div
            key={item.label}
            style={{ width: `${(item.value / total) * 100}%`, background: item.color }}
            title={`${item.label}: £${item.value.toLocaleString()}`}
          />
        ))}
      </div>
      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
        {items.map((item) => (
          <div
            key={item.label}
            style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px" }}
          >
            <div
              style={{ width: "10px", height: "10px", borderRadius: "50%", background: item.color }}
            />
            <span style={{ color: "#8b949e" }}>{item.label}</span>
            <span>£{item.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function WealthForm({ onSaved }: { onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const fields = [
    "isaValue",
    "sippValue",
    "spreadBettingValue",
    "betfairValue",
    "cryptoValue",
    "cashValue",
  ] as const;
  const labels: Record<string, string> = {
    isaValue: "ISA",
    sippValue: "SIPP",
    spreadBettingValue: "Spread Betting",
    betfairValue: "Betfair",
    cryptoValue: "Crypto",
    cashValue: "Cash",
  };

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.currentTarget);
    const data: Record<string, unknown> = { date: new Date().toISOString().split("T")[0] };
    let total = 0;
    for (const f of fields) {
      const val = parseFloat(form.get(f) as string) || 0;
      data[f] = val;
      total += val;
    }
    data.totalValue = total;

    await fetch("/api/wealth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setSaving(false);
    onSaved();
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: "#161b22",
        border: "1px solid #21262d",
        borderRadius: "8px",
        padding: "16px",
        marginBottom: "24px",
      }}
    >
      <h3 style={{ marginBottom: "12px", fontSize: "14px" }}>Update Wealth Snapshot</h3>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "12px",
          marginBottom: "12px",
        }}
      >
        {fields.map((f) => (
          <label
            key={f}
            style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px" }}
          >
            <span style={{ color: "#8b949e" }}>{labels[f]}</span>
            <input
              name={f}
              type="number"
              step="0.01"
              defaultValue="0"
              style={{
                background: "#0d1117",
                border: "1px solid #21262d",
                borderRadius: "6px",
                color: "#e1e4e8",
                padding: "6px 8px",
              }}
            />
          </label>
        ))}
      </div>
      <button
        type="submit"
        disabled={saving}
        style={{
          background: "#238636",
          color: "white",
          border: "none",
          borderRadius: "6px",
          padding: "8px 16px",
          cursor: "pointer",
          fontWeight: 600,
        }}
      >
        {saving ? "Saving..." : "Save Snapshot"}
      </button>
    </form>
  );
}

export function WealthPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const { data: wealthData, loading: wLoading } = useFetch<{ snapshot: WealthSnapshot | null }>(
    `/api/wealth?r=${refreshKey}`,
  );
  const { data: regimeData, loading: rLoading } = useFetch<{ regime: RegimeIndicator | null }>(
    "/api/regime",
  );

  if (wLoading || rLoading) return <p>Loading wealth data...</p>;

  const snapshot = wealthData?.snapshot;
  const regime = regimeData?.regime;

  return (
    <div>
      <h2 style={{ marginBottom: "16px" }}>Wealth Dashboard</h2>

      {snapshot ? (
        <div style={{ marginBottom: "24px" }}>
          <div
            style={{
              background: "#161b22",
              border: "1px solid #21262d",
              borderRadius: "8px",
              padding: "24px",
              marginBottom: "16px",
            }}
          >
            <div style={{ fontSize: "12px", color: "#8b949e", marginBottom: "4px" }}>
              Total Net Worth
            </div>
            <div style={{ fontSize: "36px", fontWeight: 700 }}>
              £{(snapshot.totalValue ?? 0).toLocaleString()}
            </div>
            <div style={{ fontSize: "13px", color: "#8b949e" }}>as of {snapshot.date}</div>
          </div>
          <AllocationBar snapshot={snapshot} />
        </div>
      ) : (
        <p style={{ color: "#8b949e", marginBottom: "16px" }}>No wealth data recorded yet.</p>
      )}

      {regime && (
        <div
          style={{
            background: "#161b22",
            border: "1px solid #21262d",
            borderRadius: "8px",
            padding: "16px",
            marginBottom: "24px",
          }}
        >
          <h3 style={{ marginBottom: "12px", fontSize: "14px" }}>Macro Regime</h3>
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: "12px", color: "#8b949e" }}>Regime Score</div>
              <div
                style={{
                  fontSize: "28px",
                  fontWeight: 700,
                  color: regimeColor(regime.regimeScore),
                }}
              >
                {regime.regimeScore ?? "-"}
              </div>
            </div>
            {[
              { label: "VIX", value: regime.vix },
              { label: "2Y Yield", value: regime.yield2y },
              { label: "10Y Yield", value: regime.yield10y },
              { label: "2s10s Spread", value: regime.spread2s10s },
            ].map((item) => (
              <div key={item.label}>
                <div style={{ fontSize: "12px", color: "#8b949e" }}>{item.label}</div>
                <div style={{ fontSize: "18px", fontWeight: 600 }}>
                  {item.value?.toFixed(2) ?? "-"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <WealthForm onSaved={() => setRefreshKey((k) => k + 1)} />
    </div>
  );
}
