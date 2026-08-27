import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Download, Search, ShieldAlert, ShieldCheck } from "lucide-react";
import { useColdChain } from "@/context/ColdChainContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  describeVerification,
  formatEventLabel,
  type LedgerEntry,
  type LedgerEventType,
} from "@/lib/ledger";
import { shortHash } from "@/lib/hash";
import { formatClock, formatIsoDate } from "@/lib/simulation";
import { downloadCsv, toCsv } from "@/lib/csv";

type FilterKey = "all" | "readings" | "excursions" | "shipment";

const FILTERS: { key: FilterKey; label: string; events: readonly LedgerEventType[] | null }[] = [
  { key: "all", label: "All", events: null },
  { key: "readings", label: "Readings", events: ["TEMPERATURE_READING"] },
  { key: "excursions", label: "Excursions", events: ["EXCURSION_OPEN", "EXCURSION_CLEAR"] },
  {
    key: "shipment",
    label: "Shipment",
    events: ["SHIPMENT_CREATE", "SHIPMENT_UPDATE", "HANDOFF_INIT"],
  },
];

function eventTone(event: LedgerEventType): string {
  if (event === "EXCURSION_OPEN") return "bg-warning-soft text-warning";
  if (event === "HANDOFF_INIT" || event === "SHIPMENT_CREATE") return "bg-brand-soft text-brand-ink";
  return "bg-sunken text-ink-muted";
}

function HashButton({
  hash,
  copiedHash,
  onCopy,
}: {
  hash: string;
  copiedHash: string | null;
  onCopy: (hash: string) => void;
}) {
  const isCopied = copiedHash === hash;
  return (
    <button
      type="button"
      onClick={() => onCopy(hash)}
      title={hash}
      className="inline-flex h-7 items-center gap-2 rounded-md border border-line px-2 transition-colors hover:bg-sunken"
      aria-label={isCopied ? "Hash copied" : `Copy full hash ${hash}`}
    >
      <span className="tabular font-mono text-[12px] text-ink-muted">{shortHash(hash)}</span>
      {isCopied ? (
        <Check size={13} className="text-success" aria-hidden="true" />
      ) : (
        <Copy size={13} className="text-ink-subtle" aria-hidden="true" />
      )}
    </button>
  );
}

export default function LedgerPage() {
  const { ledger, chainVerification, discardedEntryCount } = useColdChain();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [fullOpen, setFullOpen] = useState(false);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    },
    [],
  );

  const newestFirst = useMemo(() => [...ledger].reverse(), [ledger]);

  const filtered = useMemo(() => {
    const active = FILTERS.find((entry) => entry.key === filter);
    const term = query.trim().toLowerCase();
    return newestFirst.filter((entry) => {
      if (active?.events && !active.events.includes(entry.event)) return false;
      if (!term) return true;
      return (
        String(entry.sequence).includes(term) ||
        entry.event.toLowerCase().includes(term) ||
        entry.detail.toLowerCase().includes(term) ||
        entry.hash.toLowerCase().includes(term) ||
        formatClock(entry.at).includes(term) ||
        formatIsoDate(entry.at).includes(term)
      );
    });
  }, [newestFirst, filter, query]);

  const handleCopy = async (hash: string) => {
    try {
      await navigator.clipboard.writeText(hash);
      setCopiedHash(hash);
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopiedHash(null), 1400);
    } catch {
      // Clipboard blocked — the full hash is still available via the title.
    }
  };

  const handleExport = () => {
    const csv = toCsv(
      ["sequence", "event", "detail", "timestamp", "prev_hash", "hash"],
      ledger.map((entry) => [
        String(entry.sequence),
        entry.event,
        entry.detail,
        entry.at,
        entry.prevHash,
        entry.hash,
      ]),
    );
    const stamp = ledger.length > 0 ? formatIsoDate(ledger[ledger.length - 1].at) : "empty";
    downloadCsv(`vault-ledger-${stamp}.csv`, csv);
  };

  const rows: LedgerEntry[] = filtered.slice(0, 12);
  const isTrustworthy = chainVerification.intact && discardedEntryCount === 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[21px] font-semibold tracking-[-0.02em] text-ink">Ledger</h1>
          <p className="mt-1 max-w-[52ch] text-[13.5px] text-ink-muted">
            Append-only trail. Each entry commits to its own contents and to the previous entry's
            digest, so any edit breaks verification from that point on.
          </p>
        </div>
        <Button variant="outline" onClick={handleExport} className="h-9 shrink-0 gap-2 text-sm">
          <Download size={15} aria-hidden="true" />
          Export CSV
        </Button>
      </header>

      {/* Chain verification — recomputed from the stored entries, not asserted.
          Entries that were unreadable on load count against integrity too: a
          shortened chain that verifies is still evidence something rewrote it. */}
      <div
        className={`flex items-start gap-3 rounded-lg border p-3.5 ${
          isTrustworthy ? "border-line bg-raised" : "border-warning/40 bg-warning-soft"
        }`}
      >
        {isTrustworthy ? (
          <ShieldCheck size={17} className="mt-px shrink-0 text-success" aria-hidden="true" />
        ) : (
          <ShieldAlert size={17} className="mt-px shrink-0 text-warning" aria-hidden="true" />
        )}
        <div>
          <p className="text-[13.5px] font-medium text-ink">
            {chainVerification.intact
              ? isTrustworthy
                ? `Chain verified — ${ledger.length} ${ledger.length === 1 ? "entry" : "entries"}`
                : "Chain incomplete"
              : `Chain broken at entry #${chainVerification.brokenAt}`}
          </p>
          <p className="mt-0.5 text-[13px] text-ink-muted">
            {describeVerification(chainVerification)}
          </p>
          {discardedEntryCount > 0 && (
            <p className="mt-1 text-[13px] text-warning">
              {discardedEntryCount} stored{" "}
              {discardedEntryCount === 1 ? "entry was" : "entries were"} unreadable and had to be
              dropped on load.
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search
            size={15}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-subtle"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search sequence, event, detail or hash"
            aria-label="Search the ledger"
            className="h-9 pl-8 text-[13.5px]"
          />
        </div>

        <div className="flex h-9 items-center gap-0.5 rounded-lg border border-line bg-sunken p-0.5">
          {FILTERS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => setFilter(entry.key)}
              aria-pressed={filter === entry.key}
              className={`h-8 rounded-md px-3 text-[13px] font-medium transition-colors ${
                filter === entry.key
                  ? "bg-raised text-ink ring-1 ring-line"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-raised">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-sunken">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[72px] text-[12px] font-semibold text-ink-muted">Seq</TableHead>
                <TableHead className="w-[190px] text-[12px] font-semibold text-ink-muted">Event</TableHead>
                <TableHead className="text-[12px] font-semibold text-ink-muted">Detail</TableHead>
                <TableHead className="w-[150px] text-[12px] font-semibold text-ink-muted">Recorded</TableHead>
                <TableHead className="w-[150px] text-right text-[12px] font-semibold text-ink-muted">
                  Hash
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-[13px] text-ink-muted">
                    {query.trim() ? `No entries match “${query.trim()}”.` : "No entries yet."}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((entry) => (
                  <TableRow key={entry.hash} className="border-line">
                    <TableCell className="tabular py-3 font-mono text-[12.5px] font-medium text-ink-subtle">
                      {String(entry.sequence).padStart(3, "0")}
                    </TableCell>
                    <TableCell className="py-3">
                      <span
                        className={`inline-flex h-6 items-center rounded-md px-2 text-[11.5px] font-medium ${eventTone(entry.event)}`}
                      >
                        {formatEventLabel(entry.event)}
                      </span>
                    </TableCell>
                    <TableCell className="py-3 text-[13.5px] text-ink">{entry.detail}</TableCell>
                    <TableCell className="tabular py-3 font-mono text-[12.5px] text-ink-muted">
                      {formatIsoDate(entry.at)} {formatClock(entry.at)}
                    </TableCell>
                    <TableCell className="py-3 text-right">
                      <HashButton hash={entry.hash} copiedHash={copiedHash} onCopy={handleCopy} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-ink-subtle">
        <span>
          Showing {rows.length} of {filtered.length} matching · {ledger.length} retained
        </span>
        <button
          type="button"
          onClick={() => setFullOpen(true)}
          className="font-medium text-brand-ink transition-colors hover:text-brand"
        >
          Open full trail
        </button>
      </div>

      <Dialog open={fullOpen} onOpenChange={setFullOpen}>
        <DialogContent className="max-h-[86vh] max-w-[820px] gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-line p-5">
            <DialogTitle className="text-[15px] font-semibold tracking-[-0.01em]">
              Full trail — {filtered.length} {filtered.length === 1 ? "entry" : "entries"}
            </DialogTitle>
            <DialogDescription className="text-[13px] text-ink-muted">
              Matching the current search and filter. Click a hash to copy it in full.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[58vh] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-sunken">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[64px] text-[12px] text-ink-muted">Seq</TableHead>
                  <TableHead className="w-[170px] text-[12px] text-ink-muted">Event</TableHead>
                  <TableHead className="text-[12px] text-ink-muted">Detail</TableHead>
                  <TableHead className="w-[140px] text-[12px] text-ink-muted">Recorded</TableHead>
                  <TableHead className="w-[140px] text-right text-[12px] text-ink-muted">Hash</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((entry) => (
                  <TableRow key={entry.hash} className="border-line">
                    <TableCell className="tabular py-2.5 font-mono text-[12.5px] text-ink-subtle">
                      {String(entry.sequence).padStart(3, "0")}
                    </TableCell>
                    <TableCell className="py-2.5 text-[13px] text-ink">
                      {formatEventLabel(entry.event)}
                    </TableCell>
                    <TableCell className="py-2.5 text-[13px] text-ink-muted">{entry.detail}</TableCell>
                    <TableCell className="tabular py-2.5 font-mono text-[12px] text-ink-muted">
                      {formatIsoDate(entry.at)} {formatClock(entry.at)}
                    </TableCell>
                    <TableCell className="py-2.5 text-right">
                      <HashButton hash={entry.hash} copiedHash={copiedHash} onCopy={handleCopy} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-line p-4">
            <span className="text-[12.5px] text-ink-subtle">
              {isTrustworthy
                ? "Chain verified"
                : chainVerification.intact
                  ? "Chain incomplete"
                  : `Broken at #${chainVerification.brokenAt}`}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setFullOpen(false)} className="h-9 text-sm">
                Close
              </Button>
              <Button onClick={handleExport} className="h-9 gap-2 text-sm">
                <Download size={15} aria-hidden="true" />
                Export CSV
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
