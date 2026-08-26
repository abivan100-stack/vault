import { useEffect, useState } from "react";
import anime from "animejs";
import { NavLink, Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { Shield, HelpCircle, Activity, Database, Package, Sun, Moon, Search, Bell, ChevronDown, Command } from "lucide-react";
import { ColdChainProvider } from "./context/ColdChainContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import LoadingScreen from "./components/LoadingScreen";

function Layout({ isDark, toggleDark }: { isDark: boolean; toggleDark: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [helpOpen, setHelpOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);

  useEffect(() => {
    anime({ targets: ".topbar", translateY: [-10, 0], opacity: [0, 1], duration: 480, easing: "easeOutExpo" });
    anime({ targets: ".brand, .topnav a, .topbar-actions > *", translateY: [-6, 0], opacity: [0, 1], delay: anime.stagger(35), duration: 480, easing: "easeOutExpo" });
  }, []);

  useEffect(() => {
    anime({ targets: ".page-wrap > div, .page-wrap > section", translateY: [8, 0], opacity: [0, 1], duration: 420, easing: "easeOutExpo" });
  }, [location.pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="vault-app min-h-screen bg-[#f3f4ed] dark:bg-[#0e1210]">
      {/* Production SaaS header — not amateur */}
      <header className="topbar sticky top-0 z-40 border-b border-[#e6ebe4] dark:border-[#1e2623] bg-white/90 dark:bg-[#0f1412]/90 backdrop-blur-xl supports-[backdrop-filter]:bg-white/80 dark:supports-[backdrop-filter]:bg-[#0f1412]/80">
        <div className="mx-auto max-w-[1420px] w-full px-4 sm:px-6 lg:px-[72px] h-[60px] flex items-center gap-4 lg:gap-6">
          {/* Brand */}
          <Link className="brand flex items-center gap-2.5 shrink-0" to="/" aria-label="Vault home">
            <span className="brand-mark h-8 w-8 rounded-[9px] bg-[#0e4a47] dark:bg-[#143d3b] text-white grid place-items-center border border-[#0e4a47] dark:border-[#1e4a47] shadow-sm">
              <Package size={14} strokeWidth={2} aria-hidden="true" />
            </span>
            <span className="leading-none">
              <strong className="block text-[13px] font-bold tracking-[0.14em] text-[#0e1816] dark:text-[#e8e9e3] leading-none">VAULT</strong>
              <small className="block font-mono text-[7px] tracking-[0.12em] text-[#5a6a62] dark:text-[#7a8a84] -mt-[1px]">COLD-CHAIN • 01</small>
            </span>
            <span className="hidden lg:inline-flex ml-1 rounded-full border border-[#cbd2c6] dark:border-[#2a352f] bg-[#f7f8f4] dark:bg-[#1c2220] px-1.5 py-0.5 font-mono text-[7px] font-bold tracking-[0.08em] text-[#1d5d59] dark:text-[#7ec8c1]">PROTOTYPE</span>
          </Link>

          {/* Center: segmented nav + command */}
          <div className="flex-1 flex items-center justify-center gap-3 min-w-0">
            <nav className="topnav hidden md:flex items-center p-1 rounded-full bg-[#f3f4ed] dark:bg-[#171c19] border border-[#e6ebe4] dark:border-[#2a352f] gap-1" aria-label="Primary navigation">
              <NavLink
                to="/monitor"
                className={({ isActive }) =>
                  `inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-sans text-[11px] font-medium tracking-[-0.01em] transition-all ${isActive ? "bg-white dark:bg-[#0e1210] text-[#0e4a47] dark:text-[#7ec8c1] shadow-sm border border-[#cbd2c6] dark:border-[#2a352f]" : "text-[#5a6a62] dark:text-[#9aa6a1] hover:text-[#0e1816] dark:hover:text-[#e8e9e3]"}`
                }
              >
                <Activity size={13} /> Monitor
              </NavLink>
              <NavLink
                to="/ledger"
                className={({ isActive }) =>
                  `inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-sans text-[11px] font-medium tracking-[-0.01em] transition-all ${isActive ? "bg-white dark:bg-[#0e1210] text-[#0e4a47] dark:text-[#7ec8c1] shadow-sm border border-[#cbd2c6] dark:border-[#2a352f]" : "text-[#5a6a62] dark:text-[#9aa6a1] hover:text-[#0e1816] dark:hover:text-[#e8e9e3]"}`
                }
              >
                <Database size={13} /> Ledger
              </NavLink>
              <NavLink
                to="/shipment"
                className={({ isActive }) =>
                  `inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-sans text-[11px] font-medium tracking-[-0.01em] transition-all ${isActive ? "bg-white dark:bg-[#0e1210] text-[#0e4a47] dark:text-[#7ec8c1] shadow-sm border border-[#cbd2c6] dark:border-[#2a352f]" : "text-[#5a6a62] dark:text-[#9aa6a1] hover:text-[#0e1816] dark:hover:text-[#e8e9e3]"}`
                }
              >
                <Package size={13} /> Shipment
              </NavLink>
            </nav>

            <button
              onClick={() => setCmdOpen(true)}
              className="hidden lg:inline-flex items-center gap-2 rounded-full border border-[#e6ebe4] dark:border-[#2a352f] bg-white dark:bg-[#1c2220] pl-3 pr-2 py-1.5 text-[12px] text-[#7a8a84] hover:border-[#cbd2c6] dark:hover:border-[#3a4a43] hover:bg-[#f7f8f4] dark:hover:bg-[#1e2623] transition-colors shadow-sm"
              aria-label="Search"
            >
              <Search size={13} className="text-[#9aa6a1]" />
              <span className="font-sans text-[12px]">Search ledger…</span>
              <span className="ml-2 hidden xl:inline-flex items-center gap-1 rounded-full bg-[#f3f4ed] dark:bg-[#0e1210] border border-[#e6ebe4] dark:border-[#2a352f] px-1.5 py-0.5 font-mono text-[10px] leading-none">
                <Command size={10} /> K
              </span>
            </button>
          </div>

          {/* Right: status + actions */}
          <div className="topbar-actions flex items-center gap-2 shrink-0">
            <span className="meta-pill hidden sm:inline-flex items-center gap-2 rounded-full border border-[#cbd2c6] dark:border-[#2a352f] bg-[#f7f8f4] dark:bg-[#1e2623] pl-2 pr-3 py-1 shadow-sm" title="Local simulation — live data generated every 2s">
              <span className="live-dot h-2 w-2 rounded-full bg-[#1e9e75] dark:bg-[#5ac18a] shadow-[0_0_0_4px_rgba(30,158,117,0.14)] animate-pulse" />
              <span className="font-mono text-[9px] font-bold tracking-[0.08em] text-[#0e4a47] dark:text-[#c8d5d0]">LIVE</span>
              <span className="hidden lg:inline font-mono text-[9px] tracking-[0.06em] text-[#5a6a62] dark:text-[#9aa6a1]">• LOCAL SIM</span>
            </span>

            <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-[#e6ebe4] dark:border-[#2a352f] bg-white dark:bg-[#1c2220] p-1 shadow-sm">
              <button className="icon-button !m-0 !h-7 !w-7 !bg-transparent !border-0 !shadow-none" aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"} onClick={toggleDark} title={isDark ? "Light mode" : "Dark mode"}>
                {isDark ? <Sun size={14} strokeWidth={2} /> : <Moon size={14} strokeWidth={2} />}
              </button>
              <div className="h-4 w-px bg-[#e6ebe4] dark:bg-[#2a352f]" />
              <button className="icon-button !m-0 !h-7 !w-7 !bg-transparent !border-0 !shadow-none" aria-label="Notifications">
                <Bell size={14} strokeWidth={2} />
              </button>
              <button className="icon-button !m-0 !h-7 !w-7 !bg-transparent !border-0 !shadow-none" aria-label="Open help" onClick={() => setHelpOpen(true)}>
                <HelpCircle size={14} strokeWidth={2} />
              </button>
            </div>

            {/* Mobile dark/help kept as before but grouped */}
            <div className="flex sm:hidden items-center gap-1">
              <button className="icon-button" aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"} onClick={toggleDark}>
                {isDark ? <Sun size={14} /> : <Moon size={14} />}
              </button>
              <button className="icon-button" aria-label="Open help" onClick={() => setHelpOpen(true)}>
                <HelpCircle size={14} />
              </button>
            </div>

            <div className="hidden lg:flex items-center gap-2 pl-2 ml-1 border-l border-[#e6ebe4] dark:border-[#2a352f]">
              <div className="h-8 w-8 rounded-full bg-[#0e4a47] dark:bg-[#143d3b] grid place-items-center text-white font-mono text-[10px] font-bold border border-[#0e4a47] dark:border-[#1e4a47]">RK</div>
              <div className="hidden xl:block leading-none">
                <div className="font-sans text-[11px] font-semibold tracking-[-0.01em] text-[#0e1816] dark:text-[#e8e9e3]">Raghav K.</div>
                <div className="font-mono text-[9px] text-[#7a8a84]">Admin • Vault 01</div>
              </div>
              <ChevronDown size={12} className="text-[#9aa6a1] hidden xl:block" />
            </div>
          </div>
        </div>

        {/* Mobile nav */}
        <div className="md:hidden border-t border-[#e6ebe4] dark:border-[#1e2623] bg-[#fcfdfb] dark:bg-[#0f1412]">
          <nav className="mx-auto max-w-[1420px] px-4 flex gap-1 py-2" aria-label="Mobile navigation">
            <NavLink to="/monitor" className={({ isActive }) => `flex-1 inline-flex justify-center items-center gap-1.5 rounded-full py-1.5 text-[11px] font-medium ${isActive ? "bg-white dark:bg-[#1c2220] border border-[#cbd2c6] dark:border-[#2a352f] shadow-sm" : "text-[#5a6a62] dark:text-[#9aa6a1]"}`}>
              <Activity size={13} /> Monitor
            </NavLink>
            <NavLink to="/ledger" className={({ isActive }) => `flex-1 inline-flex justify-center items-center gap-1.5 rounded-full py-1.5 text-[11px] font-medium ${isActive ? "bg-white dark:bg-[#1c2220] border border-[#cbd2c6] dark:border-[#2a352f] shadow-sm" : "text-[#5a6a62] dark:text-[#9aa6a1]"}`}>
              <Database size={13} /> Ledger
            </NavLink>
            <NavLink to="/shipment" className={({ isActive }) => `flex-1 inline-flex justify-center items-center gap-1.5 rounded-full py-1.5 text-[11px] font-medium ${isActive ? "bg-white dark:bg-[#1c2220] border border-[#cbd2c6] dark:border-[#2a352f] shadow-sm" : "text-[#5a6a62] dark:text-[#9aa6a1]"}`}>
              <Package size={13} /> Shipment
            </NavLink>
          </nav>
        </div>
      </header>

      <Dialog open={cmdOpen} onOpenChange={setCmdOpen}>
        <DialogContent className="max-w-[520px] bg-white dark:bg-[#171c19] p-0 overflow-hidden gap-0">
          <div className="flex items-center gap-2 border-b border-[#e6ebe4] dark:border-[#2a352f] p-3">
            <Search size={14} className="text-[#9aa6a1] ml-1" />
            <Input autoFocus placeholder="Search ledger, shipment, or jump to monitor…" className="h-8 border-0 shadow-none focus-visible:ring-0 font-sans text-[13px]" onKeyDown={(e) => { if (e.key === "Enter") { const v = (e.target as HTMLInputElement).value.toLowerCase(); if (v.includes("led")) navigate("/ledger"); else if (v.includes("mon")) navigate("/monitor"); else if (v.includes("ship")) navigate("/shipment"); else if (v.includes("land")) navigate("/"); setCmdOpen(false); } }} />
            <span className="hidden sm:inline-flex rounded-full bg-[#f3f4ed] dark:bg-[#1c2220] border px-1.5 py-0.5 font-mono text-[10px]">ESC</span>
          </div>
          <div className="p-2 grid gap-1">
            <button onClick={() => { navigate("/monitor"); setCmdOpen(false); }} className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-[#f7f8f4] dark:hover:bg-[#1c2220] text-left">
              <Activity size={14} className="text-[#267e79]" /> <span className="font-sans text-[13px] font-medium">Go to Monitor</span> <span className="ml-auto font-mono text-[10px] text-[#9aa6a1]">/monitor</span>
            </button>
            <button onClick={() => { navigate("/ledger"); setCmdOpen(false); }} className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-[#f7f8f4] dark:hover:bg-[#1c2220] text-left">
              <Database size={14} className="text-[#267e79]" /> <span className="font-sans text-[13px] font-medium">Open Ledger</span> <span className="ml-auto font-mono text-[10px] text-[#9aa6a1]">/ledger</span>
            </button>
            <button onClick={() => { navigate("/shipment/manage"); setCmdOpen(false); }} className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-[#f7f8f4] dark:hover:bg-[#1c2220] text-left">
              <Package size={14} className="text-[#267e79]" /> <span className="font-sans text-[13px] font-medium">Manage Shipment</span> <span className="ml-auto font-mono text-[10px] text-[#9aa6a1]">/shipment/manage</span>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-[560px] max-h-[86vh] overflow-hidden bg-white dark:bg-[#171c19] p-0 gap-0 border dark:border-[#2a352f]">
          <DialogHeader className="p-6 pb-4 border-b border-[#e6ebe4] dark:border-[#2a352f] bg-[#f7f8f4] dark:bg-[#1c2220]">
            <DialogTitle className="flex items-center gap-2.5 font-sans text-[15px] font-semibold tracking-[-0.01em] dark:text-[#e8e9e3]">
              <span className="h-8 w-8 rounded-lg bg-[#0e4a47] dark:bg-[#143d3b] grid place-items-center text-white border border-[#0e4a47] dark:border-[#1e4a47]"><Shield size={14} strokeWidth={2.5} /></span>
              Vault Help Center
            </DialogTitle>
            <DialogDescription className="font-sans text-[13px] leading-[1.5] text-[#5a6a62] dark:text-[#9aa6a1]">Cold-chain integrity console — local simulation, no hardware needed. Here’s how to use it in 60 seconds.</DialogDescription>
          </DialogHeader>
          <div className="overflow-auto max-h-[60vh] p-6 space-y-5">
            <div className="flex gap-3 items-start rounded-lg border border-[#e6ebe4] dark:border-[#2a352f] bg-[#f7f8f4] dark:bg-[#1c2220] p-3.5">
              <Activity size={18} className="text-[#0e4a47] dark:text-[#7ec8c1] mt-0.5 shrink-0" />
              <div>
                <div className="font-sans text-[13px] font-semibold tracking-[-0.01em] dark:text-[#e8e9e3]">Live simulation — what you’re seeing</div>
                <p className="font-sans text-[13px] leading-[1.6] text-[#33413d] dark:text-[#c8d5d0] mt-1">Temperature is generated every 2 seconds within the 2–8°C corridor (clamped 1.5–8.5 for excursion testing). No DHT22 sensor is attached. Readings live in React state and the shipment log persists to <span className="font-mono text-[11px] bg-white dark:bg-[#0e1210] border dark:border-[#2a352f] px-1.5 py-0.5 rounded">localStorage vault:fieldLog</span>.</p>
              </div>
            </div>
            <div>
              <div className="font-sans text-[11px] font-bold tracking-[0.08em] text-[#0e4a47] dark:text-[#7ec8c1]">QUICK START — 3 STEPS</div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-[#cbd2c6] dark:border-[#2a352f] bg-white dark:bg-[#1c2220] p-4 shadow-sm">
                  <div className="h-7 w-7 rounded-full bg-[#e6f0e9] dark:bg-[#1e2623] grid place-items-center text-[#0e4a47] dark:text-[#7ec8c1] font-mono text-[11px] font-bold">1</div>
                  <div className="mt-2.5 flex items-center gap-1.5 font-sans text-[13px] font-semibold dark:text-[#e8e9e3]"><Package size={14} className="text-[#0e4a47] dark:text-[#7ec8c1]" /> Shipment</div>
                  <p className="font-sans text-[12px] leading-[1.55] text-[#5a6a62] dark:text-[#9aa6a1] mt-1.5">Open <span className="font-medium text-[#0e4a47] dark:text-[#7ec8c1]">Shipment → Manage</span> to edit box, batch, doses or route. Use Copy, Handoff, or New Shipment — changes reflect instantly.</p>
                </div>
                <div className="rounded-xl border border-[#cbd2c6] dark:border-[#2a352f] bg-white dark:bg-[#1c2220] p-4 shadow-sm">
                  <div className="h-7 w-7 rounded-full bg-[#e6f0e9] dark:bg-[#1e2623] grid place-items-center text-[#0e4a47] dark:text-[#7ec8c1] font-mono text-[11px] font-bold">2</div>
                  <div className="mt-2.5 flex items-center gap-1.5 font-sans text-[13px] font-semibold dark:text-[#e8e9e3]"><Activity size={14} className="text-[#0e4a47] dark:text-[#7ec8c1]" /> Monitor</div>
                  <p className="font-sans text-[12px] leading-[1.55] text-[#5a6a62] dark:text-[#9aa6a1] mt-1.5">Watch the live gauge and hover the chart for precise °C. Status turns <span className="font-medium">EXCURSION</span> outside 2–8°C.</p>
                </div>
                <div className="rounded-xl border border-[#cbd2c6] dark:border-[#2a352f] bg-white dark:bg-[#1c2220] p-4 shadow-sm">
                  <div className="h-7 w-7 rounded-full bg-[#e6f0e9] dark:bg-[#1e2623] grid place-items-center text-[#0e4a47] dark:text-[#7ec8c1] font-mono text-[11px] font-bold">3</div>
                  <div className="mt-2.5 flex items-center gap-1.5 font-sans text-[13px] font-semibold dark:text-[#e8e9e3]"><Database size={14} className="text-[#0e4a47] dark:text-[#7ec8c1]" /> Ledger</div>
                  <p className="font-sans text-[12px] leading-[1.55] text-[#5a6a62] dark:text-[#9aa6a1] mt-1.5">Every reading is hashed. Use search, copy the full hash, or export CSV for audit.</p>
                </div>
              </div>
            </div>
            <div className="rounded-lg bg-[#f7f8f4] dark:bg-[#1c2220] border border-[#e6ebe4] dark:border-[#2a352f] p-3.5">
              <div className="font-sans text-[12px] font-semibold dark:text-[#e8e9e3]">Tips that actually help</div>
              <ul className="mt-2 space-y-1.5 font-sans text-[12px] leading-[1.55] text-[#33413d] dark:text-[#c8d5d0] list-disc pl-4">
                <li><span className="font-medium">Green dot</span> = simulation active. Pause from Monitor → <span className="font-mono text-[11px] bg-white dark:bg-[#0e1210] border dark:border-[#2a352f] px-1 rounded">PAUSE SIMULATION</span>.</li>
                <li>New Shipment resets the log, batch and the chart — great for demos.</li>
                <li>Toggle dark/light with the sun/moon. Preference is saved.</li>
                <li>Press <span className="font-mono text-[11px] bg-white dark:bg-[#0e1210] border dark:border-[#2a352f] px-1 rounded">⌘K</span> for command palette.</li>
              </ul>
            </div>
          </div>
          <div className="p-4 border-t border-[#e6ebe4] dark:border-[#2a352f] bg-[#fcfdfb] dark:bg-[#0e1210] flex items-center justify-between gap-3">
            <div className="font-mono text-[8px] text-[#667068] dark:text-[#7a8a84]">VAULT 01 • local simulation • v0.1.0</div>
            <Button onClick={() => setHelpOpen(false)} className="bg-[#0e4a47] hover:bg-[#143d3b] text-white font-sans text-[13px] font-medium rounded-full px-6 h-9 shadow-sm">Got it</Button>
          </div>
        </DialogContent>
      </Dialog>

      <main id="top" className="page-wrap">
        <Outlet />
        <footer className="footer">
          <span className="mono">VAULT / FRONTEND PROTOTYPE</span>
          <span>Designed for a future sensor, ready for today&apos;s handoff.</span>
          <span className="mono">BUILD 0.1.0 <span className="footer-square" /></span>
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
      // localStorage unavailable (e.g. private mode) — theme still applies in-session
    }
  }, [isDark]);

  useEffect(() => {
    if (!loading) {
      anime({ targets: ".loading-screen", opacity: [1, 0], duration: 420, easing: "easeInOutQuad", complete: () => setShowLoader(false) });
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
