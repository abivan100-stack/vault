import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Copy, FileText, Pencil, Plus, RotateCcw, Truck } from "lucide-react";
import { useColdChain } from "@/context/ColdChainContext";
import { useReportExport } from "@/hooks/useReportExport";
import { useCapability } from "@/hooks/useCapability";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import ConfirmDialog from "@/components/ConfirmDialog";
import Stat from "@/components/Stat";
import StatusPill from "@/components/StatusPill";
import { useToast } from "@/hooks/useToast";
import { validateFieldLog, type FieldLogMeta } from "@/lib/shipment";
import { formatClock, formatIsoDate } from "@/lib/simulation";

const EDITABLE_FIELDS: { key: keyof FieldLogMeta; label: string; hint?: string }[] = [
  { key: "box", label: "Box" },
  { key: "product", label: "Product" },
  { key: "batch", label: "Batch" },
  { key: "doses", label: "Doses", hint: "Must contain a number" },
  { key: "range", label: "Corridor" },
  { key: "route", label: "Route", hint: "Origin → destination" },
];

export default function ShipmentManagePage() {
  const { fieldLogMeta, updateFieldLog, resetFieldLog, createNewShipment, recordHandoff } =
    useColdChain();
  const navigate = useNavigate();
  const { toast, showToast } = useToast();
  const exportReport = useReportExport();
  // Every mutation on this page is an append to the organisation's ledger,
  // so one check covers them all. With no organisation, this is always
  // allowed — see useCapability.
  const editing = useCapability("editShipment");

  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState<FieldLogMeta>(fieldLogMeta);
  const [confirm, setConfirm] = useState<"reset" | "new" | "handoff" | null>(null);

  // Seed the draft at the moment the dialog opens. Syncing it from an effect on
  // every record change would wipe whatever the user is mid-way through typing.
  const openEditor = () => {
    setDraft(fieldLogMeta);
    setEditOpen(true);
  };

  const isHandedOff = fieldLogMeta.handedOffAt !== null;

  const handleSave = () => {
    // Re-checked here, not only on the button. A dialog can be open while the
    // active organisation or the role in it changes, and the control that
    // opened it is no longer the thing deciding.
    if (!editing.allowed) {
      showToast(editing.reason ?? "You cannot change this shipment.", "error");
      return;
    }
    if (isHandedOff) {
      // A closed shipment's record is what its report describes. Editing it
      // afterwards would pair the new box, product or route with a ledger
      // that ended before the change.
      showToast("This shipment has been handed off and its record is closed.", "error");
      return;
    }
    const validation = validateFieldLog(draft);
    if (!validation.ok) {
      showToast(validation.message, "error");
      return;
    }
    updateFieldLog(draft);
    setEditOpen(false);
    showToast("Shipment updated and recorded on the ledger");
  };

  const handleExportReport = () => {
    exportReport();
    showToast("Report generated from the current ledger");
  };

  const handleCopy = async () => {
    const summary = `${fieldLogMeta.box} · ${fieldLogMeta.batch} · ${fieldLogMeta.route}`;
    try {
      await navigator.clipboard.writeText(summary);
      showToast("Copied box, batch and route");
    } catch {
      showToast("Copy failed — clipboard unavailable", "error");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          onClick={() => navigate("/shipment")}
          className="h-8 gap-1.5 px-2.5 text-[13.5px]"
        >
          <ArrowLeft size={15} aria-hidden="true" />
          Shipment
        </Button>
        <span className="text-ink-subtle" aria-hidden="true">
          /
        </span>
        <span className="text-[13.5px] font-medium text-ink">Manage</span>
      </div>

      <header>
        <h1 className="text-[21px] font-semibold tracking-[-0.02em] text-ink">Manage shipment</h1>
        <p className="mt-1 max-w-[58ch] text-[13.5px] text-ink-muted">
          The only place shipment state changes. Every action here is written to the ledger and
          saved locally.
        </p>
      </header>

      <Card render={<section />}>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="tabular truncate font-mono text-[13px] font-medium text-ink">
              {fieldLogMeta.box} · {fieldLogMeta.batch}
            </p>
            <p className="mt-1 truncate text-[13px] text-ink-muted">
              {fieldLogMeta.product} · {fieldLogMeta.doses} · {fieldLogMeta.route}
            </p>
          </div>
          <StatusPill size="lg" tone={isHandedOff ? "success" : "neutral"}>
            {isHandedOff ? "Handed off" : "In transit"}
          </StatusPill>
        </CardHeader>

        {editing.reason && (
          <CardContent className="border-b border-line py-3">
            <p className="text-[13px] text-ink-muted">{editing.reason}</p>
          </CardContent>
        )}

        <CardContent className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <Button
            onClick={openEditor}
            disabled={isHandedOff || !editing.allowed}
            title={
              isHandedOff
                ? "This shipment has been handed off and its record is closed."
                : (editing.reason ?? undefined)
            }
            className="h-9 gap-2 text-sm"
          >
            <Pencil size={15} aria-hidden="true" />
            Edit details
          </Button>
          <Button variant="outline" onClick={handleCopy} className="h-9 gap-2 text-sm">
            <Copy size={15} aria-hidden="true" />
            Copy summary
          </Button>
          <Button
            variant="outline"
            onClick={() => setConfirm("handoff")}
            disabled={isHandedOff || !editing.allowed}
            title={editing.reason ?? undefined}
            className="h-9 gap-2 text-sm"
          >
            <Truck size={15} aria-hidden="true" />
            {isHandedOff ? "Handed off" : "Record handoff"}
          </Button>
          <Button
            variant="outline"
            onClick={() => setConfirm("reset")}
            disabled={!editing.allowed}
            title={editing.reason ?? undefined}
            className="h-9 gap-2 text-sm"
          >
            <RotateCcw size={15} aria-hidden="true" />
            Reset fields
          </Button>
        </CardContent>

        <CardFooter>
          <Button
            variant="secondary"
            onClick={() => setConfirm("new")}
            disabled={!editing.allowed}
            title={editing.reason ?? undefined}
            className="h-9 w-full gap-2 text-sm"
          >
            <Plus size={15} aria-hidden="true" />
            Start a new shipment
          </Button>
          <p className="mt-3 text-[12.5px] leading-relaxed text-ink-subtle">
            A new shipment issues a fresh box and batch and restarts the chart. The ledger is
            append-only — it carries on, with the new shipment recorded as an entry.
          </p>
        </CardFooter>

        {toast && (
          <CardFooter className="px-5 py-3">
            <p
              className={`flex items-center gap-2 text-[13px] ${
                toast.tone === "error" ? "text-warning" : "text-ink-muted"
              }`}
            >
              <Check size={14} aria-hidden="true" />
              {toast.message}
            </p>
          </CardFooter>
        )}
      </Card>

      {/* The closing report is the artefact a shipment exists to produce, so
          it gets its own block rather than a fifth button in the grid above.
          It stays available mid-transit — the ledger is append-only and a
          report taken early is simply a report of a shipment still running,
          which the document says on its face. */}
      <Card render={<section />} className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <span
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
              isHandedOff ? "bg-brand-soft text-brand-ink" : "bg-sunken text-ink-subtle"
            }`}
          >
            <FileText size={17} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <CardTitle>Closing report</CardTitle>
            <p className="mt-1 max-w-[62ch] text-[13px] leading-relaxed text-ink-muted">
              {isHandedOff
                ? `Handed off ${formatIsoDate(fieldLogMeta.handedOffAt!)} at ${formatClock(
                    fieldLogMeta.handedOffAt!,
                  )}. The report carries the shipment record, the corridor summary, every investigation, and this shipment's entries with their digests -- which is the ledger from its start unless earlier entries have aged out.`
                : "Still in transit. A report exported now covers everything on the ledger so far, and says on its face that the shipment had not closed."}
            </p>
          </div>
          <Button
            variant={isHandedOff ? "default" : "outline"}
            onClick={handleExportReport}
            className="h-9 shrink-0 gap-2 text-sm"
          >
            <FileText size={15} aria-hidden="true" />
            Export PDF
          </Button>
        </div>
      </Card>

      <Card render={<section />} surface="sunken" className="p-5">
        <CardTitle>Record</CardTitle>
        <dl className="mt-3 grid gap-4 sm:grid-cols-3">
          <Stat
            label="Log id"
            value={fieldLogMeta.logId}
            mono
            weight="normal"
            truncate
            title={fieldLogMeta.logId}
          />
          <Stat
            label="Started"
            value={`${formatIsoDate(fieldLogMeta.startedAt)} ${formatClock(fieldLogMeta.startedAt)}`}
            mono
            weight="normal"
          />
          <Stat
            label="Handoff"
            value={
              fieldLogMeta.handedOffAt
                ? `${formatIsoDate(fieldLogMeta.handedOffAt)} ${formatClock(fieldLogMeta.handedOffAt)}`
                : "—"
            }
            mono
            weight="normal"
          />
        </dl>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold tracking-[-0.01em]">
              Edit shipment
            </DialogTitle>
            <DialogDescription className="text-[13.5px] text-ink-muted">
              Saved locally and appended to the ledger as a shipment update.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3.5 py-1">
            {EDITABLE_FIELDS.map((field) => (
              <div key={field.key} className="grid gap-1.5">
                <Label htmlFor={`field-${field.key}`} className="text-[12.5px] text-ink-muted">
                  {field.label}
                </Label>
                <Input
                  id={`field-${field.key}`}
                  value={String(draft[field.key] ?? "")}
                  onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })}
                  className="h-9 text-[13.5px]"
                />
                {field.hint && <p className="text-[11.5px] text-ink-subtle">{field.hint}</p>}
              </div>
            ))}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditOpen(false)} className="h-9 text-sm">
              Cancel
            </Button>
            <Button onClick={handleSave} className="h-9 text-sm">
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirm === "reset"}
        onOpenChange={(open) => setConfirm(open ? "reset" : null)}
        title="Reset shipment fields?"
        description="Product, batch, doses, corridor and route return to their defaults for this box. The log id, start time and any recorded handoff are kept. The current values are not recoverable."
        confirmLabel="Reset fields"
        destructive
        onConfirm={() => {
          if (!editing.allowed) {
            showToast(editing.reason ?? "You cannot change this shipment.", "error");
            return;
          }
          resetFieldLog();
          showToast("Shipment reset to defaults");
        }}
      />

      <ConfirmDialog
        open={confirm === "new"}
        onOpenChange={(open) => setConfirm(open ? "new" : null)}
        title="Start a new shipment?"
        description="A new box and batch are issued and the chart window restarts. The current shipment record is replaced and cannot be restored."
        confirmLabel="Start new shipment"
        destructive
        onConfirm={() => {
          if (!editing.allowed) {
            showToast(editing.reason ?? "You cannot open a shipment.", "error");
            return;
          }
          createNewShipment();
          showToast("New shipment opened");
        }}
      />

      <ConfirmDialog
        open={confirm === "handoff"}
        onOpenChange={(open) => setConfirm(open ? "handoff" : null)}
        title="Record handoff?"
        description={`This writes a permanent handoff entry for ${fieldLogMeta.route} to the ledger. It cannot be undone.`}
        confirmLabel="Record handoff"
        onConfirm={() => {
          if (!editing.allowed) {
            showToast(editing.reason ?? "You cannot record a handoff.", "error");
            return;
          }
          recordHandoff();
          showToast("Handoff recorded — the closing report is ready to export");
        }}
      />
    </div>
  );
}
