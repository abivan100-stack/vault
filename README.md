# Vault -- cold-chain integrity console

A frontend prototype for monitoring a vaccine shipment's cold chain. It simulates a
temperature corridor in the browser, records events to a hash-chained ledger that can be
verified after the fact, and tracks one box from loading bay to handoff.

There is no backend, no sensor and no authentication. Everything runs in the browser and
nothing leaves it.

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

## Routes

| Route              | Purpose                                                             |
| ------------------ | ------------------------------------------------------------------- |
| `/`                | Overview with a live preview of the real console state              |
| `/monitor`         | Gauge, safe-corridor bar, interactive history chart                 |
| `/ledger`          | Hash-chained trail with chain verification, search, filters, CSV    |
| `/shipment`        | Read-only shipment record and route                                 |
| `/shipment/manage` | The only place shipment state is mutated                            |
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

## What persists

Stored in `localStorage`, and restored on load:

| Key                        | Contents                                        |
| -------------------------- | ----------------------------------------------- |
| `vault:fieldLog`           | The shipment record                             |
| `vault:ledger`             | The hash chain                                  |
| `vault:notificationsSeen`  | Highest notification sequence already read      |
| `vault:theme`              | `dark` / `light`                                |

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
  App.tsx                  Shell: header, command palette, help, notifications, theme
  styles.css               Tailwind v4 + the Vault token palette (light/dark)
  context/
    ColdChainContext.tsx   Simulation loop, ledger appends, shipment state, persistence
  lib/
    hash.ts                SHA-256
    ledger.ts              Append-only chain + verification
    chart.ts               Domain, geometry, status
    simulation.ts          Cadence, pure transforms, time formatting
    shipment.ts            Record creation, normalisation, validation, route parsing
    csv.ts                 RFC 4180 writing + a download that survives Firefox
    motion.ts              prefers-reduced-motion
  hooks/useToast.ts
  components/              ErrorBoundary, ConfirmDialog, LoadingScreen, ui/ primitives
  pages/                   Landing, Monitor, Ledger, Shipment, ShipmentManage
```

Logic lives in `src/lib` as pure functions, which is what the test suite covers; the
components are rendering on top of it.

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

- The simulation is a random walk, not a sensor feed.
- The operator shown in the header is demo data; there is no authentication.
- The ledger is per-browser. It is not shared, synced or independently notarised, so it
  proves that *this browser's* stored chain is internally consistent -- not that a third
  party could not have replaced the whole chain.
