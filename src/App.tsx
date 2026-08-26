import { useEffect, useState } from "react";
import anime from "animejs";
import { NavLink, Outlet, Link, useLocation } from "react-router-dom";
import { Shield, HelpCircle, Activity, Database, Package, Sun, Moon } from "lucide-react";
import { ColdChainProvider } from "./context/ColdChainContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import LoadingScreen from "./components/LoadingScreen";

function Layout({ isDark, toggleDark }: { isDark: boolean; toggleDark: () => void }) {
  const location = useLocation();
  const [helpOpen, setHelpOpen] = useState(false);

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
            <Package size={15} strokeWidth={2} aria-hidden="true" />
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
          <span className="meta-pill" title="Local simulation — live data generated every 2s, no sensor attached">
            <span className="live-dot" />
            <span className="mono">LIVE • LOCAL SIMULATION</span>
          </span>
          <button className="icon-button" aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"} onClick={toggleDark} title={isDark ? "Light mode" : "Dark mode"}>
            {isDark ? <Sun size={14} strokeWidth={2} aria-hidden="true" /> : <Moon size={14} strokeWidth={2} aria-hidden="true" />}
          </button>
          <button className="icon-button" aria-label="Open help" onClick={() => setHelpOpen(true)}>
            <HelpCircle size={14} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      </header>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-[560px] max-h-[86vh] overflow-hidden bg-white dark:bg-[#171c19] p-0 gap-0 border dark:border-[#2a352f]">
          <DialogHeader className="p-6 pb-4 border-b border-[#e6ebe4] dark:border-[#2a352f] bg-[#f7f8f4] dark:bg-[#1c2220]">
            <DialogTitle className="flex items-center gap-2.5 font-sans text-[15px] font-semibold tracking-[-0.01em] dark:text-[#e8e9e3]">
              <span className="h-8 w-8 rounded-lg bg-[#267e79] dark:bg-[#3aa79f] grid place-items-center text-white dark:text-[#0e1210]">
                <Shield size={14} strokeWidth={2.5} />
              </span>
              Vault Help Center
            </DialogTitle>
            <DialogDescription className="font-sans text-[13px] leading-[1.5] text-[#5a6a62] dark:text-[#9aa6a1]">Cold-chain integrity console — local simulation, no hardware needed. Here’s how to use it in 60 seconds.</DialogDescription>
          </DialogHeader>

          <div className="overflow-auto max-h-[60vh] p-6 space-y-5">
            <div className="flex gap-3 items-start rounded-lg border border-[#e6ebe4] dark:border-[#2a352f] bg-[#f7f8f4] dark:bg-[#1c2220] p-3.5">
              <Activity size={18} className="text-[#267e79] dark:text-[#3aa79f] mt-0.5 shrink-0" />
              <div>
                <div className="font-sans text-[13px] font-semibold tracking-[-0.01em] dark:text-[#e8e9e3]">Live simulation — what you’re seeing</div>
                <p className="font-sans text-[13px] leading-[1.6] text-[#33413d] dark:text-[#c8d5d0] mt-1">Temperature is generated every 2 seconds within the 2–8°C corridor (clamped 1.5–8.5 for excursion testing). No DHT22 sensor is attached. Readings live in React state and the shipment log persists to <span className="font-mono text-[11px] bg-white dark:bg-[#0e1210] border dark:border-[#2a352f] px-1.5 py-0.5 rounded">localStorage vault:fieldLog</span>.</p>
              </div>
            </div>

            <div>
              <div className="font-sans text-[11px] font-bold tracking-[0.08em] text-[#1d5d59] dark:text-[#7ec8c1]">QUICK START — 3 STEPS</div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-[#cbd2c6] dark:border-[#2a352f] bg-white dark:bg-[#1c2220] p-4 shadow-sm">
                  <div className="h-7 w-7 rounded-full bg-[#e6f0e9] dark:bg-[#1e2623] grid place-items-center text-[#1d5d59] dark:text-[#7ec8c1] font-mono text-[11px] font-bold">1</div>
                  <div className="mt-2.5 flex items-center gap-1.5 font-sans text-[13px] font-semibold dark:text-[#e8e9e3]">
                    <Package size={14} className="text-[#267e79] dark:text-[#3aa79f]" /> Shipment
                  </div>
                  <p className="font-sans text-[12px] leading-[1.55] text-[#5a6a62] dark:text-[#9aa6a1] mt-1.5">Open <span className="font-medium text-[#1d5d59] dark:text-[#7ec8c1]">Shipment → Manage</span> to edit box, batch, doses or route. Use Copy, Handoff, or New Shipment — changes reflect instantly on the overview.</p>
                </div>
                <div className="rounded-xl border border-[#cbd2c6] dark:border-[#2a352f] bg-white dark:bg-[#1c2220] p-4 shadow-sm">
                  <div className="h-7 w-7 rounded-full bg-[#e6f0e9] dark:bg-[#1e2623] grid place-items-center text-[#1d5d59] dark:text-[#7ec8c1] font-mono text-[11px] font-bold">2</div>
                  <div className="mt-2.5 flex items-center gap-1.5 font-sans text-[13px] font-semibold dark:text-[#e8e9e3]">
                    <Activity size={14} className="text-[#267e79] dark:text-[#3aa79f]" /> Monitor
                  </div>
                  <p className="font-sans text-[12px] leading-[1.55] text-[#5a6a62] dark:text-[#9aa6a1] mt-1.5">Watch the live gauge and hover the chart for precise °C at any timestamp. Status turns <span className="font-medium">EXCURSION</span> outside 2–8°C.</p>
                </div>
                <div className="rounded-xl border border-[#cbd2c6] dark:border-[#2a352f] bg-white dark:bg-[#1c2220] p-4 shadow-sm">
                  <div className="h-7 w-7 rounded-full bg-[#e6f0e9] dark:bg-[#1e2623] grid place-items-center text-[#1d5d59] dark:text-[#7ec8c1] font-mono text-[11px] font-bold">3</div>
                  <div className="mt-2.5 flex items-center gap-1.5 font-sans text-[13px] font-semibold dark:text-[#e8e9e3]">
                    <Database size={14} className="text-[#267e79] dark:text-[#3aa79f]" /> Ledger
                  </div>
                  <p className="font-sans text-[12px] leading-[1.55] text-[#5a6a62] dark:text-[#9aa6a1] mt-1.5">Every reading is hashed. Use search, copy the full hash, or export CSV for audit. Open Full Ledger for the complete trail.</p>
                </div>
              </div>
            </div>

            <div className="rounded-lg bg-[#f7f8f4] dark:bg-[#1c2220] border border-[#e6ebe4] dark:border-[#2a352f] p-3.5">
              <div className="font-sans text-[12px] font-semibold dark:text-[#e8e9e3]">Tips that actually help</div>
              <ul className="mt-2 space-y-1.5 font-sans text-[12px] leading-[1.55] text-[#33413d] dark:text-[#c8d5d0] list-disc pl-4">
                <li>
                  <span className="font-medium">Green dot</span> = simulation active. Pause it from Monitor → <span className="font-mono text-[11px] bg-white dark:bg-[#0e1210] border dark:border-[#2a352f] px-1 rounded">PAUSE SIMULATION</span>.
                </li>
                <li>New Shipment resets the log, batch and the chart — great for demos.</li>
                <li>Toggle dark/light with the sun/moon in the header. Preference is saved.</li>
                <li>Need a handoff proof? Use Shipment → Manage → Handoff — it stamps DELHI → JAIPUR.</li>
              </ul>
            </div>
          </div>

          <div className="p-4 border-t border-[#e6ebe4] dark:border-[#2a352f] bg-[#fcfdfb] dark:bg-[#0e1210] flex items-center justify-between gap-3">
            <div className="font-mono text-[8px] text-[#667068] dark:text-[#7a8a84]">VAULT 01 • local simulation • v0.1.0</div>
            <Button onClick={() => setHelpOpen(false)} className="bg-[#267e79] hover:bg-[#1d5d59] text-white font-sans text-[13px] font-medium rounded-full px-6 h-9 shadow-sm">
              Got it
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      const saved = window.localStorage.getItem("vault:theme");
      if (saved) return saved === "dark";
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    } catch {
      return false;
    }
  });
  const [loading, setLoading] = useState(true);
  const [showLoader, setShowLoader] = useState(true);

  useEffect(() => {
    const root = window.document.documentElement;
    if (isDark) root.classList.add("dark");
    else root.classList.remove("dark");
    try {
      window.localStorage.setItem("vault:theme", isDark ? "dark" : "light");
    } catch {
      // ignore
    }
  }, [isDark]);

  useEffect(() => {
    if (!loading) {
      anime({
        targets: ".loading-screen",
        opacity: [1, 0],
        duration: 420,
        easing: "easeInOutQuad",
        complete: () => setShowLoader(false),
      });
    }
  }, [loading]);

  const toggleDark = () => setIsDark((v) => !v);

  return (
    <>
      {showLoader && <LoadingScreen onFinished={() => setLoading(false)} />}
      <ColdChainProvider>
        <Layout isDark={isDark} toggleDark={toggleDark} />
      </ColdChainProvider>
    </>
  );
}
