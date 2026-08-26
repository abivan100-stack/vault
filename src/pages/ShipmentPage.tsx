import { useEffect, useState } from "react";
import anime from "animejs";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, ShieldAlert, Thermometer, Signal, Copy, CheckCircle2, ArrowRight, Settings2 } from "lucide-react";
import { useColdChain } from "../context/ColdChainContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function ShipmentPage() {
  const { fieldLogMeta, status } = useColdChain();
  const navigate = useNavigate();
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const tl = anime.timeline({ easing: "easeOutExpo", duration: 700 });
    tl.add({ targets: ".field-log", translateX: [-24, 0], opacity: [0, 1], duration: 600 })
      .add({ targets: ".intro-copy h1, .intro-copy .intro-lede, .intro-copy .intro-note", translateY: [16, 0], opacity: [0, 1], delay: anime.stagger(90), duration: 600 }, "-=400")
      .add({ targets: ".orbit-wrap", scale: [0.92, 1], opacity: [0, 1], duration: 700 }, "-=500");
    anime({ targets: ".orbit-ring.ring-two", rotate: "1turn", duration: 42000, loop: true, easing: "linear" });
    anime({ targets: ".orbit-ring.ring-one", scale: [1, 1.02, 1], duration: 3800, loop: true, direction: "alternate", easing: "easeInOutSine" });
    return () => { anime.remove(".field-log, .intro-copy h1, .intro-copy .intro-lede, .intro-copy .intro-note, .orbit-wrap, .orbit-ring"); };
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
      <section className="intro-grid" id="shipment">
        <Card className="field-log gap-0 !p-0 overflow-hidden bg-white dark:bg-[#171c19] border-[#cbd2c6] dark:border-[#2a352f] rounded-[10px] shadow-[0_8px_24px_rgba(23,32,25,0.08)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.32)]">
          <CardContent className="p-[22px_20px_20px]">
            <div className="flex items-start justify-between gap-2">
              <div className="eyebrow text-[#172019] font-bold tracking-[0.11em] text-[9.5px]">{fieldLogMeta.logId}</div>
              <Badge variant="outline" className={status === "SAFE" ? "bg-[#e6f0e9] text-[#318b5d] border-[#cbd2c6] text-[7px] h-5" : "bg-[#f9e8c9] text-[#8a5510] border-[#d19a4a] text-[7px] h-5"}>
                {status === "SAFE" ? <ShieldCheck size={10} /> : <ShieldAlert size={10} />} {status}
              </Badge>
            </div>
            <div className="log-rule border-t-[1.5px] border-[#e0e6dd] dark:border-[#2a352f] mt-[14px] mb-[2px]" />
            <dl className="m-0">
              <div className="py-[12px] border-b border-[#e6ebe4] dark:border-[#2a352f] flex flex-col gap-1">
                <dt className="font-mono text-[8px] font-bold text-[#267e79] tracking-[0.14em] uppercase">BOX</dt>
                <dd className="font-mono text-[10.5px] font-semibold text-[#172019] flex items-center justify-between gap-2">
                  {fieldLogMeta.box}
                  <button onClick={handleCopy} className="p-1 rounded hover:bg-[#f7f8f4] dark:hover:bg-[#24302c] transition-colors" aria-label="Copy box">
                    <Copy size={12} className="text-[#667068]" />
                  </button>
                </dd>
              </div>
              <div className="py-[12px] border-b border-[#e6ebe4] dark:border-[#2a352f] flex flex-col gap-1">
                <dt className="font-mono text-[8px] font-bold text-[#267e79] tracking-[0.14em] uppercase">PRODUCT</dt>
                <dd className="font-mono text-[10.5px] font-semibold text-[#172019]">{fieldLogMeta.product}</dd>
              </div>
              <div className="py-[12px] border-b border-[#e6ebe4] dark:border-[#2a352f] flex flex-col gap-1">
                <dt className="font-mono text-[8px] font-bold text-[#267e79] tracking-[0.14em] uppercase">BATCH</dt>
                <dd className="font-mono text-[10.5px] font-semibold text-[#172019]">{fieldLogMeta.batch}</dd>
              </div>
              <div className="py-[12px] border-b border-[#e6ebe4] dark:border-[#2a352f] flex flex-col gap-1">
                <dt className="font-mono text-[8px] font-bold text-[#267e79] tracking-[0.14em] uppercase">DOSES</dt>
                <dd className="font-mono text-[10.5px] font-semibold text-[#172019]">{fieldLogMeta.doses}</dd>
              </div>
              <div className="py-[12px] flex flex-col gap-1">
                <dt className="font-mono text-[8px] font-bold text-[#267e79] tracking-[0.14em] uppercase">RANGE</dt>
                <dd className="font-mono text-[10.5px] font-semibold text-[#172019]">{fieldLogMeta.range}</dd>
              </div>
            </dl>
            <div className="log-foot font-mono bg-[#f7f8f4] dark:bg-[#1c2220] border border-[#e6ebe4] dark:border-[#2a352f] rounded-md p-[10px_12px] text-[8px] leading-[1.7] mt-2 font-semibold tracking-[0.04em] text-[#172019] dark:text-[#c8d5d0]">
              STARTED {fieldLogMeta.started}
              <br />
              ROUTE / {fieldLogMeta.route}
              <div className="mt-2 flex gap-1.5">
                <Badge variant="secondary" className="bg-[#e6f0e9] text-[#318b5d] border text-[7px] px-1.5 py-0">
                  LIVE
                </Badge>
                <Badge variant="outline" className="font-mono text-[7px]">
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

        <div className="intro-copy">
          <div className="eyebrow teal">COLD-CHAIN INTEGRITY / LIVE SPECIMEN</div>
          <h1>
            Keep every
            <br />
            <span>dose</span> in range.
          </h1>
          <p className="intro-lede">A quiet record of temperature, time, and trust. Vault keeps the journey visible from loading bay to last-mile handoff.</p>
          <div className="intro-note">
            <span className="note-line" /> <span>One box. One unbroken chain.</span>
          </div>
          <div className="mt-6 flex gap-2">
            <Button variant="outline" className="font-mono text-[9px] gap-1.5 border-[#267e79] text-[#1d5d59] dark:border-[#3aa79f] dark:text-[#7ec8c1]" onClick={() => navigate("/monitor")}>
              GO TO MONITOR <ArrowRight size={12} />
            </Button>
            <Button onClick={() => navigate("/shipment/manage")} className="bg-[#267e79] hover:bg-[#1d5d59] text-white font-mono text-[9px] gap-1.5">
              <Settings2 size={12} /> MANAGE SHIPMENT
            </Button>
          </div>
        </div>

        <div className="orbit-wrap" aria-label="Live monitoring visual">
          <div className="orbit-ring ring-one" />
          <div className="orbit-ring ring-two" />
          <div className={`orbit-core ${status.toLowerCase()}`}>
            <span className="shield-glyph" aria-hidden="true">
              {status === "SAFE" ? <ShieldCheck size={16} strokeWidth={2.2} /> : <ShieldAlert size={16} strokeWidth={2.2} />}
            </span>
            <strong>{status}</strong>
            <span>{status === "SAFE" ? "2-8 deg C corridor" : "outside corridor"}</span>
          </div>
          <div className="orbit-label label-top mono inline-flex items-center gap-1">
            <Thermometer size={10} className="opacity-70" /> SENSOR / DHT22
          </div>
          <div className="orbit-label label-bottom mono inline-flex items-center gap-1">
            <Signal size={10} className="opacity-70" /> SIGNAL 98%
          </div>
        </div>
      </section>

      <div className="border-t border-[#cbd2c6] dark:border-[#2a352f] pt-6 pb-2 flex items-center justify-between gap-3">
        <div className="font-mono text-[8px] text-[#667068] dark:text-[#7a8a84]">Need to edit this shipment? Use the dedicated workspace — landing stays clean.</div>
        <Button size="sm" variant="outline" onClick={() => navigate("/shipment/manage")} className="font-mono text-[8px] gap-1.5 shrink-0">
          <Settings2 size={12} /> OPEN WORKSPACE
        </Button>
      </div>
    </div>
  );
}
