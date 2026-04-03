import { useFetch } from "../hooks";

interface Signal {
  id: string;
  timestamp: string;
  eventType: string;
  confidence: number;
  direction: string | null;
  urgency: string | null;
  status: string | null;
}

const urgencyColor: Record<string, string> = {
  IMMEDIATE: "#f85149",
  HOURS: "#d29922",
  DAYS: "#8b949e",
};

const directionColor: Record<string, string> = {
  BULLISH: "#3fb950",
  BEARISH: "#f85149",
  VOLATILITY: "#d29922",
};

export function SignalsPage() {
  const { data, loading, error } = useFetch<{ signals: Signal[] }>("/api/signals", 10000);

  if (loading) return <p>Loading signals...</p>;
  if (error) return <p style={{ color: "#f85149" }}>Error: {error}</p>;

  const signals = data?.signals ?? [];

  return (
    <div>
      <h2 style={{ marginBottom: "16px" }}>Signal Feed</h2>
      {signals.length === 0 ? (
        <p style={{ color: "#8b949e" }}>No signals detected yet.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #21262d", textAlign: "left" }}>
              <th style={{ padding: "8px" }}>Time</th>
              <th style={{ padding: "8px" }}>Type</th>
              <th style={{ padding: "8px" }}>Confidence</th>
              <th style={{ padding: "8px" }}>Direction</th>
              <th style={{ padding: "8px" }}>Urgency</th>
              <th style={{ padding: "8px" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {signals.map((s) => (
              <tr key={s.id} style={{ borderBottom: "1px solid #161b22" }}>
                <td style={{ padding: "8px", fontFamily: "monospace", fontSize: "13px" }}>
                  {new Date(s.timestamp).toLocaleString()}
                </td>
                <td style={{ padding: "8px" }}>{s.eventType}</td>
                <td style={{ padding: "8px" }}>
                  <span
                    style={{
                      background:
                        s.confidence > 0.8
                          ? "#f8514933"
                          : s.confidence > 0.6
                            ? "#d2992233"
                            : "#21262d",
                      padding: "2px 8px",
                      borderRadius: "12px",
                      fontSize: "13px",
                    }}
                  >
                    {Math.round(s.confidence * 100)}%
                  </span>
                </td>
                <td
                  style={{ padding: "8px", color: directionColor[s.direction ?? ""] ?? "#8b949e" }}
                >
                  {s.direction}
                </td>
                <td style={{ padding: "8px", color: urgencyColor[s.urgency ?? ""] ?? "#8b949e" }}>
                  {s.urgency}
                </td>
                <td style={{ padding: "8px" }}>{s.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
