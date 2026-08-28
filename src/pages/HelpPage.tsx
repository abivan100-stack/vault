import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, Database, FileText, ShieldCheck } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import StatusPill from "@/components/StatusPill";
import { CHART_MAX_C, CHART_MIN_C, SAFE_MAX_C, SAFE_MIN_C } from "@/lib/chart";
import {
  LEDGER_EVENTS,
  MAX_LEDGER_ENTRIES,
  RESOLUTION_REASONS,
  describeVerification,
  type ChainVerification,
  type LedgerEventType,
} from "@/lib/ledger";
import { LEDGER_INTERVAL_MS, READING_WINDOW, SAMPLE_INTERVAL_MS } from "@/lib/simulation";
import { ORG_ROLES, roleDescription, roleLabel } from "@/lib/roles";

/**
 * The manual.
 *
 * This used to be a 540px dialog stacked on top of whatever page you were
 * reading, which meant the one place the product explains what its guarantees
 * actually are was the most cramped surface in the app. It is a page now: the
 * same width as everything else, addressable, linkable section by section,
 * and able to hold a diagram and a couple of reference tables without
 * scrolling inside a scroll.
 *
 * Every number and every event name on this page is derived from the module
 * that defines it. A manual that restates a constant is a manual that goes
 * quietly wrong the first time the constant moves.
 */

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "simulation", label: "The simulation" },
  { id: "ledger", label: "The ledger" },
  { id: "verification", label: "Verification" },
  { id: "investigations", label: "Investigations" },
  { id: "events", label: "Event glossary" },
  { id: "reports", label: "Reports" },
  { id: "accounts", label: "Accounts & sync" },
  { id: "storage", label: "What persists" },
  { id: "limits", label: "What this cannot prove" },
] as const;

const SAMPLE_SECONDS = SAMPLE_INTERVAL_MS / 1000;
const LEDGER_SECONDS = LEDGER_INTERVAL_MS / 1000;
const HEADROOM_C = Number((SAFE_MIN_C - CHART_MIN_C).toFixed(1));

/**
 * Short titles for each verification verdict. Written as an exhaustive record
 * rather than a list, so adding a reason to `ChainVerification` fails to
 * compile here instead of silently going undocumented.
 */
const VERIFICATION_TITLES: Record<ChainVerification["reason"], string> = {
  OK: "Intact",
  DIGEST_MISMATCH: "Entry edited",
  BROKEN_LINK: "Entry removed or replaced",
  OUT_OF_ORDER: "Entry inserted or removed",
  BAD_ROOT: "Chain replaced",
  BAD_SEQUENCE: "Chain rewritten",
};

/** What writes each event. Exhaustive for the same reason as above. */
const EVENT_SOURCES: Record<LedgerEventType, string> = {
  SHIPMENT_CREATE: "Starting a new shipment, and the first time the console runs.",
  SHIPMENT_UPDATE: "Saving an edit, or resetting fields, under Shipment → Manage.",
  TEMPERATURE_READING: `The simulation, every ${LEDGER_SECONDS} seconds.`,
  EXCURSION_OPEN: `A reading leaving the ${SAFE_MIN_C}–${SAFE_MAX_C} °C corridor.`,
  EXCURSION_CLEAR: "A reading returning to the corridor.",
  HANDOFF_INIT: "Recording a handoff under Shipment → Manage.",
  INVESTIGATION_OPEN: "An excursion opening while no investigation is already open.",
  INVESTIGATION_RESOLVED: "A person resolving an investigation with a reason and a note.",
};

const EVENT_MEANINGS: Record<LedgerEventType, string> = {
  SHIPMENT_CREATE: "A new shipment's record opens here. Investigations do not span this line.",
  SHIPMENT_UPDATE: "Carries the before and after of every field that changed.",
  TEMPERATURE_READING: "The corridor's periodic sample, in °C.",
  EXCURSION_OPEN: "The corridor broke. Carries the reading that broke it.",
  EXCURSION_CLEAR: "The corridor recovered. It does not close the investigation.",
  HANDOFF_INIT: "Custody passed. Permanent — there is no reversal entry.",
  INVESTIGATION_OPEN: "Human review is owed. The shipment stops reading as cleared.",
  INVESTIGATION_RESOLVED: "The reason, the note, and every excursion the investigation absorbed.",
};

function SectionHeading({ id, title, lead }: { id: string; title: string; lead: string }) {
  return (
    <div>
      <h2 id={`${id}-title`} className="text-[17px] font-semibold tracking-[-0.015em] text-ink">
        {title}
      </h2>
      <p className="mt-1.5 max-w-[68ch] text-[13.5px] leading-relaxed text-ink-muted">{lead}</p>
    </div>
  );
}

function Term({ children }: { children: string }) {
  return <span className="font-medium text-ink">{children}</span>;
}

function Key({ children }: { children: string }) {
  return (
    <kbd className="rounded border border-line bg-sunken px-1.5 py-0.5 font-mono text-[12px] text-ink-muted">
      {children}
    </kbd>
  );
}

/**
 * The hash chain, drawn.
 *
 * Three entries, each committing to its own contents and to the digest of the
 * one before it. The point the picture has to make is the diagonal: an
 * entry's digest becomes the next entry's `prev`, which is why editing entry
 * two invalidates everything after it too.
 */
function ChainDiagram() {
  const blocks = [0, 1, 2];
  const blockWidth = 168;
  const gap = 64;
  const chipWidth = 62;
  const chipY = 62;
  const chipHeight = 19;
  const wireY = chipY + chipHeight / 2;
  const width = blocks.length * blockWidth + (blocks.length - 1) * gap;

  return (
    <svg
      viewBox={`0 0 ${width} 118`}
      className="mx-auto h-auto w-full max-w-[700px]"
      role="img"
      aria-label="Three ledger entries in a chain. Each entry's digest is carried as the next entry's previous-hash field, so editing one entry breaks every entry after it."
    >
      {blocks.map((index) => {
        const x = index * (blockWidth + gap);
        const edited = index === 1;
        const digestX = x + blockWidth - chipWidth - 10;
        return (
          <g key={index}>
            <rect
              x={x}
              y={16}
              width={blockWidth}
              height={68}
              rx={9}
              className={edited ? "fill-raised stroke-warning-line" : "fill-raised stroke-line"}
              strokeWidth={1}
            />
            <text x={x + 12} y={36} className="fill-ink-subtle font-mono text-[9.5px]">
              #{index + 1}
            </text>
            <text x={x + 12} y={52} className="fill-ink text-[11.5px] font-medium">
              contents
            </text>

            {/* prev on the left edge, digest on the right: the wire between
                them is then literally the thing being carried forward. */}
            <rect
              x={x + 10}
              y={chipY}
              width={chipWidth}
              height={chipHeight}
              rx={4}
              className="fill-sunken stroke-line"
              strokeWidth={1}
            />
            <text x={x + 19} y={chipY + 13} className="fill-ink-muted font-mono text-[9px]">
              {index === 0 ? "prev 000…" : "prev"}
            </text>

            <rect
              x={digestX}
              y={chipY}
              width={chipWidth}
              height={chipHeight}
              rx={4}
              className={
                edited ? "fill-warning-soft stroke-warning-line" : "fill-sunken stroke-line"
              }
              strokeWidth={1}
            />
            <text
              x={digestX + 12}
              y={chipY + 13}
              className={`font-mono text-[9px] ${edited ? "fill-warning" : "fill-ink-muted"}`}
            >
              digest
            </text>

            {edited && (
              <text
                x={x + blockWidth / 2}
                y={104}
                textAnchor="middle"
                className="fill-warning text-[10px] font-medium"
              >
                edit here…
              </text>
            )}
            {index === 2 && (
              <text
                x={x + blockWidth / 2}
                y={104}
                textAnchor="middle"
                className="fill-warning text-[10px] font-medium"
              >
                …and this no longer matches
              </text>
            )}

            {index < blocks.length - 1 && (
              <>
                <line
                  x1={digestX + chipWidth}
                  y1={wireY}
                  x2={x + blockWidth + gap + 8}
                  y2={wireY}
                  className={index === 1 ? "stroke-warning" : "stroke-line-strong"}
                  strokeWidth={1.25}
                />
                <path
                  d={`M${x + blockWidth + gap + 3} ${wireY - 3.5} L${x + blockWidth + gap + 9} ${wireY} L${x + blockWidth + gap + 3} ${wireY + 3.5} Z`}
                  className={index === 1 ? "fill-warning" : "fill-line-strong"}
                />
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export default function HelpPage() {
  const [active, setActive] = useState<string>(SECTIONS[0].id);
  const contentRef = useRef<HTMLDivElement>(null);

  // Highlights the section currently under the header. Observing the sections
  // themselves, rather than tracking scroll offsets, keeps this correct when a
  // section's height changes (the tables below are the tallest thing here and
  // reflow on narrow viewports).
  useEffect(() => {
    const root = contentRef.current;
    if (!root) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      // Top inset clears the sticky header; the deep bottom inset means only
      // the upper band of the viewport can claim to be the active section.
      { rootMargin: "-80px 0px -65% 0px", threshold: 0 },
    );

    for (const section of root.querySelectorAll("section[id]")) observer.observe(section);
    return () => observer.disconnect();
  }, []);

  const verificationRows = useMemo(
    () =>
      (Object.keys(VERIFICATION_TITLES) as ChainVerification["reason"][]).map((reason) => ({
        reason,
        title: VERIFICATION_TITLES[reason],
        // The prose comes from the module that decides it, so this table can
        // never disagree with what the Ledger page shows.
        description: describeVerification({
          intact: reason === "OK",
          brokenAt: reason === "OK" ? null : 7,
          reason,
        }),
      })),
    [],
  );

  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow">Manual</p>
        <h1 className="mt-2 text-[26px] font-semibold tracking-[-0.025em] text-ink">
          How Vault works
        </h1>
        <p className="mt-2 max-w-[64ch] text-[14px] leading-relaxed text-ink-muted">
          Vault is a browser-only cold-chain console. It simulates a temperature probe on a
          shipment in transit, records everything that happens to a hash-chained ledger, and
          tracks whether that record can currently be trusted. No sensor is attached. Without a
          backend configured nothing leaves this browser and there is no account behind it; with
          one, signing in adds organisations, roles and a server copy of the ledger, and the
          Accounts &amp; sync section below describes exactly what is sent.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[188px_1fr] lg:items-start">
        {/* Contents. Sticky on desktop; a plain scrolling list on mobile,
            where a sticky sidebar would eat a third of the viewport. */}
        <nav className="lg:sticky lg:top-24" aria-label="On this page">
          <p className="eyebrow">On this page</p>
          <ul className="mt-3 space-y-0.5 border-l border-line">
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  aria-current={active === section.id ? "true" : undefined}
                  className={`-ml-px block border-l py-1.5 pl-3 text-[13px] transition-colors ${
                    active === section.id
                      ? "border-brand font-medium text-brand-ink"
                      : "border-transparent text-ink-muted hover:text-ink"
                  }`}
                >
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* scroll-mt on each section keeps an anchored heading clear of the
            sticky header instead of landing underneath it. */}
        <div ref={contentRef} className="min-w-0 space-y-12 [&_section]:scroll-mt-24">
          <section id="overview" aria-labelledby="overview-title" className="space-y-4">
            <SectionHeading
              id="overview"
              title="Overview"
              lead="Three moving parts. The first two produce facts; the third is the only one a person drives."
            />
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                {
                  icon: Activity,
                  title: "Monitor",
                  body: `A reading every ${SAMPLE_SECONDS} seconds, plotted across the last ${READING_WINDOW} samples.`,
                  to: "/monitor",
                },
                {
                  icon: Database,
                  title: "Ledger",
                  body: "Every event, hash-chained. The sole source of truth for what happened.",
                  to: "/ledger",
                },
                {
                  icon: ShieldCheck,
                  title: "Investigation",
                  body: "Opened automatically by an excursion; closed only by a person, with a reason.",
                  to: "/ledger",
                },
              ].map((item) => (
                <Link
                  key={item.title}
                  to={item.to}
                  className="rounded-xl border border-line bg-raised p-4 shadow-e1 transition-colors hover:border-line-strong"
                >
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-soft text-brand-ink">
                    <item.icon size={16} aria-hidden="true" />
                  </span>
                  <p className="mt-3 text-[13.5px] font-medium text-ink">{item.title}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{item.body}</p>
                </Link>
              ))}
            </div>
            <p className="text-[13px] text-ink-muted">
              <Key>⌘K</Key> or <Key>Ctrl K</Key> jumps between them from anywhere.
            </p>
          </section>

          <section id="simulation" aria-labelledby="simulation-title" className="space-y-4">
            <SectionHeading
              id="simulation"
              title="The simulation"
              lead={`A temperature is generated every ${SAMPLE_SECONDS} seconds as a random walk from the previous reading. The safe corridor is ${SAFE_MIN_C}–${SAFE_MAX_C} °C; the simulated range runs ${CHART_MIN_C}–${CHART_MAX_C} °C, giving ${HEADROOM_C} °C of headroom either side so an excursion has somewhere to go.`}
            />
            <Card className="p-4">
              <dl className="grid gap-4 sm:grid-cols-4">
                {[
                  ["Sample cadence", `${SAMPLE_SECONDS}s`],
                  ["Ledger cadence", `${LEDGER_SECONDS}s`],
                  ["Chart window", `${READING_WINDOW} samples`],
                  ["Corridor", `${SAFE_MIN_C}–${SAFE_MAX_C} °C`],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-[11.5px] text-ink-subtle">{label}</dt>
                    <dd className="tabular mt-1 font-mono text-[14px] font-medium text-ink">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </Card>
            <p className="max-w-[68ch] text-[13.5px] leading-relaxed text-ink-muted">
              Status flips to <StatusPill tone="warning" size="sm">EXCURSION</StatusPill> the moment
              a reading leaves the corridor. Waiting for the random walk to produce one is not a
              demonstration, so the Monitor page carries a{" "}
              <Term>force excursion</Term> link beneath the pause control: it drives the next few
              readings towards the nearer edge until the corridor breaks. The resulting ledger
              entry records that it was operator-induced — the reading is real either way, but a
              trail that could not tell the two apart would be claiming more than it knows.
            </p>
          </section>

          <section id="ledger" aria-labelledby="ledger-title" className="space-y-4">
            <SectionHeading
              id="ledger"
              title="The ledger"
              lead="Append-only and hash-chained. Each entry commits to its own contents and to the previous entry's digest, so an edit anywhere breaks verification from that point onward."
            />
            {/* Sunken, so the raised blocks inside read as sitting on it
                rather than dissolving into it. */}
            <Card surface="sunken" className="overflow-x-auto p-6">
              <ChainDiagram />
            </Card>
            <p className="max-w-[68ch] text-[13.5px] leading-relaxed text-ink-muted">
              Editing entry #2 changes its digest. Entry #3 still carries the <Term>old</Term>{" "}
              digest in its <code className="font-mono text-[12.5px]">prev</code> field, so the link
              no longer matches and every entry after the edit is invalidated with it. That is the
              whole mechanism — there is nothing else holding the trail together.
            </p>
            <p className="max-w-[68ch] text-[13.5px] leading-relaxed text-ink-muted">
              The ledger keeps the most recent {MAX_LEDGER_ENTRIES} entries. Older ones slide out,
              which is a real limit rather than a rounding detail: see{" "}
              <a href="#limits" className="font-medium text-brand-ink hover:text-brand">
                what this cannot prove
              </a>
              .
            </p>
          </section>

          <section id="verification" aria-labelledby="verification-title" className="space-y-4">
            <SectionHeading
              id="verification"
              title="Verification"
              lead="Verification is recomputed from the stored entries every time the Ledger renders — it is never a stored flag. It returns one of six verdicts."
            />
            <Card className="overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-sunken">
                  <tr>
                    <th className="px-4 py-2.5 text-[11.5px] font-semibold text-ink-muted">
                      Verdict
                    </th>
                    <th className="px-4 py-2.5 text-[11.5px] font-semibold text-ink-muted">
                      What it means
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {verificationRows.map((row) => (
                    <tr key={row.reason}>
                      <td className="px-4 py-3 align-top">
                        <StatusPill tone={row.reason === "OK" ? "success" : "warning"} size="sm">
                          {row.title}
                        </StatusPill>
                      </td>
                      <td className="px-4 py-3 text-[13px] leading-relaxed text-ink-muted">
                        {row.description}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <p className="max-w-[68ch] text-[13.5px] leading-relaxed text-ink-muted">
              A chain can also be <Term>intact but incomplete</Term>: entries that were unreadable
              when the app loaded are discarded and counted, and a shortened chain that verifies is
              still evidence that something rewrote it. Nothing in the app calls a ledger verified
              unless the chain is intact <Term>and</Term> nothing was discarded.
            </p>
          </section>

          <section id="investigations" aria-labelledby="investigations-title" className="space-y-4">
            <SectionHeading
              id="investigations"
              title="Investigations"
              lead="An excursion is a measurement. An investigation is the human review it owes — and the two are tracked separately on purpose."
            />
            <ol className="max-w-[68ch] space-y-3 text-[13.5px] leading-relaxed text-ink-muted">
              {[
                "A reading leaves the corridor. EXCURSION_OPEN is written.",
                "If no investigation is already open, one opens automatically. The shipment stops reading as cleared.",
                "Further excursions while it is open are absorbed into it — a second alarm on an unresolved problem is the same problem, not a new one.",
                "The temperature returning to range writes EXCURSION_CLEAR. It does not resolve anything: recovery proves the corridor recovered, not that anyone looked at why it broke.",
                "A person resolves it with a reason and a required note. INVESTIGATION_RESOLVED records both, plus every excursion it covered.",
              ].map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span className="tabular mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full bg-sunken font-mono text-[11px] font-semibold text-ink-muted">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] text-ink-subtle">Resolution reasons:</span>
              {RESOLUTION_REASONS.map((reason) => (
                <StatusPill key={reason.value} tone="neutral" size="sm">
                  {reason.label}
                </StatusPill>
              ))}
            </div>
          </section>

          <section id="events" aria-labelledby="events-title" className="space-y-4">
            <SectionHeading
              id="events"
              title="Event glossary"
              lead="Every kind of entry the ledger can hold, what writes it, and what it means when you find one."
            />
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left">
                  <thead className="bg-sunken">
                    <tr>
                      <th className="px-4 py-2.5 text-[11.5px] font-semibold text-ink-muted">
                        Event
                      </th>
                      <th className="px-4 py-2.5 text-[11.5px] font-semibold text-ink-muted">
                        Written by
                      </th>
                      <th className="px-4 py-2.5 text-[11.5px] font-semibold text-ink-muted">
                        Meaning
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {LEDGER_EVENTS.map((event) => (
                      <tr key={event}>
                        <td className="tabular whitespace-nowrap px-4 py-3 align-top font-mono text-[12px] text-ink">
                          {event}
                        </td>
                        <td className="px-4 py-3 align-top text-[13px] leading-relaxed text-ink-muted">
                          {EVENT_SOURCES[event]}
                        </td>
                        <td className="px-4 py-3 align-top text-[13px] leading-relaxed text-ink-muted">
                          {EVENT_MEANINGS[event]}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </section>

          <section id="reports" aria-labelledby="reports-title" className="space-y-4">
            <SectionHeading
              id="reports"
              title="Reports"
              lead="A shipment closes when a handoff is recorded, and what it leaves behind is a PDF."
            />
            <Card className="p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-ink">
                  <FileText size={17} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <CardTitle>Closing report</CardTitle>
                  <p className="mt-1.5 max-w-[62ch] text-[13.5px] leading-relaxed text-ink-muted">
                    Built under <Link to="/shipment/manage" className="font-medium text-brand-ink hover:text-brand">Shipment → Manage</Link>. It carries the
                    shipment record, the corridor summary, every investigation with its resolution,
                    and the full ledger with digests — scoped to the current shipment, not the
                    whole chain. It states its own verdict on the first page and repeats the
                    tamper-evidence caveat on every page, because the file outlives the app that
                    made it. The Ledger page also exports the raw trail as CSV.
                  </p>
                </div>
              </div>
            </Card>
          </section>

          <section id="accounts" aria-labelledby="accounts-title" className="space-y-4">
            <SectionHeading
              id="accounts"
              title="Accounts & sync"
              lead="Optional, and additive. With no backend configured Vault runs exactly as described above; connecting one adds people, roles, a copy of the ledger outside this browser, and alerts."
            />

            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left">
                  <thead className="bg-sunken">
                    <tr>
                      <th className="px-4 py-2.5 text-[11.5px] font-semibold text-ink-muted">Role</th>
                      <th className="px-4 py-2.5 text-[11.5px] font-semibold text-ink-muted">Can</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {ORG_ROLES.map((role) => (
                      <tr key={role}>
                        <td className="whitespace-nowrap px-4 py-3 align-top">
                          <StatusPill tone={role === "owner" ? "brand" : "neutral"} size="sm">
                            {roleLabel(role)}
                          </StatusPill>
                        </td>
                        <td className="px-4 py-3 text-[13px] leading-relaxed text-ink-muted">
                          {roleDescription(role)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <p className="max-w-[68ch] text-[13.5px] leading-relaxed text-ink-muted">
              Roles are enforced by the database, not by this app. The console's copy of the table
              above exists so it can stop offering an action that would be refused — a{" "}
              <Term>viewer</Term> is not shown a Resolve button that fails. Two rules hold in both
              places: an admin cannot create or remove an owner, and an invitation's role is
              applied when that address signs up rather than chosen by whoever accepts it.
            </p>

            <p className="max-w-[68ch] text-[13.5px] leading-relaxed text-ink-muted">
              Sync runs one way, <Term>browser to server</Term>. There is no server-side sensor:
              the readings are generated here, in this tab, so the browser is where entries are
              made and the server's copy is an anchor rather than a source. Entries are pushed by
              digest, so re-running a sync cannot duplicate anything — and a row read back is put
              through the same validation as anything read out of local storage, because harder to
              tamper with is not the same as trusted unverified.
            </p>

            <p className="max-w-[68ch] text-[13.5px] leading-relaxed text-ink-muted">
              When the corridor breaks, an organisation's linked Telegram chats receive the
              reading, the shipment and the ledger digest. The bot's token lives in the project's
              server-side secrets and never reaches this browser. Alerts are raised from the
              browser for the same reason sync is: with no browser open there are no readings, so
              there is nothing that could have excursed unreported.
            </p>
          </section>

          <section id="storage" aria-labelledby="storage-title" className="space-y-4">
            <SectionHeading
              id="storage"
              title="What persists"
              lead="Everything lives in this browser's localStorage. Clearing site data destroys the local ledger, and unless an organisation has been signed into and synced, there is no copy anywhere else."
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Card className="p-4">
                <CardTitle>Survives a reload</CardTitle>
                <ul className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-ink-muted">
                  <li>The shipment record.</li>
                  <li>The ledger — most recent {MAX_LEDGER_ENTRIES} entries.</li>
                  <li>Whether an investigation is open.</li>
                  <li>Theme preference, and which notifications you have seen.</li>
                </ul>
              </Card>
              <Card className="p-4" surface="sunken">
                <CardTitle>Does not</CardTitle>
                <ul className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-ink-muted">
                  <li>The chart window — it is live only and restarts with the session.</li>
                  <li>Anything at all in another browser, or on another machine.</li>
                </ul>
              </Card>
            </div>
            <p className="max-w-[68ch] text-[13.5px] leading-relaxed text-ink-muted">
              Stored data is treated as hostile on the way in: a stale schema, a truncated write or
              a hand-edited chain is coerced or discarded rather than trusted, and anything about to
              be dropped is copied aside first. This is an audit tool, so it does not destroy
              evidence to tidy up.
            </p>
          </section>

          <section id="limits" aria-labelledby="limits-title" className="space-y-4">
            <SectionHeading
              id="limits"
              title="What this cannot prove"
              lead="The chain is tamper evidence, not tamper proofing. The difference matters, so it is stated rather than glossed."
            />
            <Card className="border-warning-line bg-warning-soft p-5 dark:border-warning/40">
              <ul className="max-w-[68ch] space-y-3 text-[13.5px] leading-relaxed text-ink">
                <li>
                  <Term>Nothing signs the chain.</Term> It lives in unauthenticated browser storage.
                  Anyone able to write that storage can replace it wholesale with a fresh, perfectly
                  valid chain, and no check here would notice. Syncing to an organisation closes
                  this for entries that reached it — the server refuses every edit and every
                  deletion through the app — but it does not sign them, and it says nothing about
                  a browser that never synced.
                </li>
                <li>
                  <Term>The window slides.</Term> Once an entry ages past{" "}
                  {MAX_LEDGER_ENTRIES} its digest is gone, so the oldest retained entry's{" "}
                  <code className="font-mono text-[12.5px]">prev</code> field has nothing left to
                  check against. Only the very first entry ever written can be verified against a
                  fixed root.
                </li>
                <li>
                  <Term>Verification is structural.</Term> It says no retained entry was edited,
                  removed or reordered. It says nothing about whether a reading was true, whether a
                  person reviewed it, or whether the box was where the route claims.
                </li>
              </ul>
            </Card>
            <p className="max-w-[68ch] text-[13.5px] leading-relaxed text-ink-muted">
              Closing any of these needs an anchor the writer cannot forge — a server, a signature,
              a notary. This prototype has none of them, and says so rather than implying otherwise.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
