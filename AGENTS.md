# Working in this repo

Vault is a cold-chain console that runs in the browser. No sensor — the
readings are simulated. A backend is optional: `supabase/` adds organisations,
roles, a server copy of the ledger and Telegram alerts, and the app runs
identically without it. Read `README.md` for what it does; this file is how to
change it without breaking the things that took an audit to fix.

## Commands

```bash
npm run verify      # typecheck + lint + test + build -- the gate. Run before committing.
npm run dev         # dev server
npm test            # vitest, 178 tests
```

`verify` is what CI runs. If it passes locally it passes there, with one
exception noted under [Gotchas](#gotchas).

## Where code goes

| Put it in | When |
| --- | --- |
| `src/lib/*.ts` | Any logic with a decision in it. Pure functions, no React. |
| `src/hooks/` | Stateful behaviour reused across pages. |
| `src/context/ColdChainContext.tsx` | Simulation loop, ledger appends, persistence. |
| `src/pages/`, `src/components/` | Rendering. |
| `src/components/ui/` | shadcn/Base UI primitives. Generated -- change only with reason. |
| `src/context/AuthContext.tsx` | Session, organisations, active org and role. |
| `supabase/schema.sql` | Tables, role helpers, every RLS policy. The enforcement. |

The split is deliberate: `src/lib` is where the test suite lives, so logic that
matters belongs there rather than inside a component. If you are writing an
`if` inside JSX that decides something non-visual, it probably belongs in `lib`
with a test.

## Rules

These are not style preferences. Each one is a bug this codebase actually
shipped.

**Never hardcode a value that exists in state.** The route was hardcoded
`DELHI/JAIPUR` while being editable; the ledger's date was the literal string
`2026-08-26`; the landing preview showed a fixed `4.4 deg C` that contradicted the
live reading one click away. If it is displayed and it is also stored, derive
it.

**Never address a row by its index.** The ledger's hash column was chosen by
array position, so filtering re-pointed a row at another entry's hash. Key and
address by a stable id (`entry.hash`, `reading.id`).

**Never put a side effect inside a state updater.** React 18 StrictMode invokes
updaters twice. `setReadings` inside a `setTemperature` updater double-appended
every tick; ledger appends inside `setFieldLogMeta` wrote two entries per user
action. Compute impure values (`Date`, `Math.random`, ids) in the event handler
or interval callback, then pass them into a pure updater.

**Use semantic tokens, never raw hex.** `bg-raised`, `text-ink-muted`,
`border-line`, `text-warning` -- defined once in `src/styles.css` under `:root`
and `.dark`, exposed via `@theme inline`. A `dark:` variant with a hex value in
it means the token is missing; add the token. There were several hundred of
these before.

**Mono is for machine values only.** Hashes, sequence numbers, timestamps, ids,
numeric readouts. Not prose, not labels, not headings. Add `tabular` to any
number that updates live so it does not jitter.

**Treat stored state as hostile.** `localStorage` can hold a stale schema, a
truncated write, or something hand-edited. Route reads through
`normalizeFieldLog` / `parseChain`; they coerce or discard and report how much
was discarded. Absent, present and unparseable are three distinct states --
collapsing them let an unreadable chain be silently replaced by a fresh one the
UI then called verified.

**Do not destroy evidence.** Anything about to be dropped is copied to a
`.corrupt` sibling key first. This is an audit tool.

**Do not overclaim in UI copy.** The audit's root cause was a presentation
layer asserting guarantees the state layer never provided. Before writing
"every", "always", "proves" or "immutable", check the code does that. The
ledger is tamper *evidence* for retained entries, not tamper *proofing* -- it
lives in unsigned local storage and the copy says so.

**The backend is additive, never a prerequisite.** Every feature must work
with `VITE_SUPABASE_URL` unset. `supabase` is `null` in that build, and every
call site takes its local path. This is not a fallback bolted on afterwards --
it is why the console can be opened, demonstrated and audited without
provisioning anything, and a change that breaks it breaks the product.

**`src/lib/roles.ts` is a copy, not the authority.** The RLS policies in
`supabase/schema.sql` decide what may happen; the client's table exists so the
UI can stop offering an action that would be refused. If you change one, change
both -- `roles.test.ts` pins the ranks to `public.role_rank`.

**Server rows are untrusted too.** A row read back goes through `isLedgerEntry`
exactly like a value out of `localStorage`, and the chain it forms goes back
through `verifyChain`. Harder to tamper with is not the same as trusted
unverified.

## The ledger

Append-only, SHA-256 hash-chained. Each entry commits to its own contents and
the previous entry's digest, so an edit breaks verification from that point on.

- Append via `appendEntry` only. Never seed, never mutate, never reorder.
- `verifyChain` returns a verdict, not a boolean -- see the table in the README.
- A chain can be intact but **incomplete** (entries were unreadable on load).
  Gate any "verified" indicator on `intact && discardedEntryCount === 0`; both
  the Ledger and Landing pages do.
- What verification cannot do: authenticate a window whose predecessor has slid
  out, or detect wholesale replacement. Do not add checks that pretend
  otherwise.

## Chart

The safe corridor is 2-8 deg C; the plotted domain is 1.5-8.5 deg C. Keep them
different. When they matched, an excursion clamped onto the threshold line and
was pixel-identical to a safe reading at the limit -- the one state the product
exists to surface was the one it could not show. Constants live in
`src/lib/chart.ts`; do not inline them.

## Testing

Tests sit next to their source as `src/lib/*.test.ts`. Cover the logic, not the
rendering. Prefer a case that encodes *why* something is the way it is -- e.g.
`chart.test.ts` asserts the plotted domain is wider than the corridor, so
narrowing it fails a test rather than silently regressing the UI.

Injected randomness (`nextTemperature(previous, drift)`,
`randomSerial(random)`) exists so tests stay deterministic. Keep it.

## Commits

- Conventional prefixes: `fix:`, `feat:`, `docs:`, `chore:`.
- Say what was wrong and why it mattered, not just what changed.
- A pre-commit hook runs a review over the staged patch and **blocks on real
  findings**. Read them; several were legitimate integrity bugs. It also caps
  diff size, so split large work by area -- but keep each commit compiling on
  its own. Mutually dependent changes (context + pages + styles) belong in one
  commit even if large.

## Gotchas

**Sibling worktrees.** Claude Code sessions create git worktrees under
`.claude/worktrees/`. Lint and vitest are scoped to `src/` in
`eslint.config.js` and `vite.config.ts` so those are not collected -- without
it, their built `dist/` bundles get linted as source (3,500+ errors) and their
tests are reported as ours. CI never sees this, because a fresh checkout has no
worktrees. Do not widen those globs.

**`tsc -b`, not `tsc --noEmit`.** The root tsconfig is references-only, so
`--noEmit` against it checks nothing. `npm run typecheck` uses `-b`.

**Base UI needs refs.** Its `render` prop clones the element and attaches a
ref. A plain function component drops it silently. `Button` is wrapped in
`forwardRef` for this reason -- keep it that way for anything passed to
`render`.
