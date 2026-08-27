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

**Resolution Reason**:
The structured category chosen when resolving an Investigation (e.g. Sensor Fault, Carrier Delay, Confirmed Loss, Other), paired with a required freeform note. Makes investigations queryable, not just readable.
_Avoid_: Ticket status, disposition.
