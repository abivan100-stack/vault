import { Check, Copy, MapPin, Settings2, Thermometer, Truck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useColdChain } from "@/context/ColdChainContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import Stat from "@/components/Stat";
import { useToast } from "@/hooks/useToast";
import { boxSerial, parseDoses, parseRoute } from "@/lib/shipment";
import { formatClock, formatIsoDate } from "@/lib/simulation";
import { SAFE_MAX_C, SAFE_MIN_C } from "@/lib/chart";

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

  // Named because each is shown and used as the truncation tooltip.
  const serial = boxSerial(fieldLogMeta.box);
  const dosesLabel = doses === null ? fieldLogMeta.doses : `${doses.toLocaleString()} units`;
  const startedLabel = `${formatIsoDate(fieldLogMeta.startedAt)} ${formatClock(fieldLogMeta.startedAt)}`;
  const handoffLabel = fieldLogMeta.handedOffAt
    ? `${formatIsoDate(fieldLogMeta.handedOffAt)} ${formatClock(fieldLogMeta.handedOffAt)}`
    : "In transit";

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
        <Card render={<section />}>
          <CardHeader className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle>Field log</CardTitle>
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
          </CardHeader>

          <CardContent
            render={<dl />}
            className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3"
          >
            <Stat
              label="Box"
              value={fieldLogMeta.box}
              mono
              truncate
              title={fieldLogMeta.box}
              className="min-w-0"
            />
            <Stat
              label="Batch"
              value={fieldLogMeta.batch}
              mono
              truncate
              title={fieldLogMeta.batch}
              className="min-w-0"
            />
            <Stat
              label="Serial"
              value={serial}
              mono
              truncate
              title={serial}
              className="min-w-0"
            />
            <Stat
              label="Product"
              value={fieldLogMeta.product}
              truncate
              title={fieldLogMeta.product}
              className="min-w-0"
            />
            <Stat
              label="Doses"
              value={dosesLabel}
              truncate
              title={dosesLabel}
              className="min-w-0"
            />
            <Stat
              label="Corridor"
              value={fieldLogMeta.range}
              mono
              truncate
              title={fieldLogMeta.range}
              className="min-w-0"
            />
          </CardContent>

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

        <div className="space-y-4">
          <Card render={<section />} className="p-5">
            <CardTitle className="flex items-center gap-1.5">
              <MapPin size={13} aria-hidden="true" />
              Route
            </CardTitle>

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
              <Stat
                label="Started"
                value={startedLabel}
                mono
                truncate
                title={startedLabel}
                className="min-w-0"
              />
              <Stat
                label="Handoff"
                value={handoffLabel}
                mono
                truncate
                title={handoffLabel}
                className="min-w-0"
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
          </Card>

          <Card render={<section />} surface="sunken" className="p-5">
            <CardTitle>Why the corridor matters</CardTitle>
            <p className="mt-2 text-[13.5px] leading-relaxed text-ink-muted">
              {doses === null
                ? "This payload"
                : `${doses.toLocaleString()} ${doses === 1 ? "dose" : "doses"}`}{" "}
              of {fieldLogMeta.product} depend on staying between {SAFE_MIN_C} and {SAFE_MAX_C} °C
              for the whole run from {route.origin} to {route.destination}. Vault records the
              evidence so the handoff can be verified rather than trusted.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
