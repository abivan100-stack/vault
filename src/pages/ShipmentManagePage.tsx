import { useState, useEffect } from "react";
import { Pencil, Copy, RotateCcw, Plus, Truck, CheckCircle2, Settings2, ArrowLeft } from "lucide-react";
import { useColdChain } from "../context/ColdChainContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate } from "react-router-dom";

export default function ShipmentManagePage() {
  const { fieldLogMeta, updateFieldLog, resetFieldLog, createNewShipment } = useColdChain();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState(fieldLogMeta);
  const [toast, setToast] = useState<string | null>(null);
  const [handoffDone, setHandoffDone] = useState(false);

  useEffect(() => setDraft(fieldLogMeta), [fieldLogMeta]);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2400);
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
    setToast("Shipment updated — landing display refreshed");
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`${fieldLogMeta.box} • ${fieldLogMeta.batch} • ${fieldLogMeta.route}`);
      setToast("Copied Box, Batch & Route");
    } catch {
      setToast("Copied to memory — " + fieldLogMeta.box);
    }
  };

  const handleHandoff = () => {
    setHandoffDone(true);
    setToast("Handoff recorded — DELHI → JAIPUR confirmed");
    window.setTimeout(() => setHandoffDone(false), 2800);
  };

  return (
    <div className="space-y-6 pt-2">
      <div className="flex items-center gap-3">
        <Button variant="ghost" onClick={() => navigate("/shipment")} className="font-sans text-[15px] font-medium tracking-[-0.01em] gap-1.5 h-9 px-4 rounded-full">
          <ArrowLeft size={16} /> Back to shipment
        </Button>
        <div className="eyebrow">SHIPMENT / MANAGE</div>
      </div>

      <Card className="overflow-hidden border-[#cbd2c6] dark:border-[#2a352f] bg-white dark:bg-[#171c19] shadow-[0_8px_24px_rgba(23,32,25,0.06)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.24)]">
        <CardHeader className="pb-3">
          <CardTitle className="font-mono text-[13px] tracking-[0.12em] flex items-center gap-2">
            <Settings2 size={16} className="text-[#267e79]" /> SHIPMENT WORKSPACE — DEDICATED
          </CardTitle>
          <CardDescription className="font-mono text-[12px]">This is the only place to mutate shipment. Landing page stays as clean display. Changes persist to localStorage.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-[#e6ebe4] dark:border-[#2a352f] bg-[#f7f8f4] dark:bg-[#1c2220] p-3 flex items-center justify-between gap-3">
            <div className="font-mono text-[12px]">
              <div className="font-bold tracking-[0.08em]">{fieldLogMeta.box} • {fieldLogMeta.batch}</div>
              <div className="text-[#5a6a62] dark:text-[#9aa6a1]">{fieldLogMeta.product} • {fieldLogMeta.doses} • {fieldLogMeta.route}</div>
            </div>
            <Badge variant={handoffDone ? "default" : "outline"} className={handoffDone ? "bg-[#1d5d59] text-white gap-1" : "gap-1"}>
              {handoffDone ? <CheckCircle2 size={13} /> : null} {handoffDone ? "HANDED OFF" : "READY"}
            </Badge>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <Button onClick={() => setEditOpen(true)} className="bg-[#267e79] hover:bg-[#1d5d59] text-white font-sans text-[15px] font-medium tracking-[-0.01em] h-10 px-5 gap-2 rounded-full shadow-sm">
              <Pencil size={16} /> Edit
            </Button>
            <Button variant="outline" onClick={handleCopy} className="font-sans text-[15px] font-medium tracking-[-0.01em] h-10 px-5 gap-2 rounded-full border-[1.5px] bg-white dark:bg-[#1c2220] shadow-sm">
              <Copy size={16} /> Copy
            </Button>
            <Button variant="outline" onClick={handleHandoff} className="font-sans text-[15px] font-medium tracking-[-0.01em] h-10 px-5 gap-2 rounded-full border-[1.5px] bg-white dark:bg-[#1c2220] shadow-sm">
              <Truck size={16} /> Handoff
            </Button>
            <Button variant="ghost" onClick={resetFieldLog} className="font-sans text-[15px] font-medium tracking-[-0.01em] h-10 px-5 gap-2 rounded-full">
              <RotateCcw size={16} /> Reset
            </Button>
          </div>
          <Button variant="secondary" onClick={createNewShipment} className="w-full font-sans text-[15px] font-medium tracking-[-0.01em] h-10 gap-2 rounded-full bg-[#172019] dark:bg-[#e8e9e3] dark:text-[#0e1210] hover:bg-black dark:hover:bg-[#c8d5d0] shadow-sm border dark:border-[#2a352f]">
            <Plus size={16} /> New shipment
          </Button>

          {toast && (
            <div className="rounded-md bg-[#172019] dark:bg-[#0e1210] text-white text-[12px] font-mono px-3 py-2.5 flex items-center gap-2 border dark:border-[#2a352f] animate-in fade-in">
              <CheckCircle2 size={15} className="text-[#7ec8a1] shrink-0" /> {toast}
            </div>
          )}

          <div className="font-mono text-[10px] text-[#667068] dark:text-[#7a8a84] border-t border-[#e6ebe4] dark:border-[#2a352f] pt-3">
            All actions update the landing FIELD LOG instantly. Try EDIT → change BATCH → SAVE and return to landing.
          </div>
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[420px] bg-white dark:bg-[#171c19]">
          <DialogHeader>
            <DialogTitle className="font-mono text-[14px] tracking-[0.08em]">EDIT SHIPMENT</DialogTitle>
            <DialogDescription className="font-mono text-[12px]">Update live shipment — persisted to localStorage, reflected on landing.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-1">
            <div className="grid gap-1.5">
              <Label htmlFor="box-m" className="font-mono text-[11px] tracking-[0.12em]">BOX</Label>
              <Input id="box-m" value={draft.box} onChange={(e) => setDraft({ ...draft, box: e.target.value })} className="h-8 font-mono text-[13px]" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="product-m" className="font-mono text-[11px] tracking-[0.12em]">PRODUCT</Label>
              <Input id="product-m" value={draft.product} onChange={(e) => setDraft({ ...draft, product: e.target.value })} className="h-8 font-mono text-[13px]" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="batch-m" className="font-mono text-[11px] tracking-[0.12em]">BATCH</Label>
                <Input id="batch-m" value={draft.batch} onChange={(e) => setDraft({ ...draft, batch: e.target.value })} className="h-8 font-mono text-[13px]" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="doses-m" className="font-mono text-[11px] tracking-[0.12em]">DOSES</Label>
                <Input id="doses-m" value={draft.doses} onChange={(e) => setDraft({ ...draft, doses: e.target.value })} className="h-8 font-mono text-[13px]" />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="range-m" className="font-mono text-[11px] tracking-[0.12em]">RANGE</Label>
              <Input id="range-m" value={draft.range} onChange={(e) => setDraft({ ...draft, range: e.target.value })} className="h-8 font-mono text-[13px]" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="route-m" className="font-mono text-[11px] tracking-[0.12em]">ROUTE</Label>
              <Input id="route-m" value={draft.route} onChange={(e) => setDraft({ ...draft, route: e.target.value })} className="h-8 font-mono text-[13px]" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditOpen(false)} className="font-sans text-[15px] font-medium rounded-full px-5">Cancel</Button>
            <Button onClick={handleSave} className="bg-[#267e79] hover:bg-[#1d5d59] text-white font-sans text-[15px] font-medium rounded-full px-6">Save changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
