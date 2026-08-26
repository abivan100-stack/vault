import { useEffect, useState } from "react";
import anime from "animejs";
import { NavLink, Outlet, Link, useLocation } from "react-router-dom";
import { Shield, HelpCircle, Activity, Database, Package, Info } from "lucide-react";
import { ColdChainProvider } from "./context/ColdChainContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

function Layout() {
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
          <span className="meta-pill" title="Local simulation — live data generated every 2s, no sensor attached">
            <span className="live-dot" />
            <span className="mono">LIVE • LOCAL SIMULATION</span>
          </span>
          <button className="icon-button" aria-label="Open help" onClick={() => setHelpOpen(true)}>
            <HelpCircle size={14} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      </header>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-[480px] bg-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-mono text-[11px] tracking-[0.12em]">
              <Info size={14} className="text-[#267e79]" /> VAULT — HELP
            </DialogTitle>
            <DialogDescription className="font-mono text-[9px] text-[#5a6a62]">Cold-chain integrity console • local simulation mode</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex gap-3 items-start">
              <Activity size={16} className="text-[#267e79] mt-0.5 shrink-0" />
              <div>
                <div className="font-mono text-[9px] font-bold tracking-[0.08em]">LIVE SIMULATION</div>
                <p className="font-mono text-[9px] leading-[1.6] text-[#5a6a62]">Temperature is simulated every 2s (2–8°C corridor, clamped 1.5–8.5). No DHT22 attached. Data lives in browser state + localStorage for shipment.</p>
              </div>
            </div>
            <Separator />
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-[#e6ebe4] bg-[#f7f8f4] p-3">
                <Package size={14} className="text-[#1d5d59] mb-1.5" />
                <div className="font-mono text-[8px] font-bold">SHIPMENT</div>
                <p className="font-mono text-[8px] text-[#5a6a62] leading-[1.5]">Edit box, batch, route. Create, handoff, persist.</p>
              </div>
              <div className="rounded-lg border border-[#e6ebe4] bg-[#f7f8f4] p-3">
                <Activity size={14} className="text-[#1d5d59] mb-1.5" />
                <div className="font-mono text-[8px] font-bold">MONITOR</div>
                <p className="font-mono text-[8px] text-[#5a6a62] leading-[1.5]">Live temp, hover graph for precise reading, safe corridor.</p>
              </div>
              <div className="rounded-lg border border-[#e6ebe4] bg-[#f7f8f4] p-3">
                <Database size={14} className="text-[#1d5d59] mb-1.5" />
                <div className="font-mono text-[8px] font-bold">LEDGER</div>
                <p className="font-mono text-[8px] text-[#5a6a62] leading-[1.5]">Immutable trail, copy hash, export CSV.</p>
              </div>
            </div>
            <p className="font-mono text-[8px] text-[#667068]">Tip: Green dot = simulation active. Pause via Monitor. Data resets on New Shipment.</p>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => setHelpOpen(false)} className="bg-[#267e79] hover:bg-[#1d5d59] text-white font-mono text-[9px] h-7">GOT IT</Button>
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
  return (
    <ColdChainProvider>
      <Layout />
    </ColdChainProvider>
  );
}
