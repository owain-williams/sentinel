import { useFetch } from "../hooks";

interface Trade {
  id: string;
  timestamp: string;
  venue: string;
  instrument: string;
  direction: string;
  size: number;
  entryPrice: number | null;
  exitPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  pnl: number | null;
  status: string | null;
  mode: string;
}

interface Summary {
  realizedPnL: number;
  closedTradeCount: number;
  openTradeCount: number;
  winCount: number;
  lossCount: number;
}

function SummaryCard({ summary }: { summary: Summary }) {
  const winRate =
    summary.closedTradeCount > 0 ? (summary.winCount / summary.closedTradeCount) * 100 : 0;

  return (
    <div style={{ display: "flex", gap: "16px", marginBottom: "24px", flexWrap: "wrap" }}>
      {[
        {
          label: "Realized P&L",
          value: `£${summary.realizedPnL.toFixed(2)}`,
          color: summary.realizedPnL >= 0 ? "#3fb950" : "#f85149",
        },
        { label: "Win Rate", value: `${winRate.toFixed(0)}%`, color: "#e1e4e8" },
        { label: "Open", value: String(summary.openTradeCount), color: "#58a6ff" },
        { label: "Closed", value: String(summary.closedTradeCount), color: "#8b949e" },
      ].map((card) => (
        <div
          key={card.label}
          style={{
            background: "#161b22",
            border: "1px solid #21262d",
            borderRadius: "8px",
            padding: "16px",
            minWidth: "140px",
          }}
        >
          <div style={{ fontSize: "12px", color: "#8b949e", marginBottom: "4px" }}>
            {card.label}
          </div>
          <div style={{ fontSize: "24px", fontWeight: 700, color: card.color }}>{card.value}</div>
        </div>
      ))}
    </div>
  );
}

export function PositionsPage() {
  const { data: tradesData, loading: tLoading } = useFetch<{ trades: Trade[] }>(
    "/api/trades",
    10000,
  );
  const { data: summaryData, loading: sLoading } = useFetch<Summary>("/api/trades/summary", 10000);

  if (tLoading || sLoading) return <p>Loading positions...</p>;

  const trades = tradesData?.trades ?? [];

  return (
    <div>
      <h2 style={{ marginBottom: "16px" }}>Positions & P&L</h2>
      {summaryData && <SummaryCard summary={summaryData} />}
      {trades.length === 0 ? (
        <p style={{ color: "#8b949e" }}>No trades recorded yet.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #21262d", textAlign: "left" }}>
              <th style={{ padding: "8px" }}>Time</th>
              <th style={{ padding: "8px" }}>Instrument</th>
              <th style={{ padding: "8px" }}>Dir</th>
              <th style={{ padding: "8px" }}>Size</th>
              <th style={{ padding: "8px" }}>Entry</th>
              <th style={{ padding: "8px" }}>Exit</th>
              <th style={{ padding: "8px" }}>P&L</th>
              <th style={{ padding: "8px" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t) => (
              <tr key={t.id} style={{ borderBottom: "1px solid #161b22" }}>
                <td style={{ padding: "8px", fontFamily: "monospace", fontSize: "13px" }}>
                  {new Date(t.timestamp).toLocaleString()}
                </td>
                <td style={{ padding: "8px" }}>{t.instrument}</td>
                <td
                  style={{ padding: "8px", color: t.direction === "LONG" ? "#3fb950" : "#f85149" }}
                >
                  {t.direction}
                </td>
                <td style={{ padding: "8px" }}>{t.size}</td>
                <td style={{ padding: "8px" }}>{t.entryPrice?.toFixed(2) ?? "-"}</td>
                <td style={{ padding: "8px" }}>{t.exitPrice?.toFixed(2) ?? "-"}</td>
                <td
                  style={{
                    padding: "8px",
                    color: t.pnl == null ? "#8b949e" : t.pnl >= 0 ? "#3fb950" : "#f85149",
                    fontWeight: 600,
                  }}
                >
                  {t.pnl != null ? `£${t.pnl.toFixed(2)}` : "-"}
                </td>
                <td style={{ padding: "8px" }}>
                  <span
                    style={{
                      background: t.status === "open" ? "#3fb95033" : "#21262d",
                      padding: "2px 8px",
                      borderRadius: "12px",
                      fontSize: "13px",
                    }}
                  >
                    {t.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
