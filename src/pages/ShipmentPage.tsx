import { useEffect, useState } from "react";
import anime from "animejs";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, ShieldAlert, Thermometer, Signal, Pencil, Copy, RotateCcw, Plus, Truck, CheckCircle2, ArrowRight } from "lucide-react";
import { useColdChain } from "../context/ColdChainContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export default function ShipmentPage() {
  const { fieldLogMeta, status, updateFieldLog, resetFieldLog, createNewShipment } = useColdChain();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState(fieldLogMeta);
  const [toast, setToast] = useState<string | null>(null);
  const [handoffDone, setHandoffDone] = useState(false);

  useEffect(() => setDraft(fieldLogMeta), [fieldLogMeta]);

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

  const handleSave = () => {
    if (!draft.box.trim() || !draft.product.trim() || !draft.batch.trim()) {
      setToast("Box, Product and Batch are required");
      return;
    }
    const dosesMatch = draft.doses.match(/(\d+)/);
    if (!dosesMatch) {
      setToast("Doses must contain a number");
      return;
    }
    updateFieldLog(draft);
    setEditOpen(false);
    setToast("Shipment updated");
    anime({ targets: ".field-log", scale: [0.99, 1], duration: 320, easing: "easeOutQuad" });
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`${fieldLogMeta.box} • ${fieldLogMeta.batch}`);
      setToast("Copied Box & Batch");
    } catch {
      setToast("Copy failed");
    }
  };

  const handleHandoff = () => {
    setHandoffDone(true);
    setToast("Handoff recorded — DELHI → JAIPUR confirmed");
    window.setTimeout(() => setHandoffDone(false), 2500);
  };

  return (
    <div className="space-y-0">
      <section className="intro-grid" id="shipment">
        <Card className="field-log gap-0 !p-0 overflow-hidden bg-white border-[#cbd2c6] rounded-[10px] shadow-[0_8px_24px_rgba(23,32,25,0.08)]">
          <CardContent className="p-0">
            <div className="p-[22px_20px_14px]">
              <div className="flex items-start justify-between gap-2">
                <div className="eyebrow text-[#172019] font-bold tracking-[0.11em] text-[9.5px]">{fieldLogMeta.logId}</div>
                <Badge variant="outline" className={status === "SAFE" ? "bg-[#e6f0e9] text-[#318b5d] border-[#cbd2c6] text-[7px] h-5" : "bg-[#f9e8c9] text-[#8a5510] border-[#d19a4a] text-[7px] h-5"}>
                  {status === "SAFE" ? <ShieldCheck size={10} /> : <ShieldAlert size={10} />} {status}
                </Badge>
              </div>
              <div className="log-rule border-t-[1.5px] border-[#e0e6dd] mt-[14px] mb-[2px]" />
              <dl className="m-0">
                <div className="py-[12px] border-b border-[#e6ebe4] flex flex-col gap-1">
                  <dt className="font-mono text-[8px] font-bold text-[#267e79] tracking-[0.14em] uppercase">BOX</dt>
                  <dd className="font-mono text-[10.5px] font-semibold text-[#172019] flex items-center justify-between gap-2">
                    {fieldLogMeta.box}
                    <button onClick={handleCopy} className="p-1 rounded hover:bg-[#f7f8f4] transition-colors" aria-label="Copy box">
                      <Copy size={12} className="text-[#667068]" />
                    </button>
                  </dd>
                </div>
                <div className="py-[12px] border-b border-[#e6ebe4] flex flex-col gap-1">
                  <dt className="font-mono text-[8px] font-bold text-[#267e79] tracking-[0.14em] uppercase">PRODUCT</dt>
                  <dd className="font-mono text-[10.5px] font-semibold text-[#172019]">{fieldLogMeta.product}</dd>
                </div>
                <div className="py-[12px] border-b border-[#e6ebe4] flex flex-col gap-1">
                  <dt className="font-mono text-[8px] font-bold text-[#267e79] tracking-[0.14em] uppercase">BATCH</dt>
                  <dd className="font-mono text-[10.5px] font-semibold text-[#172019]">{fieldLogMeta.batch}</dd>
                </div>
                <div className="py-[12px] border-b border-[#e6ebe4] flex flex-col gap-1">
                  <dt className="font-mono text-[8px] font-bold text-[#267e79] tracking-[0.14em] uppercase">DOSES</dt>
                  <dd className="font-mono text-[10.5px] font-semibold text-[#172019]">{fieldLogMeta.doses}</dd>
                </div>
                <div className="py-[12px] flex flex-col gap-1">
                  <dt className="font-mono text-[8px] font-bold text-[#267e79] tracking-[0.14em] uppercase">RANGE</dt>
                  <dd className="font-mono text-[10.5px] font-semibold text-[#172019]">{fieldLogMeta.range}</dd>
                </div>
              </dl>
              <div className="log-foot font-mono bg-[#f7f8f4] border border-[#e6ebe4] rounded-md p-[10px_12px] text-[8px] leading-[1.7] mt-2 font-semibold tracking-[0.04em] text-[#172019]">
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
                  {handoffDone && (
                    <Badge className="bg-[#1d5d59] text-white text-[7px] gap-1">
                      <CheckCircle2 size={10} /> HANDED OFF
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <Separator />

            <div className="p-3 flex flex-wrap gap-2 bg-[#fcfdfb]">
              <Button size="sm" onClick={() => setEditOpen(true)} className="bg-[#267e79] hover:bg-[#1d5d59] text-white font-mono text-[8px] h-7 gap-1.5 flex-1 min-w-[92px]">
                <Pencil size={12} /> EDIT
              </Button>
              <Button size="sm" variant="outline" onClick={handleCopy} className="font-mono text-[8px] h-7 gap-1.5">
                <Copy size={12} /> COPY
              </Button>
              <Button size="sm" variant="outline" onClick={handleHandoff} className="font-mono text-[8px] h-7 gap-1.5">
                <Truck size={12} /> HANDOFF
              </Button>
              <Button size="sm" variant="ghost" onClick={resetFieldLog} className="font-mono text-[8px] h-7 gap-1">
                <RotateCcw size={12} /> RESET
              </Button>
            </div>

            <div className="px-3 pb-3">
              <Button size="sm" variant="secondary" onClick={createNewShipment} className="w-full font-mono text-[8px] h-7 gap-1.5 bg-[#172019] text-white hover:bg-black">
                <Plus size={12} /> NEW SHIPMENT
              </Button>
            </div>

            {toast && (
              <div className="mx-3 mb-3 rounded-md bg-[#172019] text-white text-[9px] font-mono px-3 py-2 flex items-center gap-2">
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
          <Button variant="outline" className="mt-6 font-mono text-[9px] gap-1.5 border-[#267e79] text-[#1d5d59]" onClick={() => navigate("/monitor")}>
            GO TO MONITOR <ArrowRight size={12} />
          </Button>
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

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[420px] bg-white">
          <DialogHeader>
            <DialogTitle className="font-mono text-[12px] tracking-[0.08em]">EDIT SHIPMENT</DialogTitle>
            <DialogDescription className="font-mono text-[9px]">Update live shipment — persisted to localStorage, reflected instantly.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-1">
            <div className="grid gap-1.5">
              <Label htmlFor="box" className="font-mono text-[8px] tracking-[0.12em]">
                BOX
              </Label>
              <Input id="box" value={draft.box} onChange={(e) => setDraft({ ...draft, box: e.target.value })} className="h-8 font-mono text-[11px]" placeholder="VCC-BOX-001" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="product" className="font-mono text-[8px] tracking-[0.12em]">
                PRODUCT
              </Label>
              <Input id="product" value={draft.product} onChange={(e) => setDraft({ ...draft, product: e.target.value })} className="h-8 font-mono text-[11px]" placeholder="IPV Polio Vaccine" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="batch" className="font-mono text-[8px] tracking-[0.12em]">
                  BATCH
                </Label>
                <Input id="batch" value={draft.batch} onChange={(e) => setDraft({ ...draft, batch: e.target.value })} className="h-8 font-mono text-[11px]" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="doses" className="font-mono text-[8px] tracking-[0.12em]">
                  DOSES
                </Label>
                <Input id="doses" value={draft.doses} onChange={(e) => setDraft({ ...draft, doses: e.target.value })} className="h-8 font-mono text-[11px]" placeholder="250 units" />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="range" className="font-mono text-[8px] tracking-[0.12em]">
                RANGE
              </Label>
              <Input id="range" value={draft.range} onChange={(e) => setDraft({ ...draft, range: e.target.value })} className="h-8 font-mono text-[11px]" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="route" className="font-mono text-[8px] tracking-[0.12em]">
                ROUTE
              </Label>
              <Input id="route" value={draft.route} onChange={(e) => setDraft({ ...draft, route: e.target.value })} className="h-8 font-mono text-[11px]" placeholder="DELHI → JAIPUR" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditOpen(false)} className="font-mono text-[9px]">
              CANCEL
            </Button>
            <Button onClick={handleSave} className="bg-[#267e79] hover:bg-[#1d5d59] text-white font-mono text-[9px]">
              SAVE CHANGES
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
