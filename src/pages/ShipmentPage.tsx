import { useEffect, useState } from "react";
import anime from "animejs";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, ShieldAlert, Copy, CheckCircle2, ArrowRight, Settings2, Package, Thermometer, MapPin, Clock3, Hash, Boxes, Truck } from "lucide-react";
import { useColdChain } from "../context/ColdChainContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export default function ShipmentPage() {
  const { fieldLogMeta, status, temperature } = useColdChain();
  const navigate = useNavigate();
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    anime({ targets: ".shipment-header", translateY: [8, 0], opacity: [0, 1], duration: 520, easing: "easeOutExpo" });
    anime({ targets: ".shipment-grid > div", translateY: [12, 0], opacity: [0, 1], delay: anime.stagger(80), duration: 560, easing: "easeOutExpo" });
    return () => anime.remove(".shipment-header, .shipment-grid > div");
  }, []);

  useEffect(() => {
    anime({ targets: ".shield-glyph", scale: [0.85, 1], duration: 420, easing: "easeOutBack" });
  }, [status]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`${fieldLogMeta.box} • ${fieldLogMeta.batch}`);
      setToast("Copied Box & Batch");
    } catch {
      setToast("Copy failed");
    }
  };

  return (
    <div className="space-y-6">
      <section className="shipment-header flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-[#cbd2c6] dark:border-[#2a352f] pb-6">
        <div>
          <div className="eyebrow">03 / SHIPMENT</div>
          <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.04em] text-[#172019] dark:text-[#e8e9e3]">Shipment overview</h1>
          <p className="mt-1.5 max-w-[560px] font-mono text-[9px] leading-[1.6] text-[#5a6a62] dark:text-[#9aa6a1]">Production-grade record for one box, one batch, one corridor. No flash — just verifiable facts.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className={status === "SAFE" ? "bg-[#e6f0e9] dark:bg-[#1e2623] text-[#318b5d] dark:text-[#5ac18a] border-[#cbd2c6] dark:border-[#2a352f] text-[7px] h-6 gap-1.5 px-2.5" : "bg-[#f9e8c9] dark:bg-[#2a1f0a] text-[#8a5510] dark:text-[#d19a4a] text-[7px] h-6 gap-1.5 px-2.5"}>
            {status === "SAFE" ? <ShieldCheck size={11} /> : <ShieldAlert size={11} />} {status} • {temperature.toFixed(1)}°C
          </Badge>
          <Button onClick={() => navigate("/shipment/manage")} className="bg-[#267e79] hover:bg-[#1d5d59] text-white font-sans text-[13px] font-medium tracking-[-0.01em] h-9 px-5 gap-2 rounded-full shadow-sm">
            <Settings2 size={14} /> Manage
          </Button>
        </div>
      </section>

      <div className="shipment-grid grid gap-4 lg:grid-cols-3">
        {/* Primary shipment card */}
        <Card className="lg:col-span-2 overflow-hidden border-[#cbd2c6] dark:border-[#2a352f] bg-white dark:bg-[#171c19] shadow-[0_8px_24px_rgba(23,32,25,0.06)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.24)]">
          <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="font-mono text-[10px] tracking-[0.12em] flex items-center gap-2">
                <Package size={14} className="text-[#267e79] dark:text-[#3aa79f]" /> {fieldLogMeta.logId}
              </CardTitle>
              <CardDescription className="font-mono text-[8px] mt-1">Immutable field log — source of truth for this corridor.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 w-7 p-0 rounded-full">
              <Copy size={14} className="text-[#667068] dark:text-[#7a8a84]" />
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-[#e6ebe4] dark:border-[#2a352f] bg-[#f7f8f4] dark:bg-[#1c2220] p-3">
                <div className="flex items-center gap-1.5 font-mono text-[7px] font-bold tracking-[0.12em] text-[#267e79] dark:text-[#3aa79f]">
                  <Boxes size={10} /> BOX
                </div>
                <div className="mt-1 font-mono text-[11px] font-bold tracking-[-0.01em] text-[#172019] dark:text-[#e8e9e3]">{fieldLogMeta.box}</div>
                <div className="font-mono text-[7px] text-[#7a8a84]">{fieldLogMeta.batch}</div>
              </div>
              <div className="rounded-lg border border-[#e6ebe4] dark:border-[#2a352f] bg-[#f7f8f4] dark:bg-[#1c2220] p-3">
                <div className="flex items-center gap-1.5 font-mono text-[7px] font-bold tracking-[0.12em] text-[#267e79] dark:text-[#3aa79f]">
                  <Package size={10} /> PRODUCT
                </div>
                <div className="mt-1 font-mono text-[11px] font-bold tracking-[-0.01em] text-[#172019] dark:text-[#e8e9e3] truncate">{fieldLogMeta.product}</div>
                <div className="font-mono text-[7px] text-[#7a8a84]">{fieldLogMeta.doses} • {fieldLogMeta.range}</div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-[#f7f8f4] dark:bg-[#1c2220] border border-[#e6ebe4] dark:border-[#2a352f] p-2.5">
                <div className="font-mono text-[7px] tracking-[0.1em] text-[#5a6a62] dark:text-[#9aa6a1]">BATCH</div>
                <div className="mt-1 font-mono text-[9px] font-bold truncate">{fieldLogMeta.batch}</div>
              </div>
              <div className="rounded-lg bg-[#f7f8f4] dark:bg-[#1c2220] border border-[#e6ebe4] dark:border-[#2a352f] p-2.5">
                <div className="font-mono text-[7px] tracking-[0.1em] text-[#5a6a62] dark:text-[#9aa6a1]">DOSES</div>
                <div className="mt-1 font-mono text-[9px] font-bold">{fieldLogMeta.doses}</div>
              </div>
              <div className="rounded-lg bg-[#f7f8f4] dark:bg-[#1c2220] border border-[#e6ebe4] dark:border-[#2a352f] p-2.5">
                <div className="font-mono text-[7px] tracking-[0.1em] text-[#5a6a62] dark:text-[#9aa6a1]">RANGE</div>
                <div className="mt-1 font-mono text-[9px] font-bold">{fieldLogMeta.range}</div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge variant="secondary" className="bg-[#e6f0e9] dark:bg-[#1e2623] text-[#318b5d] dark:text-[#5ac18a] border text-[7px]"><CheckCircle2 size={10} /> LIVE</Badge>
              <Badge variant="outline" className="font-mono text-[7px] dark:border-[#2a352f]">VCC • {fieldLogMeta.box.split("-").pop()}</Badge>
              <Badge variant="outline" className="font-mono text-[7px] flex items-center gap-1 dark:border-[#2a352f]">
                <Hash size={10} /> {fieldLogMeta.batch.slice(0, 12)}
              </Badge>
            </div>

            {toast && (
              <div className="mt-3 rounded-md bg-[#172019] dark:bg-[#0e1210] text-white text-[9px] font-mono px-3 py-2 flex items-center gap-2 border dark:border-[#2a352f]">
                <CheckCircle2 size={12} className="text-[#7ec8a1]" /> {toast}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Route + live */}
        <div className="space-y-4">
          <Card className="overflow-hidden border-[#cbd2c6] dark:border-[#2a352f] bg-white dark:bg-[#171c19]">
            <CardHeader className="pb-2">
              <CardTitle className="font-mono text-[9px] tracking-[0.12em] flex items-center gap-1.5">
                <MapPin size={12} className="text-[#267e79] dark:text-[#3aa79f]" /> ROUTE • LIVE CORRIDOR
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-center">
                  <div className="h-2.5 w-2.5 rounded-full bg-[#318b5d] dark:bg-[#5ac18a] mx-auto shadow-[0_0_0_4px_rgba(49,139,93,0.14)]" />
                  <div className="mt-1 font-mono text-[8px] font-bold">DELHI</div>
                  <div className="font-mono text-[7px] text-[#7a8a84]">Origin</div>
                </div>
                <div className="flex-1 mx-2 flex items-center gap-1">
                  <div className="h-[2px] flex-1 bg-[#cbd2c6] dark:bg-[#2a352f] rounded-full" />
                  <Truck size={12} className="text-[#267e79] dark:text-[#3aa79f] shrink-0" />
                  <div className="h-[2px] flex-1 bg-gradient-to-r from-[#267e79] to-[#cbd2c6] dark:from-[#3aa79f] dark:to-[#2a352f] rounded-full" />
                </div>
                <div className="text-center">
                  <div className="h-2.5 w-2.5 rounded-full bg-white dark:bg-[#1c2220] border-2 border-[#267e79] dark:border-[#3aa79f] mx-auto" />
                  <div className="mt-1 font-mono text-[8px] font-bold">JAIPUR</div>
                  <div className="font-mono text-[7px] text-[#7a8a84]">Destination</div>
                </div>
              </div>
              <div className="rounded-md bg-[#f7f8f4] dark:bg-[#1c2220] border border-[#e6ebe4] dark:border-[#2a352f] p-2.5 flex items-center justify-between">
                <div className="font-mono text-[8px]">
                  <div className="text-[#5a6a62] dark:text-[#9aa6a1] tracking-[0.08em]">STARTED</div>
                  <div className="font-bold text-[#172019] dark:text-[#e8e9e3]">{fieldLogMeta.started}</div>
                </div>
                <Separator orientation="vertical" className="h-8" />
                <div className="font-mono text-[8px] text-right">
                  <div className="text-[#5a6a62] dark:text-[#9aa6a1] tracking-[0.08em]">CORRIDOR</div>
                  <div className="font-bold text-[#1d5d59] dark:text-[#7ec8c1]">{fieldLogMeta.range}</div>
                </div>
              </div>
              <Button variant="outline" className="w-full font-sans text-[12px] font-medium h-8 rounded-full gap-1.5" onClick={() => navigate("/monitor")}>
                <Thermometer size={12} /> View live temp <ArrowRight size={12} />
              </Button>
            </CardContent>
          </Card>

          <Card className="border-[#cbd2c6] dark:border-[#2a352f] bg-[#f7f8f4] dark:bg-[#1c2220]">
            <CardContent className="p-3 flex items-start gap-2.5">
              <Clock3 size={14} className="text-[#267e79] dark:text-[#3aa79f] mt-0.5 shrink-0" />
              <div>
                <div className="font-mono text-[8px] font-bold tracking-[0.08em]">WHY THIS MATTERS</div>
                <p className="font-mono text-[8px] leading-[1.5] text-[#5a6a62] dark:text-[#9aa6a1] mt-1">One unbroken chain — 250 doses depend on staying 2–8°C. Vault makes the handoff verifiable, not flashy.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-[#cbd2c6] dark:border-[#2a352f] pt-6">
        <div className="font-mono text-[8px] text-[#667068] dark:text-[#7a8a84]">Need to mutate? Use the dedicated workspace — this overview stays clean.</div>
        <Button onClick={() => navigate("/shipment/manage")} className="bg-[#172019] dark:bg-[#e8e9e3] dark:text-[#0e1210] hover:bg-black font-sans text-[12px] font-medium h-8 px-4 rounded-full gap-1.5">
          <Settings2 size={13} /> Open workspace <ArrowRight size={12} />
        </Button>
      </div>
    </div>
  );
}
