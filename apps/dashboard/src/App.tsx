import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { SignalsPage } from "./pages/signals";
import { PositionsPage } from "./pages/positions";
import { WealthPage } from "./pages/wealth";

function Nav() {
  const linkStyle = ({ isActive }: { isActive: boolean }) => ({
    padding: "8px 16px",
    borderBottom: isActive ? "2px solid #58a6ff" : "2px solid transparent",
    color: isActive ? "#58a6ff" : "#8b949e",
    fontWeight: isActive ? 600 : 400,
    textDecoration: "none" as const,
  });

  return (
    <nav
      style={{ display: "flex", gap: "4px", borderBottom: "1px solid #21262d", padding: "0 16px" }}
    >
      <NavLink to="/" style={linkStyle}>
        Signals
      </NavLink>
      <NavLink to="/positions" style={linkStyle}>
        Positions
      </NavLink>
      <NavLink to="/wealth" style={linkStyle}>
        Wealth
      </NavLink>
    </nav>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <header style={{ padding: "16px", display: "flex", alignItems: "center", gap: "16px" }}>
          <h1 style={{ fontSize: "20px", fontWeight: 700 }}>Sentinel</h1>
        </header>
        <Nav />
        <main style={{ padding: "16px" }}>
          <Routes>
            <Route path="/" element={<SignalsPage />} />
            <Route path="/positions" element={<PositionsPage />} />
            <Route path="/wealth" element={<WealthPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
