# Investigations are global, absorbing, and live in the Ledger - not per-entry flags in a separate store

We're adding breach response as a first-class concept (see `Investigation` in `CONTEXT.md`). Three decisions here are hard to reverse once other code depends on them, so we're recording the reasoning.

**Global, not per-entry.** "Cleared / Under Investigation" is one flag for the whole shipment, not an annotation on individual Ledger entries. The question it answers - "can I trust this shipment's record right now" - is shipment-scoped; a single open Investigation is enough to withhold clearance for everything, so there's no need to track which specific entries are "covered."

**Absorbing, not one-per-breach.** While an Investigation is open, further Excursions don't spawn parallel Investigations - they're absorbed into the open one. A second alarm while the first is unresolved is the same unresolved problem, not a new case needing its own resolution.

**Recorded in the Ledger, not a separate store.** Opening and resolving an Investigation append `INVESTIGATION_OPEN` / `INVESTIGATION_RESOLVED` entries to the existing hash-chained Ledger, rather than living in a parallel table or in-memory-only state. The Ledger is already the shipment's sole source of truth; a second store for investigation state would fork the audit trail and could drift from - or fail to survive alongside - the same tamper-evident guarantees as everything else.

## Consequences

- Cryptographic chain integrity (`verifyChain` / "Intact") stays a pure structural fact about the hash chain and must never be conflated with "Cleared." "Cleared" is a separate flag derived from the newest `INVESTIGATION_OPEN`/`INVESTIGATION_RESOLVED` pair.
- `INVESTIGATION_RESOLVED` must reference the sequence numbers of every Excursion absorbed during the open window, since the absorbing behavior would otherwise be invisible in the trail.
- There is no per-entry "was this row investigated" query - only "was the shipment under investigation at some point," derivable by scanning Investigation entries.
