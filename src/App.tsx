import { NavLink, Outlet, Link } from "react-router-dom";
import { ColdChainProvider } from "./context/ColdChainContext";

function Layout() {
  return (
    <div className="vault-app">
      <header className="topbar">
        <Link className="brand" to="/shipment" aria-label="Vault home">
          <span className="brand-mark">V</span>
          <span>
            <strong>VAULT</strong>
            <small>COLD-CHAIN / 01</small>
          </span>
        </Link>
        <nav className="topnav" aria-label="Primary navigation">
          <NavLink to="/monitor" className={({ isActive }) => (isActive ? "active" : "")}>
            MONITOR
          </NavLink>
          <NavLink to="/ledger" className={({ isActive }) => (isActive ? "active" : "")}>
            LEDGER
          </NavLink>
          <NavLink to="/shipment" className={({ isActive }) => (isActive ? "active" : "")}>
            SHIPMENT
          </NavLink>
        </nav>
        <div className="topbar-meta">
          <span className="meta-pill">
            <span className="live-dot" />
            <span className="mono">SIMULATED / LOCAL</span>
          </span>
          <button className="icon-button" aria-label="Open help">
            ?
          </button>
        </div>
      </header>

      <main id="top" className="page-wrap">
        <Outlet />
        <footer className="footer">
          <span className="mono">VAULT / FRONTEND PROTOTYPE</span>
          <span>Designed for a future sensor, ready for today&apos;s handoff.</span>
          <span className="mono">
            BUILD 0.1.0 <span className="footer-square" />
          </span>
        </footer>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ColdChainProvider>
      <Layout />
    </ColdChainProvider>
  );
}
