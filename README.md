# Vault -- cold-chain integrity console

A frontend prototype for monitoring a vaccine shipment's cold chain. It simulates a
temperature corridor in the browser, records events to a hash-chained ledger that can be
verified after the fact, and tracks one box from loading bay to handoff.

There is no sensor: the readings are simulated. Everything else is real, and everything
runs in the browser — by default, nothing leaves it.

A backend is **optional and additive**. With no credentials configured the console works
exactly as described here, entirely offline. Configuring a Supabase project adds
organisations, four roles, a copy of the ledger that cannot be edited or deleted through
the app, and Telegram alerts when the corridor breaks. See
**[supabase/README.md](supabase/README.md)**.

## Stack

- **React 18** + **TypeScript 5** (`strict`)
- **Vite 6**, `@` -> `./src`
- **Tailwind CSS v4** (CSS-first `@theme`, no config file) + **shadcn/ui** on **Base UI** primitives
- **react-router-dom 7**
- **anime.js** for the two remaining transitions
- **lucide-react** icons, **Geist** / **Geist Mono** bundled locally
- **Vitest** for the logic layer

## Getting started

```bash
npm install
npm run dev         # dev server
npm run verify      # typecheck + lint + test + build
```

Individual steps: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.

The same four steps run in CI (`.github/workflows/ci.yml`) on every pull request. Lint and
test are scoped to `src/`, so a git worktree checked out under `.claude/` is not collected
as part of this project.

Before changing anything, read **[AGENTS.md](AGENTS.md)** -- the conventions there are
derived from bugs this codebase actually shipped, not from taste.

## Routes

| Route              | Purpose                                                             |
| ------------------ | ------------------------------------------------------------------- |
| `/`                | Overview with a live preview of the real console state              |
| `/monitor`         | Gauge, safe-corridor bar, interactive history chart                 |
| `/ledger`          | The chain, with verification, digest lookup, search, filters, export |
| `/shipment`        | Read-only shipment record and route                                 |
| `/shipment/manage` | The only place shipment state is mutated; the closing report        |
| `/help`            | The manual: mechanism, verdict reference, event glossary, limits    |
| `/signin`          | Sign in or create an account (only useful with a backend)           |
| `/organisation`    | Members, roles, invitations, alert destinations, sync status        |
| anything else      | Redirects to `/shipment`                                            |

## How the simulation works

- A reading is generated every **2 seconds**.
- The safe corridor is **2-8 deg C**. The simulated and plotted domain is **1.5-8.5 deg C** -- 0.5 deg C of headroom either side, so an excursion renders in its own space instead
  of clamping onto the threshold line.
- Status is `EXCURSION` whenever a reading is outside 2-8 deg C, and `SAFE` inside it.
- The chart keeps a sliding window of the last 30 readings (~60 seconds). Its axis labels,
  window label and description are all derived from the readings themselves.

## The ledger

Entries are appended for:

- the current reading, every **10 seconds**
- an excursion opening or clearing, the moment it happens
- shipment creation, edits and handoff

A shipment edit records each changed field's before and after, so an edit to the product,
corridor or route is auditable rather than logged as an update with no value attached.

Each entry commits to `sequence + event + timestamp + detail + prevHash` under **SHA-256**,
and carries the previous entry's digest. The SHA-256 implementation is verified against the
FIPS 180-4 vectors and cross-checked against `node:crypto` in `src/lib/hash.test.ts`.

`verifyChain` recomputes every digest and checks every link, and reports which way the
chain failed:

| Verdict            | Meaning                                                        |
| ------------------ | -------------------------------------------------------------- |
| `OK`               | Every digest recomputes and every link matches                 |
| `DIGEST_MISMATCH`  | An entry's contents no longer match its digest -- it was edited |
| `BROKEN_LINK`      | An entry does not follow the one before it                     |
| `OUT_OF_ORDER`     | Sequence numbers are not consecutive                           |
| `BAD_ROOT`         | Sequence 1 does not root at the genesis hash                   |
| `BAD_SEQUENCE`     | An entry carries a sequence that is not a 1-based integer      |

A chain can also be **incomplete**: intact, but with stored entries that were unreadable on
load. That is reported separately, because a chain truncated at the tail still verifies and
would otherwise be presented as sound.

The chain retains the most recent 250 entries.

### The Ledger page

The trail is drawn as a chain, not a table. A reading is a marker on a miniature of the
corridor it was measured against, hung off a spine that is the chain itself; the events that
actually happened — an excursion, a handoff, an investigation resolving — punctuate that
run as labelled links. Readings carry no event label at all, because the marker and the
value already say everything the word "reading" would.

Pasting a digest into the search box is a lookup rather than a text search: it answers with
the entry that digest belongs to, or says plainly that no *retained* entry carries it —
which is a different statement from "it never existed", and the page does not conflate the
two.

## Reports

A shipment closes when a handoff is recorded, and what it leaves behind is a PDF, generated
in the browser with no dependency: `src/lib/pdf.ts` is a small PDF 1.4 writer, and
`src/lib/reportPdf.ts` lays the report out on top of it.

The report is scoped to the current shipment — the ledger is one chain across every
shipment this browser has run, so a report that took it wholesale would attribute a
previous shipment's excursions to this one. It carries the shipment record, the corridor
summary, every investigation with its resolution, and the full trail with digests. It
states its verdict on the first page, and repeats the tamper-evidence caveat on every page,
because the file outlives the app that made it and will be read without any of its context.

Export it from `/shipment/manage`, or from the Ledger page beside the CSV export.

## What persists

Stored in `localStorage`, and restored on load:

| Key                        | Contents                                        |
| -------------------------- | ----------------------------------------------- |
| `vault:fieldLog`           | The shipment record                             |
| `vault:ledger`             | The hash chain                                  |
| `vault:openInvestigation`  | Last-known open investigation, for when its entry ages out |
| `vault:notificationsSeen`  | Highest notification sequence already read      |
| `vault:theme`              | `dark` / `light`                                |
| `vault:activeOrg`          | Selected organisation (backend builds only)     |
| `vault:shipmentIds`        | Local log id → server shipment id (backend builds only) |

The chart window is **live only** -- it is rebuilt each session and is not persisted.

Stored values are treated as untrusted. Reads distinguish three states -- **absent**,
**present** and **unparseable** -- because collapsing them let an unreadable chain be
replaced with a fresh one that the UI then reported as verified. `normalizeFieldLog` and
`parseChain` coerce or discard anything malformed and report how much was discarded, and an
`ErrorBoundary` offers a "clear local data" recovery path if a render still fails.

Anything about to be dropped is copied to a `.corrupt` sibling key (`vault:ledger.corrupt`,
`vault:fieldLog.corrupt`) before it is overwritten. An audit tool should not destroy the
record it failed to read.

## Shipment lifecycle

One record at a time, mutated only from `/shipment/manage`. Every action is confirmed and
written to the ledger.

- **Edit** changes the editable fields and records the before/after of each one.
- **Reset** restores those fields to their defaults. It deliberately keeps the log id,
  start time and any recorded handoff -- a field reset must not un-hand-off a shipment or
  rewrite its identity.
- **Handoff** is permanent. It stamps `handedOffAt` and appends a `HANDOFF_INIT` entry.
- **New shipment** issues a fresh box and batch and restarts the chart window. The ledger
  is append-only, so it carries on with the new shipment recorded as an entry rather than
  being cleared.

## Architecture

```
src/
  main.tsx                 Router + error boundary
  App.tsx                  Shell: header, command palette, notifications, account, theme
  styles.css               Tailwind v4 + the Vault token palette (light/dark)
  context/
    ColdChainContext.tsx   Simulation loop, ledger appends, shipment state, persistence
    AuthContext.tsx        Session, organisations, active org and role
  lib/
    hash.ts                SHA-256
    ledger.ts              Append-only chain, verification, digest lookup
    chart.ts               Domain, geometry, status
    simulation.ts          Cadence, pure transforms, time formatting
    shipment.ts            Record creation, normalisation, validation, route parsing
    csv.ts                 RFC 4180 writing + a download that survives Firefox
    pdf.ts                 A minimal PDF 1.4 writer: text metrics, pages, xref
    report.ts              The end-of-shipment report as plain data
    reportPdf.ts           That report, laid out on pages
    roles.ts               The four roles and what each may do
    sync.ts                Local records <-> Postgres rows, and the sync verdict
    supabase.ts            The client, or null when unconfigured
    motion.ts              prefers-reduced-motion
  hooks/
    useToast.ts            Transient status messages
    useReportExport.ts     Build and download the closing report
    useCapability.ts       Whether the current role permits an action
    useLedgerSync.ts       Push entries to the organisation, raise excursion alerts
    useOrganisationAdmin.ts  Members, invitations, alert destinations
  components/              ErrorBoundary, ConfirmDialog, LoadingScreen, ui/ primitives
  pages/                   Landing, Monitor, Ledger, Shipment, ShipmentManage,
                           Help, SignIn, Organisation
supabase/
  schema.sql               Tables, role helpers, and every RLS policy
  functions/               Edge Functions: telegram-alert, telegram-webhook
  README.md                Setup, roles, and what the backend does and does not prove
```

Logic lives in `src/lib` as pure functions, which is what the test suite covers; the
components are rendering on top of it.

## Testing

178 tests over `src/lib`, sitting beside their source as `*.test.ts`:

| File | Covers |
| --- | --- |
| `hash.test.ts` | SHA-256 against the FIPS 180-4 vectors and `node:crypto`, across padding boundaries and multi-byte UTF-8 |
| `ledger.test.ts` | Every way a chain can break, the boundary of what verification can claim, digest lookup |
| `chart.test.ts` | Domain geometry, the random walk staying in range, derived time labels |
| `simulation.test.ts` | The forced-excursion drift: which way it runs, and that it gets there |
| `shipment.test.ts` | Normalising hostile stored state, route and dose parsing, validation |
| `csv.test.ts` | RFC 4180 quoting and formula-injection guards |
| `pdf.test.ts` | Text metrics, WinAnsi substitution, and that every xref offset points at the object it claims |
| `report.test.ts` | Scoping the report to one shipment, and a verdict that never overclaims |
| `reportPdf.test.ts` | Nothing drawn outside the printable area, page breaks, the caveat on every page |
| `roles.test.ts` | What each role may do, pinned to the ranks in `schema.sql` |
| `sync.test.ts` | Row mapping that preserves a digest, and a sync verdict that never claims an anchor it lacks |

The suite covers logic, not rendering -- which is the reason logic lives in `src/lib` as
pure functions rather than inside components. Several tests encode *why* something is the
way it is: `chart.test.ts` asserts the plotted domain is wider than the safe corridor, so
narrowing it fails a test instead of silently making excursions invisible again.

Randomness is injected (`nextTemperature(previous, drift)`, `randomSerial(random)`) so the
transforms stay pure and deterministic under test.

## Design

Two surfaces (`raised`, `sunken`) over one page background, one line colour, three text
weights, one brand accent and three status hues -- defined once as CSS custom properties in
`styles.css` and exposed to Tailwind through `@theme inline`. Components use `bg-raised`,
`text-ink-muted`, `border-line` and so on, so light and dark are defined in one place
rather than re-guessed per element.

Sans (Geist) is the UI face. Mono (Geist Mono) is reserved for machine values -- hashes,
sequence numbers, timestamps, identifiers and numeric readouts. Numeric readouts use
tabular figures so they do not jitter as digits change.

## Known limitations

- The simulation is a random walk, not a sensor feed. A "force excursion" control on the
  Monitor page drives it out of the corridor on demand; the resulting ledger entry records
  that it was operator-induced, because a trail that could not tell the two apart would be
  claiming more than it knows.
- **Without a backend**, the ledger is per-browser: not shared, not synced, not notarised.
  It proves that *this browser's* stored chain is internally consistent — not that a third
  party could not have replaced the whole chain.
- **With one**, entries that reach the server cannot be edited or deleted by any API
  caller, which closes wholesale replacement for those entries. It does not sign them, it
  says nothing about a browser that never synced, and it does not constrain the project's
  own owner. See the last section of `supabase/README.md`.
- Verification is structural throughout. It says no retained entry was edited, removed or
  reordered. It says nothing about whether a reading was true.
