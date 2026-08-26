import { useEffect, useState } from "react";
import anime from "animejs";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, ShieldAlert, Copy, CheckCircle2, ArrowRight, Settings2 } from "lucide-react";
import { useColdChain } from "../context/ColdChainContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function ShipmentPage() {
  const { fieldLogMeta, status } = useColdChain();
  const navigate = useNavigate();
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    anime({ targets: ".shipment-header", translateY: [8, 0], opacity: [0, 1], duration: 520, easing: "easeOutExpo" });
    anime({ targets: ".field-log", translateY: [12, 0], opacity: [0, 1], duration: 560, delay: 80, easing: "easeOutExpo" });
    return () => anime.remove(".shipment-header, .field-log");
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
    <div className="space-y-0">
      <section className="shipment-header pt-8 pb-6 border-b border-[#cbd2c6] dark:border-[#2a352f]">
        <div className="eyebrow">03 / SHIPMENT</div>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-semibold tracking-[-0.04em] text-[#172019] dark:text-[#e8e9e3]">Shipment overview.</h1>
            <p className="mt-1.5 max-w-[560px] font-mono text-[9px] leading-[1.6] text-[#5a6a62] dark:text-[#9aa6a1]">A precise record for one box, one batch, one corridor. No flash — just the facts.</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={status === "SAFE" ? "bg-[#e6f0e9] dark:bg-[#1e2623] text-[#318b5d] dark:text-[#5ac18a] border-[#cbd2c6] dark:border-[#2a352f] text-[7px] h-5" : "bg-[#f9e8c9] dark:bg-[#2a1f0a] text-[#8a5510] dark:text-[#d19a4a] text-[7px] h-5"}>
              {status === "SAFE" ? <ShieldCheck size={10} /> : <ShieldAlert size={10} />} {status}
            </Badge>
            <Button onClick={() => navigate("/shipment/manage")} className="bg-[#267e79] hover:bg-[#1d5d59] text-white font-sans text-[13px] font-medium tracking-[-0.01em] h-10 px-6 gap-2 rounded-full shadow-sm">
              <Settings2 size={14} /> Manage
            </Button>
          </div>
        </div>
      </section>

      <section className="py-8 flex justify-center">
        <Card className="field-log w-full max-w-[380px] gap-0 !p-0 overflow-hidden bg-white dark:bg-[#171c19] border-[#cbd2c6] dark:border-[#2a352f] rounded-[10px] shadow-[0_8px_24px_rgba(23,32,25,0.08)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.32)]">
          <CardContent className="p-[22px_20px_20px]">
            <div className="flex items-start justify-between gap-2">
              <div className="eyebrow text-[#172019] dark:text-[#e8e9e3] font-bold tracking-[0.11em] text-[9.5px]">{fieldLogMeta.logId}</div>
              <span className="font-mono text-[7px] tracking-[0.1em] text-[#5a6a62] dark:text-[#7a8a84] border border-[#e6ebe4] dark:border-[#2a352f] rounded-full px-2 py-1 bg-[#f7f8f4] dark:bg-[#1c2220]">VCC • {fieldLogMeta.box.split("-").pop()}</span>
            </div>
            <div className="log-rule border-t-[1.5px] border-[#e0e6dd] dark:border-[#2a352f] mt-[14px] mb-[2px]" />
            <dl className="m-0">
              <div className="py-[12px] border-b border-[#e6ebe4] dark:border-[#2a352f] flex flex-col gap-1">
                <dt className="font-mono text-[8px] font-bold text-[#267e79] dark:text-[#3aa79f] tracking-[0.14em] uppercase">BOX</dt>
                <dd className="font-mono text-[10.5px] font-semibold text-[#172019] dark:text-[#e8e9e3] flex items-center justify-between gap-2">
                  {fieldLogMeta.box}
                  <button onClick={handleCopy} className="p-1 rounded hover:bg-[#f7f8f4] dark:hover:bg-[#24302c] transition-colors" aria-label="Copy box">
                    <Copy size={12} className="text-[#667068] dark:text-[#7a8a84]" />
                  </button>
                </dd>
              </div>
              <div className="py-[12px] border-b border-[#e6ebe4] dark:border-[#2a352f] flex flex-col gap-1">
                <dt className="font-mono text-[8px] font-bold text-[#267e79] dark:text-[#3aa79f] tracking-[0.14em] uppercase">PRODUCT</dt>
                <dd className="font-mono text-[10.5px] font-semibold text-[#172019] dark:text-[#e8e9e3]">{fieldLogMeta.product}</dd>
              </div>
              <div className="py-[12px] border-b border-[#e6ebe4] dark:border-[#2a352f] flex flex-col gap-1">
                <dt className="font-mono text-[8px] font-bold text-[#267e79] dark:text-[#3aa79f] tracking-[0.14em] uppercase">BATCH</dt>
                <dd className="font-mono text-[10.5px] font-semibold text-[#172019] dark:text-[#e8e9e3]">{fieldLogMeta.batch}</dd>
              </div>
              <div className="py-[12px] border-b border-[#e6ebe4] dark:border-[#2a352f] flex flex-col gap-1">
                <dt className="font-mono text-[8px] font-bold text-[#267e79] dark:text-[#3aa79f] tracking-[0.14em] uppercase">DOSES</dt>
                <dd className="font-mono text-[10.5px] font-semibold text-[#172019] dark:text-[#e8e9e3]">{fieldLogMeta.doses}</dd>
              </div>
              <div className="py-[12px] flex flex-col gap-1">
                <dt className="font-mono text-[8px] font-bold text-[#267e79] dark:text-[#3aa79f] tracking-[0.14em] uppercase">RANGE</dt>
                <dd className="font-mono text-[10.5px] font-semibold text-[#172019] dark:text-[#e8e9e3]">{fieldLogMeta.range}</dd>
              </div>
            </dl>
            <div className="log-foot font-mono bg-[#f7f8f4] dark:bg-[#1c2220] border border-[#e6ebe4] dark:border-[#2a352f] rounded-md p-[10px_12px] text-[8px] leading-[1.7] mt-2 font-semibold tracking-[0.04em] text-[#172019] dark:text-[#c8d5d0]">
              STARTED {fieldLogMeta.started}
              <br />
              ROUTE / {fieldLogMeta.route}
              <div className="mt-2 flex gap-1.5">
                <Badge variant="secondary" className="bg-[#e6f0e9] dark:bg-[#1e2623] text-[#318b5d] dark:text-[#5ac18a] border text-[7px] px-1.5 py-0">
                  LIVE
                </Badge>
                <Badge variant="outline" className="font-mono text-[7px] dark:text-[#9aa6a1] dark:border-[#2a352f]">
                  SHIPMENT
                </Badge>
              </div>
            </div>
            {toast && (
              <div className="mt-3 rounded-md bg-[#172019] dark:bg-[#0e1210] text-white text-[9px] font-mono px-3 py-2 flex items-center gap-2 border dark:border-[#2a352f]">
                <CheckCircle2 size={12} className="text-[#7ec8a1]" /> {toast}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <div className="border-t border-[#cbd2c6] dark:border-[#2a352f] pt-6 pb-2 flex items-center justify-between gap-3">
        <div className="font-mono text-[8px] text-[#667068] dark:text-[#7a8a84]">Need to edit? The shipment workspace is the dedicated place — not the display.</div>
        <Button variant="outline" onClick={() => navigate("/shipment/manage")} className="font-sans text-[13px] font-medium tracking-[-0.01em] h-10 px-6 gap-2 rounded-full border-[1.5px] bg-white dark:bg-[#1c2220] shadow-sm shrink-0">
          <Settings2 size={14} /> Open workspace
        </Button>
      </div>

      <div className="pt-6 flex justify-center">
        <Button variant="outline" className="font-sans text-[13px] font-medium tracking-[-0.01em] h-10 px-6 gap-2 rounded-full border-[1.5px] border-[#267e79] dark:border-[#3aa79f] text-[#1d5d59] dark:text-[#7ec8c1] bg-white dark:bg-[#1c2220] hover:bg-[#e6f0e9] dark:hover:bg-[#1e2623] shadow-sm" onClick={() => navigate("/monitor")}>
          Go to monitor <ArrowRight size={14} strokeWidth={2} />
        </Button>
      </div>
    </div>
  );
}
