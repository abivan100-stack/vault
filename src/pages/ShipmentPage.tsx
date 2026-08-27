import { Check, Copy, MapPin, Settings2, Thermometer, Truck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useColdChain } from "@/context/ColdChainContext";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/useToast";
import { boxSerial, parseDoses, parseRoute } from "@/lib/shipment";
import { formatClock, formatIsoDate } from "@/lib/simulation";
import { SAFE_MAX_C, SAFE_MIN_C } from "@/lib/chart";

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] text-ink-subtle">{label}</dt>
      <dd
        className={`mt-1 truncate text-[13.5px] font-medium text-ink ${mono ? "tabular font-mono text-[13px]" : ""}`}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

export default function ShipmentPage() {
  const { fieldLogMeta, status, temperature } = useColdChain();
  const navigate = useNavigate();
  const { toast, showToast } = useToast();

  // Every displayed value is derived from the record — nothing is hardcoded,
  // so editing the route or dose count is reflected here immediately.
  const route = parseRoute(fieldLogMeta.route);
  const doses = parseDoses(fieldLogMeta.doses);
  const isHandedOff = fieldLogMeta.handedOffAt !== null;
  const isSafe = status === "SAFE";

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
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[21px] font-semibold tracking-[-0.02em] text-ink">Shipment</h1>
          <p className="mt-1 text-[13.5px] text-ink-muted">
            One box, one batch, one corridor. Edits live in the manage workspace.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-[12.5px] font-medium ${
              isSafe ? "bg-success-soft text-success" : "bg-warning-soft text-warning"
            }`}
          >
            {status}
            <span className="tabular font-mono">{temperature.toFixed(1)} °C</span>
          </span>
          <Button onClick={() => navigate("/shipment/manage")} className="h-9 gap-2 text-sm">
            <Settings2 size={15} aria-hidden="true" />
            Manage
          </Button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <section className="rounded-xl border border-line bg-raised">
          <div className="flex items-start justify-between gap-3 border-b border-line p-5">
            <div className="min-w-0">
              <h2 className="eyebrow">Field log</h2>
              <p className="tabular mt-1.5 truncate font-mono text-[13px] font-medium text-ink">
                {fieldLogMeta.logId}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={handleCopy}
              className="h-8 shrink-0 gap-1.5 px-2.5 text-[13px]"
              aria-label="Copy box, batch and route"
            >
              <Copy size={14} aria-hidden="true" />
              Copy
            </Button>
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-5 p-5 sm:grid-cols-3">
            <Field label="Box" value={fieldLogMeta.box} mono />
            <Field label="Batch" value={fieldLogMeta.batch} mono />
            <Field label="Serial" value={boxSerial(fieldLogMeta.box)} mono />
            <Field label="Product" value={fieldLogMeta.product} />
            <Field
              label="Doses"
              value={doses === null ? fieldLogMeta.doses : `${doses.toLocaleString()} units`}
            />
            <Field label="Corridor" value={fieldLogMeta.range} mono />
          </dl>

          {toast && (
            <div className="border-t border-line px-5 py-3">
              <p
                className={`flex items-center gap-2 text-[13px] ${
                  toast.tone === "error" ? "text-warning" : "text-ink-muted"
                }`}
              >
                <Check size={14} aria-hidden="true" />
                {toast.message}
              </p>
            </div>
          )}
        </section>

        <div className="space-y-4">
          <section className="rounded-xl border border-line bg-raised p-5">
            <h2 className="eyebrow flex items-center gap-1.5">
              <MapPin size={13} aria-hidden="true" />
              Route
            </h2>

            <div className="mt-4 flex items-center gap-3">
              <div className="min-w-0 text-left">
                <p className="truncate text-[13.5px] font-medium text-ink" title={route.origin}>
                  {route.origin}
                </p>
                <p className="mt-0.5 text-[11.5px] text-ink-subtle">Origin</p>
              </div>

              <div className="flex flex-1 items-center gap-2" aria-hidden="true">
                <span className="h-px flex-1 bg-line-strong" />
                <Truck size={15} className="shrink-0 text-ink-subtle" />
                <span className="h-px flex-1 bg-line-strong" />
              </div>

              <div className="min-w-0 text-right">
                <p className="truncate text-[13.5px] font-medium text-ink" title={route.destination}>
                  {route.destination}
                </p>
                <p className="mt-0.5 text-[11.5px] text-ink-subtle">Destination</p>
              </div>
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4">
              <Field
                label="Started"
                value={`${formatIsoDate(fieldLogMeta.startedAt)} ${formatClock(fieldLogMeta.startedAt)}`}
                mono
              />
              <Field
                label="Handoff"
                value={
                  fieldLogMeta.handedOffAt
                    ? `${formatIsoDate(fieldLogMeta.handedOffAt)} ${formatClock(fieldLogMeta.handedOffAt)}`
                    : "In transit"
                }
                mono
              />
            </dl>

            {isHandedOff && (
              <p className="mt-4 rounded-lg bg-success-soft px-3 py-2 text-[13px] text-success">
                Handoff recorded on the ledger.
              </p>
            )}

            <Button
              variant="outline"
              onClick={() => navigate("/monitor")}
              className="mt-4 h-9 w-full gap-2 text-sm"
            >
              <Thermometer size={15} aria-hidden="true" />
              View live temperature
            </Button>
          </section>

          <section className="rounded-xl border border-line bg-sunken p-5">
            <h2 className="eyebrow">Why the corridor matters</h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-ink-muted">
              {doses === null
                ? "This payload"
                : `${doses.toLocaleString()} ${doses === 1 ? "dose" : "doses"}`}{" "}
              of {fieldLogMeta.product} depend on staying between {SAFE_MIN_C} and {SAFE_MAX_C} °C
              for the whole run from {route.origin} to {route.destination}. Vault records the
              evidence so the handoff can be verified rather than trusted.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
