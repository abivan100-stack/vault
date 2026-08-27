# Context

Vault is a cold-chain integrity console for monitoring a vaccine shipment's temperature corridor. It records temperature readings to a hash-chained ledger that can be verified after the fact, and tracks one box from loading bay to handoff.

## Domain

**Shipment** — a single box with an identifier, destination, product, and route. It transitions from creation through operation to permanent handoff, with every state change appended to the ledger.

**Reading** — a single temperature measurement, generated at regular intervals. Each reading is either safe (within the corridor) or an excursion (outside it).

**Corridor** — the safe temperature range for the shipment, typically 2–8 degrees Celsius. Excursions are readings that fall outside this band.

**Excursion** — a reading outside the safe corridor. An excursion opens a state, and the next safe reading clears it.

**Ledger** — an append-only hash-chained record of events: readings, excursion openings and clearings, and shipment mutations (creation, edits, handoff). Entries are immutable once written.

**Ledger entry** — a single record in the chain, containing sequence number, event type, timestamp, event detail, and the hash of the previous entry.

**Digest** — the SHA-256 hash of a ledger entry's contents. The digest chain proves integrity: each entry commits to the previous entry's digest, so altering any entry breaks the chain.

**Verification verdict** — the result of recomputing the entire chain's digests and links. Possible verdicts: OK (chain intact), DIGEST_MISMATCH (entry was edited), BROKEN_LINK (sequence interrupted), OUT_OF_ORDER (sequence numbers non-consecutive), BAD_ROOT (genesis hash invalid), BAD_SEQUENCE (sequence number malformed).

**Handoff** — the permanent transfer of the shipment to another party. Once handed off, the shipment record is locked and can no longer be edited.

## Visual Language

**Surface** — the page background; the ground that everything sits on.

**Raised** — a layer above the surface, perceptibly elevated. In light mode, expressed via luminance and a cast shadow; in dark mode, by luminance alone (shadows on near-black read as mud).

**Sunken** — a well recessed below the surface, visually distinct from both surface and raised. Never casts a shadow.

**Line** — a hairline separating regions. Strong line — a darker variant, for edges that must survive on a busy background.

**Ink** — the primary text weight, used for the thing itself. Muted ink — a lighter weight for supporting detail. Subtle ink — the lightest weight for metadata. All three weights remain legible against both surface and raised, so information stays information, not texture.

**Brand** — the single accent color. Its fill is the primary action state; hover shifts to a darker shade. Brand ink is a text-safe variant. Brand soft is a tint for backgrounds (badges, chips, charts). Brand line is an edge for soft backgrounds in light mode; dark mode uses no edge.

**Status hues** — three semantic colors representing outcomes. Safe (success) is green, warning is amber, breach (danger) is red. Each status has a text shade (for labels), a soft tint (for badges and backgrounds), and an edge color (for outlined containers in light mode; dark mode uses no edge). Status must be identifiable by more than hue alone at badge size.

**Elevation** — a light-mode-only device expressing depth via layered shadows. Three named steps: subtle, medium, and pronounced. Dark mode uses luminance steps instead, so elevation tokens are neutral in dark mode.

## Invariants

- Every colour used in the app comes from a token defined in the CSS; nothing hardcodes a value.
- The three surfaces (surface, raised, sunken) must render as three visually distinguishable layers, not one flat plane. Light mode previously violated this by rendering all three within a few percent of each other, so the vocabulary described layers the screen did not have.
- Text contrast must meet WCAG AA (4.5:1 minimum) in both light and dark themes.
- Solid tint tokens are preferred over transparency for surfaces and edges, because a translucent layer inherits character from whatever lies behind it, making it unreliable across different backgrounds.
