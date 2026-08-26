import { useEffect } from "react";
import anime from "animejs";
import { NavLink, Outlet, Link, useLocation } from "react-router-dom";
import { Shield, HelpCircle } from "lucide-react";
import { ColdChainProvider } from "./context/ColdChainContext";

function Layout() {
  const location = useLocation();

  useEffect(() => {
    anime({
      targets: ".topbar",
      translateY: [-12, 0],
      opacity: [0, 1],
      duration: 520,
      easing: "easeOutExpo",
    });
    anime({
      targets: ".brand, .topnav a, .topbar-meta",
      translateY: [-8, 0],
      opacity: [0, 1],
      delay: anime.stagger(45),
      duration: 560,
      easing: "easeOutExpo",
    });
  }, []);

  useEffect(() => {
    anime({
      targets: ".page-wrap > div, .page-wrap > section",
      translateY: [10, 0],
      opacity: [0, 1],
      duration: 460,
      easing: "easeOutExpo",
    });
  }, [location.pathname]);

  return (
    <div className="vault-app">
      <header className="topbar">
        <Link className="brand" to="/shipment" aria-label="Vault home">
          <span className="brand-mark">
            <Shield size={16} strokeWidth={2.5} aria-hidden="true" />
          </span>
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
            <HelpCircle size={14} strokeWidth={2} aria-hidden="true" />
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
