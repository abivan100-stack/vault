import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ClipboardCheck,
  ClipboardList,
  Copy,
  Download,
  FileText,
  Fingerprint,
  Search,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { useColdChain } from "@/context/ColdChainContext";
import { useReportExport } from "@/hooks/useReportExport";
import { useCapability } from "@/hooks/useCapability";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import StatusPill from "@/components/StatusPill";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  GENESIS_HASH,
  RESOLUTION_REASONS,
  coveredExcursionSequences,
  describeVerification,
  findByDigest,
  isDigestQuery,
  readingCelsius,
  shortEventLabel,
  type LedgerEntry,
  type LedgerEventType,
  type ResolutionReason,
} from "@/lib/ledger";
import { SAFE_MAX_C, SAFE_MIN_C, isExcursion } from "@/lib/chart";
import { shortHash } from "@/lib/hash";
import { formatClock, formatDayLabel, formatIsoDate } from "@/lib/simulation";
import { downloadCsv, toCsv } from "@/lib/csv";

/**
 * The Ledger, as a chain rather than a table.
 *
 * The table this replaced had three problems that were really one problem: it
 * rendered a chain as a spreadsheet. Every row shouted `TEMPERATURE READING`
 * beside a detail column reading `4.4 °C` — the same fact twice — and because
 * that detail was six characters wide in a column sized for prose, most of
 * each row was a gap between the temperature and the timestamp.
 *
 * So the readings stopped being rows of text. A reading is now a marker on a
 * miniature of the corridor it was measured against, laid along a spine that
 * is the chain itself. A run of readings reads as a temperature trace; the
 * events that actually happened — an excursion, a handoff, an investigation
 * resolving — punctuate it as labelled links. Nothing is repeated, nothing is
 * padded, and scanning the trail now tells you the shape of the shipment
 * rather than only its contents.
 */

type FilterKey = "all" | "readings" | "excursions" | "investigations" | "shipment";

const FILTERS: { key: FilterKey; label: string; events: readonly LedgerEventType[] | null }[] = [
  { key: "all", label: "All", events: null },
  { key: "readings", label: "Readings", events: ["TEMPERATURE_READING"] },
  { key: "excursions", label: "Excursions", events: ["EXCURSION_OPEN", "EXCURSION_CLEAR"] },
  {
    key: "investigations",
    label: "Investigations",
    events: ["INVESTIGATION_OPEN", "INVESTIGATION_RESOLVED"],
  },
  {
    key: "shipment",
    label: "Shipment",
    events: ["SHIPMENT_CREATE", "SHIPMENT_UPDATE", "HANDOFF_INIT"],
  },
];

const VISIBLE_ROWS = 14;

const SELECT_CLASS =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-raised px-2.5 text-[13.5px] text-ink transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-transparent";

const TEXTAREA_CLASS =
  "w-full min-w-0 rounded-lg border border-input bg-raised px-2.5 py-1.5 text-[13.5px] text-ink transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-transparent";

function eventTone(event: LedgerEventType): "success" | "warning" | "brand" | "neutral" {
  if (event === "EXCURSION_OPEN" || event === "INVESTIGATION_OPEN") return "warning";
  if (event === "INVESTIGATION_RESOLVED" || event === "EXCURSION_CLEAR") return "success";
  if (event === "HANDOFF_INIT" || event === "SHIPMENT_CREATE") return "brand";
  return "neutral";
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
      className="inline-flex h-7 shrink-0 items-center gap-2 rounded-md border border-line bg-sunken px-2 transition-colors hover:border-line-strong dark:bg-transparent dark:hover:border-line"
      aria-label={isCopied ? "Hash copied" : `Copy full hash ${hash}`}
    >
      <span className="tabular font-mono text-[11.5px] text-ink-muted">{shortHash(hash)}</span>
      {isCopied ? (
        <Check size={12} className="text-success" aria-hidden="true" />
      ) : (
        <Copy size={12} className="text-ink-subtle" aria-hidden="true" />
      )}
    </button>
  );
}

/**
 * The trail, as a table.
 *
 * An earlier revision drew each reading as a marker on a miniature of the safe
 * corridor, hung off a vertical spine. It was the widest element on the row and
 * carried a single fact -- one the value column already stated in text -- while
 * the fields that make an entry auditable were squeezed into the margins. The
 * design assumed a mixed trail that the simulated cadence does not produce: a
 * ledger append every ten seconds is almost entirely readings, so the events
 * that were meant to punctuate the trace are rare enough that the page read as
 * a chart of one flat line.
 *
 * So: columns, with a header naming them. `Prev` sits beside `Digest` because
 * the link each entry commits to is the point of the structure, and drawing a
 * decorative line down the page asserted it without ever showing it.
 */

const COLUMNS: { key: string; label: string; className: string }[] = [
  { key: "sequence", label: "#", className: "w-[56px]" },
  { key: "time", label: "Time", className: "w-[84px]" },
  { key: "event", label: "Event", className: "w-[124px]" },
  { key: "detail", label: "Detail", className: "" },
  { key: "prev", label: "Prev", className: "w-[136px]" },
  { key: "digest", label: "Digest", className: "w-[156px]" },
];

function LedgerRow({
  entry,
  copiedHash,
  onCopy,
  highlighted,
}: {
  entry: LedgerEntry;
  copiedHash: string | null;
  onCopy: (hash: string) => void;
  highlighted: boolean;
}) {
  const value = readingCelsius(entry);
  const outsideCorridor = value !== null && isExcursion(value);

  return (
    <tr className={highlighted ? "bg-brand-soft" : "transition-colors hover:bg-sunken"}>
      <td className="tabular px-3 py-1.5 font-mono text-[11.5px] text-ink-subtle">
        {String(entry.sequence).padStart(3, "0")}
      </td>

      <td className="px-3 py-1.5">
        <time dateTime={entry.at} className="tabular font-mono text-[11.5px] text-ink-subtle">
          {formatClock(entry.at)}
        </time>
      </td>

      <td className="whitespace-nowrap px-3 py-1.5">
        {entry.event === "TEMPERATURE_READING" ? (
          <span className="text-[12.5px] text-ink-muted">{shortEventLabel(entry.event)}</span>
        ) : (
          <StatusPill tone={eventTone(entry.event)} size="sm">
            {shortEventLabel(entry.event)}
          </StatusPill>
        )}
      </td>

      {/* A reading's detail is its value, so it is set as a value: right-aligned
          in the column's own width, warning-toned when it left the corridor.
          Every other event carries prose, which is left as prose. */}
      <td className="min-w-0 px-3 py-1.5">
        {value !== null ? (
          <span
            className={`tabular font-mono text-[12.5px] ${
              outsideCorridor ? "text-warning" : "text-ink"
            }`}
          >
            {value.toFixed(1)} &deg;C
          </span>
        ) : (
          <span className="block truncate text-[13px] text-ink" title={entry.detail}>
            {entry.detail}
          </span>
        )}
      </td>

      <td className="whitespace-nowrap px-3 py-1.5">
        <span
          className="tabular font-mono text-[11.5px] text-ink-subtle"
          title={entry.prevHash === GENESIS_HASH ? "Genesis -- no previous entry" : entry.prevHash}
        >
          {entry.prevHash === GENESIS_HASH ? "genesis" : shortHash(entry.prevHash)}
        </span>
      </td>

      <td className="whitespace-nowrap px-3 py-1.5">
        <HashButton hash={entry.hash} copiedHash={copiedHash} onCopy={onCopy} />
      </td>
    </tr>
  );
}

/**
 * The trail itself. Newest first, so it runs backwards in time down the page,
 * broken by a heading whenever the day changes.
 *
 * The day headings are what let the Time column drop the date -- it was
 * repeating the same eight characters on every row of a console that mostly
 * shows one shipment on one day.
 */
function LedgerTable({
  entries,
  copiedHash,
  onCopy,
  highlightHash,
  emptyMessage,
}: {
  entries: readonly LedgerEntry[];
  copiedHash: string | null;
  onCopy: (hash: string) => void;
  highlightHash?: string | null;
  emptyMessage: string;
}) {
  if (entries.length === 0) {
    return <p className="px-5 py-12 text-center text-[13px] text-ink-muted">{emptyMessage}</p>;
  }

  // One flat body with the day headings interleaved as their own rows, rather
  // than a tbody per day -- a table cannot nest and the zebra would restart.
  const rows: JSX.Element[] = [];
  let previousDay: string | null = null;

  for (const entry of entries) {
    const day = formatIsoDate(entry.at);
    if (day !== previousDay) {
      previousDay = day;
      rows.push(
        <tr key={`day-${day}`}>
          <th
            scope="colgroup"
            colSpan={COLUMNS.length}
            className="border-y border-line bg-sunken px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-subtle"
          >
            {formatDayLabel(entry.at)}
          </th>
        </tr>,
      );
    }
    rows.push(
      <LedgerRow
        key={entry.hash}
        entry={entry}
        copiedHash={copiedHash}
        onCopy={onCopy}
        highlighted={highlightHash === entry.hash}
      />,
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] border-collapse text-left">
        <thead>
          {/* Sticky because the full trail opens in a scrolling dialog, where a
              header that scrolls away leaves six unlabelled columns. */}
          <tr className="sticky top-0 z-10 bg-raised">
            {COLUMNS.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`border-b border-line px-3 pb-2 pt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-subtle ${column.className}`}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{rows}</tbody>
      </table>
    </div>
  );
}

export default function LedgerPage() {
  const { ledger, chainVerification, discardedEntryCount, investigation, resolveInvestigation } =
    useColdChain();
  const exportReport = useReportExport();
  const resolving = useCapability("resolveInvestigation");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [fullOpen, setFullOpen] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolveReason, setResolveReason] = useState<ResolutionReason | "">("");
  const [resolveNote, setResolveNote] = useState("");
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
        shortEventLabel(entry.event).toLowerCase().includes(term) ||
        entry.detail.toLowerCase().includes(term) ||
        entry.hash.toLowerCase().includes(term) ||
        formatClock(entry.at).includes(term) ||
        formatIsoDate(entry.at).includes(term)
      );
    });
  }, [newestFirst, filter, query]);

  // A pasted digest is a lookup, not a text search: it gets an answer of its
  // own above the list, because "no rows matched" is the wrong way to report
  // that a digest is not in the chain.
  const digestQuery = isDigestQuery(query);
  const digestMatch = useMemo(
    () => (digestQuery ? findByDigest(ledger, query) : null),
    [digestQuery, ledger, query],
  );

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

  const handleExportCsv = () => {
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

  const rows = filtered.slice(0, VISIBLE_ROWS);
  const isTrustworthy = chainVerification.intact && discardedEntryCount === 0;

  const coveredExcursions = investigation.openEntry
    ? coveredExcursionSequences(ledger, investigation.openEntry.sequence - 1)
    : [];

  const openResolveDialog = () => {
    setResolveReason("");
    setResolveNote("");
    setResolveOpen(true);
  };

  const handleResolve = () => {
    if (!resolveReason || !resolveNote.trim()) return;
    resolveInvestigation(resolveReason, resolveNote);
    setResolveOpen(false);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[21px] font-semibold tracking-[-0.02em] text-ink">Ledger</h1>
          <p className="mt-1 max-w-[54ch] text-[13.5px] text-ink-muted">
            Append-only. Each entry commits to its own contents and to the previous entry's digest,
            so any edit breaks verification from that point on.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" onClick={handleExportCsv} className="h-9 gap-2 text-sm">
            <Download size={15} aria-hidden="true" />
            CSV
          </Button>
          <Button variant="outline" onClick={exportReport} className="h-9 gap-2 text-sm">
            <FileText size={15} aria-hidden="true" />
            Report PDF
          </Button>
        </div>
      </header>

      {/* Chain verification and Investigation status, side by side. One is a
          cryptographic fact and the other a workflow fact: they are shown
          together because they are read together, and kept visually distinct
          because a chain can be Intact and Under Investigation at once. */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div
          className={`flex items-start gap-3 rounded-lg border p-3.5 shadow-e1 ${
            isTrustworthy ? "border-line bg-raised" : "border-warning-line bg-warning-soft dark:border-warning/40"
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

        <div
          className={`flex items-start gap-3 rounded-lg border p-3.5 shadow-e1 ${
            investigation.status === "CLEARED"
              ? "border-line bg-raised"
              : "border-warning-line bg-warning-soft dark:border-warning/40"
          }`}
        >
          {investigation.status === "CLEARED" ? (
            <ClipboardCheck size={17} className="mt-px shrink-0 text-success" aria-hidden="true" />
          ) : (
            <ClipboardList size={17} className="mt-px shrink-0 text-warning" aria-hidden="true" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-medium text-ink">
              {investigation.status === "CLEARED" ? "Cleared" : "Under investigation"}
            </p>
            <p className="mt-0.5 text-[13px] text-ink-muted">
              {investigation.status === "CLEARED"
                ? "No open investigation."
                : `Opened ${formatClock(investigation.openEntry!.at)} on ${formatIsoDate(investigation.openEntry!.at)} — ${
                    coveredExcursions.length
                  } ${coveredExcursions.length === 1 ? "excursion" : "excursions"} absorbed so far.`}
            </p>
          </div>
          {investigation.status === "UNDER_INVESTIGATION" && (
            <Button
              onClick={openResolveDialog}
              disabled={!resolving.allowed}
              title={resolving.reason ?? undefined}
              className="h-8 shrink-0 text-[13px]"
            >
              Resolve
            </Button>
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
            placeholder="Search the trail, or paste a digest"
            aria-label="Search the ledger, or paste a digest to look it up"
            className="h-9 pl-8 text-[13.5px]"
          />
        </div>

        <div className="max-w-full overflow-x-auto rounded-lg border border-line bg-sunken p-0.5">
          <div className="flex h-8 w-max items-center gap-0.5">
            {FILTERS.map((entry) => (
              <button
                key={entry.key}
                type="button"
                onClick={() => setFilter(entry.key)}
                aria-pressed={filter === entry.key}
                className={`h-8 shrink-0 whitespace-nowrap rounded-md px-3 text-[13px] font-medium transition-colors ${
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
      </div>

      {digestQuery && (
        <div
          className={`flex items-start gap-3 rounded-lg border p-3.5 ${
            digestMatch ? "border-brand-line bg-brand-soft" : "border-line bg-sunken"
          }`}
        >
          <Fingerprint
            size={17}
            className={`mt-px shrink-0 ${digestMatch ? "text-brand-ink" : "text-ink-subtle"}`}
            aria-hidden="true"
          />
          <div className="min-w-0">
            {digestMatch ? (
              <>
                <p className="text-[13.5px] font-medium text-ink">
                  Digest found — entry #{digestMatch.sequence}, {shortEventLabel(digestMatch.event)}
                </p>
                <p className="mt-0.5 text-[13px] text-ink-muted">
                  {digestMatch.detail} · recorded {formatIsoDate(digestMatch.at)} at{" "}
                  {formatClock(digestMatch.at)}. It is highlighted in the trail below.
                </p>
              </>
            ) : (
              <>
                <p className="text-[13.5px] font-medium text-ink">
                  No retained entry carries this digest
                </p>
                {/* Two very different situations produce this result and the
                    chain cannot tell them apart, so neither does this copy. */}
                <p className="mt-0.5 text-[13px] text-ink-muted">
                  Either it was never written here, or it belonged to an entry that has since slid
                  out of the retained window. This browser holds {ledger.length} entries and cannot
                  distinguish the two.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      <Card className="overflow-hidden">
        <LedgerTable
          entries={rows}
          copiedHash={copiedHash}
          onCopy={handleCopy}
          highlightHash={digestMatch?.hash ?? null}
          emptyMessage={query.trim() ? `Nothing in the trail matches “${query.trim()}”.` : "No entries yet."}
        />
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-ink-subtle">
        <span>
          Showing {rows.length} of {filtered.length} matching · {ledger.length} retained ·{" "}
          <span className="text-ink-muted">
            each entry's Prev is the previous entry's digest; safe corridor {SAFE_MIN_C}–{SAFE_MAX_C} °C
          </span>
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
        <DialogContent className="max-h-[86vh] max-w-[760px] gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-line p-5">
            <DialogTitle className="text-[15px] font-semibold tracking-[-0.01em]">
              Full trail — {filtered.length} {filtered.length === 1 ? "entry" : "entries"}
            </DialogTitle>
            <DialogDescription className="text-[13px] text-ink-muted">
              Matching the current search and filter. Click a digest to copy it in full.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[58vh] overflow-auto">
            <LedgerTable
              entries={filtered}
              copiedHash={copiedHash}
              onCopy={handleCopy}
              highlightHash={digestMatch?.hash ?? null}
              emptyMessage="Nothing matches the current search and filter."
            />
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
              <Button onClick={handleExportCsv} className="h-9 gap-2 text-sm">
                <Download size={15} aria-hidden="true" />
                Export CSV
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={resolveOpen} onOpenChange={setResolveOpen}>
        <DialogContent className="max-w-[440px] gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-line p-5">
            <DialogTitle className="text-[15px] font-semibold tracking-[-0.01em]">
              Resolve investigation
            </DialogTitle>
            <DialogDescription className="text-[13px] text-ink-muted">
              {coveredExcursions.length > 0
                ? `Covers excursion${coveredExcursions.length > 1 ? "s" : ""} ${coveredExcursions
                    .map((sequence) => `#${sequence}`)
                    .join(", ")}. This is appended to the ledger and cannot be edited afterward.`
                : "This is appended to the ledger and cannot be edited afterward."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 p-5">
            <div className="space-y-1.5">
              <Label htmlFor="resolve-reason">Reason</Label>
              <select
                id="resolve-reason"
                value={resolveReason}
                onChange={(event) => setResolveReason(event.target.value as ResolutionReason)}
                className={SELECT_CLASS}
              >
                <option value="" disabled>
                  Select a reason…
                </option>
                {RESOLUTION_REASONS.map((reason) => (
                  <option key={reason.value} value={reason.value}>
                    {reason.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="resolve-note">Note</Label>
              <textarea
                id="resolve-note"
                value={resolveNote}
                onChange={(event) => setResolveNote(event.target.value)}
                placeholder="What did you find, and what was done about it?"
                rows={4}
                className={TEXTAREA_CLASS}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-line p-4">
            <Button variant="outline" onClick={() => setResolveOpen(false)} className="h-9 text-sm">
              Cancel
            </Button>
            <Button
              onClick={handleResolve}
              disabled={!resolveReason || !resolveNote.trim()}
              className="h-9 text-sm"
            >
              Resolve
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
