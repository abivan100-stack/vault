import { Link, useNavigate } from "react-router-dom";
import { Shield, Activity, Database, Package, ArrowRight, CheckCircle2, Thermometer, Clock3, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export default function LandingPage() {
  const navigate = useNavigate();
  return (
    <div className="space-y-0">
      {/* Clean hero — no flashy orbit, no 104px hype */}
      <section className="pt-10 pb-12">
        <div className="inline-flex items-center gap-2 rounded-full border border-[#cbd2c6] dark:border-[#2a352f] bg-white dark:bg-[#171c19] px-3 py-1.5 shadow-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-[#318b5d] dark:bg-[#5ac18a] animate-pulse" />
          <span className="font-mono text-[8px] tracking-[0.12em] font-bold text-[#1d5d59] dark:text-[#7ec8c1]">COLD-CHAIN • VAULT 01</span>
          <span className="hidden sm:inline font-mono text-[7px] text-[#667068] dark:text-[#7a8a84]">• local simulation • no sensor needed</span>
        </div>

        <div className="mt-6 grid gap-8 lg:grid-cols-[1.15fr_0.85fr] items-start">
          <div>
            <h1 className="font-semibold tracking-[-0.06em] leading-[0.92] text-[42px] sm:text-[48px] lg:text-[52px] text-[#172019] dark:text-[#e8e9e3]">
              Cold-chain
              <br />
              <span className="text-[#267e79] dark:text-[#3aa79f]">integrity,</span> made
              <br />
              visible.
            </h1>
            <p className="mt-4 max-w-[520px] text-[14px] leading-[1.6] text-[#4f5a52] dark:text-[#a8b8b0]">
              Vault records every dose’s journey — temperature, time and trust — from loading bay to last-mile handoff. Simulation runs locally, data persists, ledger is verifiable.
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              <Button className="bg-[#267e79] hover:bg-[#1d5d59] text-white font-mono text-[9px] h-9 px-5 gap-2" onClick={() => navigate("/monitor")}>
                <span>OPEN MONITOR</span> <ArrowRight size={12} />
              </Button>
              <Button variant="outline" className="font-mono text-[9px] h-9 px-5 gap-2 border-[#cbd2c6] dark:border-[#2a352f]" onClick={() => navigate("/shipment")}>
                <Package size={12} /> VIEW SHIPMENT
              </Button>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-3 font-mono text-[8px] text-[#667068] dark:text-[#7a8a84]">
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 size={10} className="text-[#318b5d] dark:text-[#5ac18a]" /> 2–8°C corridor
              </span>
              <span>•</span>
              <span className="inline-flex items-center gap-1.5">
                <Clock3 size={10} /> 2s sampling
              </span>
              <span>•</span>
              <span className="inline-flex items-center gap-1.5">
                <Database size={10} /> Immutable ledger
              </span>
            </div>
          </div>

          <Card className="overflow-hidden border-[#cbd2c6] dark:border-[#2a352f] bg-white dark:bg-[#171c19] shadow-[0_12px_32px_rgba(23,32,25,0.08)] dark:shadow-[0_12px_32px_rgba(0,0,0,0.28)]">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="font-mono text-[9px] tracking-[0.14em] flex items-center gap-2">
                  <Shield size={12} className="text-[#267e79] dark:text-[#3aa79f]" /> VAULT PREVIEW
                </CardTitle>
                <Badge variant="secondary" className="bg-[#e6f0e9] dark:bg-[#1e2623] text-[#318b5d] dark:text-[#5ac18a] border text-[7px]">LIVE SIMULATION</Badge>
              </div>
              <CardDescription className="font-mono text-[9px]">What you’ll see inside — no flashy orbit, just the essentials.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-[#e6ebe4] dark:border-[#2a352f] bg-[#f7f8f4] dark:bg-[#1c2220] p-3 text-center">
                  <Thermometer size={16} className="mx-auto text-[#267e79] dark:text-[#3aa79f]" />
                  <div className="mt-1.5 font-mono text-[8px] font-bold">MONITOR</div>
                  <div className="font-mono text-[7px] text-[#5a6a62] dark:text-[#9aa6a1]">4.4°C • SAFE</div>
                </div>
                <div className="rounded-lg border border-[#e6ebe4] dark:border-[#2a352f] bg-[#f7f8f4] dark:bg-[#1c2220] p-3 text-center">
                  <Database size={16} className="mx-auto text-[#267e79] dark:text-[#3aa79f]" />
                  <div className="mt-1.5 font-mono text-[8px] font-bold">LEDGER</div>
                  <div className="font-mono text-[7px] text-[#5a6a62] dark:text-[#9aa6a1]">042 • VALID</div>
                </div>
                <div className="rounded-lg border border-[#e6ebe4] dark:border-[#2a352f] bg-[#f7f8f4] dark:bg-[#1c2220] p-3 text-center">
                  <Package size={16} className="mx-auto text-[#267e79] dark:text-[#3aa79f]" />
                  <div className="mt-1.5 font-mono text-[8px] font-bold">SHIPMENT</div>
                  <div className="font-mono text-[7px] text-[#5a6a62] dark:text-[#9aa6a1]">VCC-BOX-001</div>
                </div>
              </div>
              <Separator />
              <div className="flex items-center justify-between font-mono text-[8px]">
                <span className="text-[#5a6a62] dark:text-[#9aa6a1]">02.0 — 08.0 °C • 250 units</span>
                <Link to="/shipment" className="inline-flex items-center gap-1 text-[#1d5d59] dark:text-[#7ec8c1] hover:underline">
                  Open shipment <ArrowRight size={10} />
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="border-t border-[#cbd2c6] dark:border-[#2a352f] py-10">
        <div className="eyebrow">WHY VAULT</div>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          <Card className="border-[#cbd2c6] dark:border-[#2a352f] bg-white dark:bg-[#171c19]">
            <CardHeader className="pb-2">
              <Activity size={16} className="text-[#267e79] dark:text-[#3aa79f]" />
              <CardTitle className="font-mono text-[9px] tracking-[0.12em] mt-2">LIVE MONITORING</CardTitle>
            </CardHeader>
            <CardContent className="font-mono text-[9px] leading-[1.6] text-[#5a6a62] dark:text-[#9aa6a1]">Hover the graph for precise °C, see SAFE/EXCURSION instantly, pause simulation anytime.</CardContent>
          </Card>
          <Card className="border-[#cbd2c6] dark:border-[#2a352f] bg-white dark:bg-[#171c19]">
            <CardHeader className="pb-2">
              <Database size={16} className="text-[#267e79] dark:text-[#3aa79f]" />
              <CardTitle className="font-mono text-[9px] tracking-[0.12em] mt-2">IMMUTABLE TRAIL</CardTitle>
            </CardHeader>
            <CardContent className="font-mono text-[9px] leading-[1.6] text-[#5a6a62] dark:text-[#9aa6a1]">Every reading is hashed and sequenced. Copy full hash, export CSV for audit.</CardContent>
          </Card>
          <Card className="border-[#cbd2c6] dark:border-[#2a352f] bg-white dark:bg-[#171c19]">
            <CardHeader className="pb-2">
              <Package size={16} className="text-[#267e79] dark:text-[#3aa79f]" />
              <CardTitle className="font-mono text-[9px] tracking-[0.12em] mt-2">SHIPMENT TRUTH</CardTitle>
            </CardHeader>
            <CardContent className="font-mono text-[9px] leading-[1.6] text-[#5a6a62] dark:text-[#9aa6a1]">Box, batch, route and doses — editable in a dedicated workspace, not cluttering the display. Persisted locally.</CardContent>
          </Card>
        </div>
      </section>

      <section className="border-t border-[#cbd2c6] dark:border-[#2a352f] py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="font-mono text-[9px] text-[#5a6a62] dark:text-[#9aa6a1]">First impression should be calm, not flashy. No rotating rings — just clarity.</div>
        <div className="flex gap-2">
          <Button variant="outline" className="font-mono text-[9px] h-8" onClick={() => navigate("/ledger")}>
            VIEW LEDGER
          </Button>
          <Button className="bg-[#172019] dark:bg-[#e8e9e3] dark:text-[#0e1210] hover:bg-black font-mono text-[9px] h-8 gap-1.5" onClick={() => navigate("/shipment/manage")}>
            <Settings2 size={12} /> MANAGE SHIPMENT
          </Button>
        </div>
      </section>
    </div>
  );
}
