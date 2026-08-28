# Vault Cold Chain Console

A client-side console for monitoring a single cold-chain shipment: it simulates temperature readings, keeps a tamper-evident audit trail of everything that happens, and tracks whether the shipment's record can currently be trusted.

## Language

**Excursion**:
A period where a temperature reading falls outside the safe corridor (2-8 degrees C). Logged automatically to the Ledger as it opens and clears.
_Avoid_: Breach, alarm, incident.

**Ledger**:
The append-only, hash-chained record of every event that happens to the shipment (readings, excursions, handoffs, investigations). The sole source of truth - nothing about the shipment's history exists outside it.
_Avoid_: Log, audit trail (as a separate thing - the Ledger *is* the audit trail).

**Intact / Verified**:
The cryptographic fact that no retained Ledger entry has been edited, reordered, or broken from its chain since it was written. Computed structurally from the hash chain itself and has no notion of workflow or human review.
_Avoid_: Cleared, trusted (reserve those for Investigation status - see below).

**Investigation**:
The record of human review opened automatically the moment an Excursion begins. While open, it absorbs any further Excursions without spawning a new one - a second alarm while the first is unresolved is the same unresolved problem, not a new case. It closes only when a person explicitly resolves it with a Resolution Reason and a note. Recorded in the Ledger via `INVESTIGATION_OPEN` and `INVESTIGATION_RESOLVED` entries, the latter listing the sequence numbers of every Excursion it covered.
_Avoid_: Ticket, case, incident.

**Cleared / Under Investigation**:
The shipment-wide status of whether the Ledger can currently be trusted from a workflow standpoint: Under Investigation while any Investigation is open, Cleared otherwise. This is a single global flag for the whole Ledger, not a per-entry annotation - one open Investigation is enough to withhold clearance for the entire shipment. Distinct from, and independent of, whether the chain is Intact.
_Avoid_: Verified (see Intact / Verified above).

**Organisation**:
The unit everything belongs to once a backend is configured: its members, its
shipments, its ledger, its alert destinations. A person can be in several, and
holds one Role in each. Absent entirely in a local-only build, where there is
nothing for anything to belong to.
_Avoid_: Team, workspace, tenant.

**Role**:
What a member may do in an Organisation, in ascending authority: Viewer,
Operator, Admin, Owner. Decided by the row-level security policies in
`supabase/schema.sql`; `src/lib/roles.ts` is the console's copy of that
decision, used only to stop offering an action the server would refuse.
_Avoid_: Permission, access level (a Role *has* those).

**Anchor**:
A copy of a Ledger entry somewhere its writer cannot afterwards edit or remove
it. Syncing to an Organisation produces one, because `ledger_entries` grants
INSERT and SELECT and no UPDATE or DELETE. An anchored entry is not a *signed*
entry, and the distinction is load-bearing: the server takes the browser's word
for what an entry says, and only guarantees that what it said cannot change.
_Avoid_: Backup, notarised, immutable.

**Report**:
The PDF a shipment leaves behind, scoped to that shipment rather than the whole
chain. Generated in the browser, and self-describing: it carries its own verdict
and its own caveat, because it will be read long after and far away from the app
that produced it.
_Avoid_: Export (the CSV is an export; the Report is a document).

**Resolution Reason**:
The structured category chosen when resolving an Investigation (e.g. Sensor Fault, Carrier Delay, Confirmed Loss, Other), paired with a required freeform note. Makes investigations queryable, not just readable.
_Avoid_: Ticket status, disposition.

## Visual language

The theme defines a small vocabulary of surfaces, weights and tones. Every
colour in the app comes from it; nothing hardcodes a value.

**Surface / Raised / Sunken**:
The three layers. Surface is the page itself, the ground everything sits on.
Raised is a layer above it — a card, a panel, a floating control. Sunken is a
well recessed below it — a table header, a hash pill, a field. They must read
as three distinguishable layers. Light mode expresses this with luminance
steps plus a cast shadow; dark mode with luminance alone, because a shadow on
a near-black ground reads as mud rather than depth.
_Avoid_: Background, foreground, elevation levels (see Elevation below).

**Ink / Muted ink / Subtle ink**:
The three text weights, in descending prominence: the thing itself, its
supporting detail, its metadata. Every weight stays legible against every
surface — a weight that drops below legibility stops being information and
becomes texture.
_Avoid_: Primary/secondary text, grey.

**Line / Strong line**:
A hairline separating regions. The strong variant is darker, for edges that
must survive on a busy background or carry a hover state.
_Avoid_: Border colour, divider.

**Brand**:
The single accent, in a ramp: a fill, its hover, a text-safe shade, a tint,
and an edge for that tint. The brand punctuates — an eyebrow, a primary
action, a selected row — it does not carpet.
_Avoid_: Primary colour, theme colour.

**Tone**:
The semantic colouring of a status chip or panel: success, warning, danger or
neutral. Each has a text shade, a tint and an edge. A tone is a presentation
concern and never the source of truth — it reflects Ledger state, it does not
define it. Warning is the tone an Excursion and an open Investigation carry.
_Avoid_: Status colour, severity, alert level.

**Elevation**:
The named steps of depth. Elevation is a light-mode device: dark mode
separates its layers by luminance, so the elevation steps resolve to nothing
there.
_Avoid_: Shadow, z-level.

## Invariants

- Every colour comes from a token. A raw hex or a stock Tailwind palette class
  in a component is a defect.
- The three surfaces must render as three distinguishable layers in both
  themes. Light mode violated this before the palette was rebuilt — it
  declared three and rendered one.
- Text contrast holds to WCAG AA (4.5:1) for every ink weight against every
  surface, in both themes.
- Solid tint and edge tokens are preferred to transparency. A translucent
  layer takes its character from whatever happens to sit behind it, which is
  what made the light theme read as washed out.
- Dark mode is not changed as a side effect of a light-mode change. Anything
  that would alter it is scoped, or the token resolves to nothing there.
- The console works with no backend configured. Identity is a layer beside the
  simulation, the Ledger and the shipment record — never a prerequisite
  underneath them.
- Nothing claims an Anchor it does not have. "Verified", "cannot be edited" and
  "synced" are three different statements, and each is made only in the state
  that earns it.
