import { useEffect, useState } from "react";
import anime from "animejs";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, ShieldAlert, Thermometer, Signal, Pencil, Copy, RotateCcw, Plus, Truck, CheckCircle2, ArrowRight, Settings2 } from "lucide-react";
import { useColdChain } from "../context/ColdChainContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
        {/* Clean field log — display only, no edit/copy bar */}
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
                  <span className="text-[#9aa6a1] dark:text-[#7a8a84] text-[7px] font-mono">ID</span>
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
                {handoffDone && (
                  <Badge className="bg-[#1d5d59] text-white text-[7px] gap-1">
                    <CheckCircle2 size={10} /> HANDED OFF
                  </Badge>
                )}
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
          <Button variant="outline" className="mt-6 font-mono text-[9px] gap-1.5 border-[#267e79] text-[#1d5d59] dark:border-[#3aa79f] dark:text-[#7ec8c1]" onClick={() => navigate("/monitor")}>
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

      {/* Dedicated shipment management — not on landing field-log */}
      <section className="shipment-actions border-t border-[#cbd2c6] dark:border-[#2a352f] pt-8 pb-12">
        <div className="flex items-end justify-between gap-4 mb-5">
          <div>
            <div className="eyebrow">03 / SHIPMENT CONTROLS</div>
            <h2 className="mt-2 text-[22px] font-semibold tracking-[-0.04em]">Manage this shipment.</h2>
            <p className="mt-1.5 font-mono text-[9px] text-[#5a6a62] dark:text-[#9aa6a1]">Editing here does not clutter the landing display — it’s a dedicated workspace.</p>
          </div>
          <Badge variant="outline" className="hidden sm:inline-flex font-mono text-[7px] gap-1.5">
            <Settings2 size={10} /> WORKSPACE
          </Badge>
        </div>

        <Card className="overflow-hidden border-[#cbd2c6] dark:border-[#2a352f] bg-white dark:bg-[#171c19] shadow-[0_8px_24px_rgba(23,32,25,0.06)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.24)]">
          <CardHeader className="pb-3">
            <CardTitle className="font-mono text-[10px] tracking-[0.12em] flex items-center gap-2">
              <Settings2 size={14} className="text-[#267e79]" /> SHIPMENT WORKSPACE
            </CardTitle>
            <CardDescription className="font-mono text-[9px]">Edit, duplicate, handoff or reset — changes persist to localStorage and update the landing display.</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Button size="sm" onClick={() => setEditOpen(true)} className="bg-[#267e79] hover:bg-[#1d5d59] text-white font-mono text-[8px] h-9 gap-1.5">
                <Pencil size={12} /> EDIT
              </Button>
              <Button size="sm" variant="outline" onClick={handleCopy} className="font-mono text-[8px] h-9 gap-1.5">
                <Copy size={12} /> COPY
              </Button>
              <Button size="sm" variant="outline" onClick={handleHandoff} className="font-mono text-[8px] h-9 gap-1.5">
                <Truck size={12} /> HANDOFF
              </Button>
              <Button size="sm" variant="ghost" onClick={resetFieldLog} className="font-mono text-[8px] h-9 gap-1">
                <RotateCcw size={12} /> RESET
              </Button>
            </div>
            <Button size="sm" variant="secondary" onClick={createNewShipment} className="w-full mt-3 font-mono text-[8px] h-9 gap-1.5 bg-[#172019] dark:bg-[#0e1210] text-white hover:bg-black dark:hover:bg-black border dark:border-[#2a352f]">
              <Plus size={12} /> NEW SHIPMENT
            </Button>
            <div className="mt-3 flex flex-wrap gap-1.5 font-mono text-[7px] text-[#667068] dark:text-[#7a8a84]">
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-[#318b5d]" /> {fieldLogMeta.box}
              </span>
              <span>•</span>
              <span>{fieldLogMeta.batch}</span>
              <span>•</span>
              <span>{fieldLogMeta.route}</span>
            </div>
          </CardContent>
        </Card>
      </section>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[420px] bg-white dark:bg-[#171c19]">
          <DialogHeader>
            <DialogTitle className="font-mono text-[12px] tracking-[0.08em]">EDIT SHIPMENT</DialogTitle>
            <DialogDescription className="font-mono text-[9px]">Update live shipment — persisted to localStorage, reflected on landing.</DialogDescription>
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
