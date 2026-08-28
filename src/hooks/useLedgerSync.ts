import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import { useColdChain } from "@/context/ColdChainContext";
import { supabase, isBackendConfigured } from "@/lib/supabase";
import { can } from "@/lib/roles";
import { SAFE_MAX_C, SAFE_MIN_C } from "@/lib/chart";
import { isLedgerEntry, readingCelsius, verifyChain, type LedgerEntry } from "@/lib/ledger";
import { shipmentEntries } from "@/lib/report";
import {
  LEDGER_TABLE,
  SHIPMENT_TABLE,
  fromLedgerRow,
  toLedgerRow,
  toShipmentRow,
  unsyncedEntries,
  type SyncState,
} from "@/lib/sync";

/**
 * Appends the local ledger to the organisation's ledger, and raises the
 * Telegram alert when the corridor breaks.
 *
 * Two things are worth stating plainly about the direction this runs.
 *
 * The browser remains where entries are *made*. There is no server-side
 * sensor: the readings are generated here, by the simulation, in this tab. So
 * this is a push, and the server's copy is an anchor rather than a source —
 * something the writer cannot afterwards edit or remove, which is precisely
 * the guarantee the local chain could never give itself.
 *
 * The alert is raised from here too, for the same reason. Alerting from a
 * database trigger would look more robust and would be an illusion: with no
 * browser open there are no readings, so there is nothing that could have
 * excursed and gone unreported.
 */

const SHIPMENT_IDS_KEY = "vault:shipmentIds";
// Alert bookkeeping lives in localStorage rather than in a ref. A ref is per
// tab and per page load, and both of those are wrong: two tabs on the same
// organisation would each announce the same excursion, and a reload after a
// successful upload but a failed Telegram call would forget the alert was
// ever owed -- the entry is on the server by then, so nothing would put it
// back in a later batch.
//
// This is same-browser only. Two devices can still duplicate an alert; that
// needs a server-side record and is not something a client can settle.
// This browser's chain identity. The local ledger is one chain among an
// organisation's several, and the server needs to know which one it is
// looking at to sequence it independently of the others.
const CHAIN_ID_KEY = "vault:chainId";
const ALERTED_KEY = "vault:alertedExcursions";
const OWED_KEY = "vault:owedExcursionAlerts";

/** How long to wait after the last append before pushing. */
const DEBOUNCE_MS = 1_500;

function readShipmentIds(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(SHIPMENT_IDS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "string") out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function readChainId(): string {
  try {
    const existing = window.localStorage.getItem(CHAIN_ID_KEY);
    if (existing) return existing;
    const minted = crypto.randomUUID();
    window.localStorage.setItem(CHAIN_ID_KEY, minted);
    return minted;
  } catch {
    // Storage refused. A per-session id still keeps this chain apart from
    // other browsers' -- it just will not be recognised again after a
    // reload, which costs a re-upload and never a collision.
    return crypto.randomUUID();
  }
}

function readAlerted(): Set<string> {
  try {
    // Inside the try for the same reason as readOwed.
    const raw = window.localStorage.getItem(ALERTED_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((key): key is string => typeof key === "string"));
  } catch {
    return new Set();
  }
}

function writeAlerted(keys: Set<string>): void {
  try {
    window.localStorage.setItem(ALERTED_KEY, JSON.stringify([...keys]));
  } catch {
    // Storage can be full or refused. Losing the record costs a duplicate
    // alert, never a missing one, so it is the safe direction to fail in.
  }
}

function preserveCorrupt(key: string, raw: string): void {
  try {
    window.localStorage.setItem(`${key}.corrupt`, raw);
  } catch {
    // Nothing further to try. The read below still refuses to trust it.
  }
}

function readOwed(): Map<string, OwedAlert> {
  let raw: string | null = null;
  try {
    // Inside the try: a browser with storage denied throws on the read
    // itself, and this runs while the hook initialises.
    raw = window.localStorage.getItem(OWED_KEY);
  } catch {
    return new Map();
  }
  try {
    if (!raw) return new Map();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      // Copied aside before it is dropped. This is the only record that a
      // Telegram alert is still owed, and discarding it silently is how an
      // excursion goes unannounced with nothing left to show for it.
      preserveCorrupt(OWED_KEY, raw);
      return new Map();
    }
    const out = new Map<string, OwedAlert>();
    for (const item of parsed as unknown[]) {
      const record = item as Partial<OwedAlert> & { key?: unknown };
      if (
        typeof record.key !== "string" ||
        typeof record.organisation !== "string" ||
        typeof record.box !== "string" ||
        typeof record.route !== "string" ||
        !isLedgerEntry(record.entry)
      ) {
        continue;
      }
      out.set(record.key, {
        entry: record.entry,
        organisation: record.organisation,
        box: record.box,
        route: record.route,
        // Carried across the reload, or the retry re-sends to every chat
        // that already received it.
        deliveredTo: Array.isArray(record.deliveredTo)
          ? record.deliveredTo.filter((id): id is string => typeof id === "string")
          : undefined,
      });
    }
    if (out.size < (parsed as unknown[]).length && raw) {
      // Any record that did not survive, not only a wholesale failure. Each
      // one is a Telegram alert still owed, and dropping it silently is how
      // an excursion goes unannounced with nothing left to show for it.
      preserveCorrupt(OWED_KEY, raw);
    }
    return out;
  } catch {
    if (raw) preserveCorrupt(OWED_KEY, raw);
    return new Map();
  }
}

function writeOwed(owed: Map<string, OwedAlert>): void {
  try {
    const rows = [...owed.entries()].map(([key, value]) => ({ key, ...value }));
    window.localStorage.setItem(OWED_KEY, JSON.stringify(rows));
  } catch {
    // As above: the cost is a lost retry, which the next excursion's push
    // cannot recover. Reported rather than silent.
  }
}

function writeShipmentIds(ids: Record<string, string>): void {
  try {
    window.localStorage.setItem(SHIPMENT_IDS_KEY, JSON.stringify(ids));
  } catch {
    // Storage unavailable — a fresh shipment row is created next time, which
    // is wasteful but not wrong.
  }
}

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return "unknown error";
}

export type LedgerSync = {
  state: SyncState;
  /** Pushes now rather than waiting out the debounce. */
  syncNow: () => void;
};

/**
 * An excursion that should have been announced and was not.
 *
 * The organisation and the shipment details are carried with it rather than
 * read at retry time. Replaying it against whatever organisation happens to
 * be active, with whatever shipment is on screen, would send one tenant's
 * excursion to another's chat under a third one's box number.
 */
type OwedAlert = {
  entry: LedgerEntry;
  organisation: string;
  box: string;
  route: string;
  /** Chats that already received this alert, so a retry skips them. */
  deliveredTo?: string[];
};

/**
 * Whether the server's copy could be read and believed. Three states, not a
 * boolean: unreadable and unverifiable are different failures, and both are
 * different from an organisation that genuinely holds nothing.
 */
type LoadOutcome = "OK" | "UNREADABLE" | "BROKEN";

export function useLedgerSync(): LedgerSync {
  const { user, activeOrg, role } = useAuth();
  const { ledger, fieldLogMeta, chainVerification, discardedEntryCount } = useColdChain();

  const [state, setState] = useState<SyncState>(() =>
    isBackendConfigured() ? { status: "SIGNED_OUT" } : { status: "LOCAL_ONLY" },
  );

  // Digests already on the server. A Set rather than state: it changes on
  // every push and nothing renders from it directly, so putting it in state
  // would re-render the whole tree once per sync for no visible reason.
  const syncedHashesRef = useRef<Set<string>>(new Set());
  const runningRef = useRef(false);
  const chainIdRef = useRef(readChainId());
  // The current ledger, readable from callbacks that must not re-create
  // themselves every time it grows.
  const ledgerRef = useRef<readonly LedgerEntry[]>([]);
  // Whether the server already holds rows for THIS chain. The organisation
  // holding somebody else's chain says nothing about whether this one has a
  // genesis entry up there.
  const ownChainOnServerRef = useRef(false);
  // The context a run belongs to. A sync awaits several round trips, and the
  // user can sign out or switch organisation in the middle of one; without
  // this the finished run reports SYNCED or ERROR for a context that is no
  // longer on screen.
  const contextRef = useRef("");
  // Set when a run is skipped because another was in flight. The run that was
  // already going may be answering a stale question, so the skip is
  // remembered and retried rather than dropped.
  const missedRunRef = useRef(false);
  const loadedForOrgRef = useRef<string | null>(null);
  // Excursions already announced, so a retry of a failed push cannot send the
  // same alert twice.
  const alertedHashesRef = useRef<Set<string>>(readAlerted());
  // Excursions that should have been announced and were not. Entries leave
  // the pending set as soon as the ledger upsert succeeds, so without this a
  // Telegram failure was never seen again by any later batch.
  const owedAlertsRef = useRef<Map<string, OwedAlert>>(readOwed());

  useEffect(() => {
    ledgerRef.current = ledger;
  }, [ledger]);

  const orgId = activeOrg?.id ?? null;
  const canWrite = can(role, "appendLedger");

  /**
   * Reads back the digests the organisation's ledger already holds.
   *
   * Reports what happened rather than returning quietly. A read that failed
   * and a chain that did not verify are both states in which this browser
   * cannot say what the server holds, and neither may be presented as "in
   * sync" -- with an empty local ledger, both used to look exactly like it.
   */
  const loadSyncedHashes = useCallback(async (organisation: string): Promise<LoadOutcome> => {
    if (!supabase) return "UNREADABLE";
    // The whole row, not just its hash column. A digest is only evidence
    // that an entry is on the server if the row it came from is an entry --
    // otherwise a malformed or planted row marks a local entry as synced and
    // it is never uploaded. Server rows are validated exactly like anything
    // out of localStorage.
    const { data, error } = await supabase
      .from(LEDGER_TABLE)
      .select("*")
      .eq("org_id", organisation);
    if (error || !data) {
      console.error(`could not read the organisation's ledger: ${error ? error.message : "no rows returned"}`);
      return "UNREADABLE";
    }

    const entries: LedgerEntry[] = [];
    const chainIds: string[] = [];
    let discarded = 0;
    for (const row of data as unknown[]) {
      const entry = fromLedgerRow(row);
      if (!entry) {
        discarded += 1;
        continue;
      }
      entries.push(entry);
      const chain = (row as { chain_id?: unknown }).chain_id;
      chainIds.push(typeof chain === "string" ? chain : "");
    }
    if (discarded > 0) {
      // Unreadable, not merely shorter. A row we could not parse is an entry
      // whose status we cannot determine, and the duplicate-ignoring upsert
      // will not repair it -- so this browser is in no position to say what
      // is already anchored.
      console.error(`${discarded} server ledger row(s) could not be read; the server copy cannot be trusted to say what is synced`);
      syncedHashesRef.current = new Set();
      return "UNREADABLE";
    }

    // Shape is not integrity. These digests decide what never gets uploaded
    // again, so the chain they come from is verified the same way a local one
    // is -- a row that survived parsing can still be an altered one. If the
    // server chain does not verify, none of it is evidence: treat the
    // organisation as holding nothing and let the upsert's duplicate
    // handling sort out anything that really is already there.
    // Two different questions, and they are answered over different sets.
    //
    // "Is this entry already anchored" is organisation-wide: a digest is
    // unique across the organisation, and rows written before chain_id
    // existed carry an empty one. Filtering those out would have this
    // browser re-upload them, collide on (org_id, hash), and then count them
    // as synced anyway -- leaving its own chain full of holes.
    //
    // "Does this chain verify" is per chain: sequences only mean anything
    // within one, and verifying several interleaved reports a break that is
    // not there.
    // Rows written before chain_id existed carry an empty one. If this
    // browser has no chain on the server yet but the organisation holds rows
    // this ledger recognises, those rows ARE this browser's chain under its
    // old identity -- adopt it, or the next upload starts a second chain at
    // sequence N+1 and every later load rejects it for not being rooted.
    const mine = new Set(ledgerRef.current.map((entry) => entry.hash));
    const hasOwnChain = entries.some((entry, index) => chainIds[index] === chainIdRef.current);
    ownChainOnServerRef.current = hasOwnChain;
    if (!hasOwnChain) {
      const adopted = entries.findIndex((entry) => mine.has(entry.hash));
      if (adopted >= 0) {
        chainIdRef.current = chainIds[adopted];
        ownChainOnServerRef.current = true;
        try {
          window.localStorage.setItem(CHAIN_ID_KEY, chainIdRef.current);
        } catch {
          // Kept for this session at least.
        }
      }
    }

    const byChain = new Map<string, LedgerEntry[]>();
    for (const [index, entry] of entries.entries()) {
      const chain = chainIds[index] ?? "";
      const group = byChain.get(chain);
      if (group) group.push(entry);
      else byChain.set(chain, [entry]);
    }

    for (const group of byChain.values()) {
      group.sort((a, b) => a.sequence - b.sequence);
      // Not required to start at sequence 1. A browser whose local window has
      // aged past its own genesis can only ever upload a truncated chain, and
      // refusing that left an upgraded organisation permanently unable to
      // sync. verifyChain accepts a truncated window by design -- it reports
      // a broken link, which is the thing that actually matters -- and the
      // ledger already says a chain can be intact but incomplete.
      const verification = verifyChain(group);
      if (!verification.intact) {
        console.error(
          `a server chain for this organisation did not verify (${verification.reason} at entry ${verification.brokenAt}); not trusting it to decide what is already synced`,
        );
        syncedHashesRef.current = new Set();
        return "BROKEN";
      }
    }

    syncedHashesRef.current = new Set(entries.map((entry) => entry.hash));
    return "OK";
  }, []);

  /**
   * Makes sure a row exists for the current shipment and returns its id.
   *
   * Ledger entries carry a nullable shipment reference, so a failure here
   * costs the entries their shipment link but never blocks the append. The
   * chain is the record that matters; the shipment row is a convenience.
   */
  const ensureShipment = useCallback(
    async (organisation: string, userId: string): Promise<string | null> => {
      if (!supabase) return null;
      // Keyed by organisation as well as log. The same browser shipment
      // pushed to a second organisation is a different row there, and reusing
      // the first one's id attached this organisation's entries to a shipment
      // it does not own.
      const key = `${organisation}:${fieldLogMeta.logId}`;
      const ids = readShipmentIds();
      const known = ids[key];

      const id = known ?? crypto.randomUUID();
      const row = toShipmentRow(fieldLogMeta, id, organisation, userId);
      const { error } = await supabase.from(SHIPMENT_TABLE).upsert(row, { onConflict: "id" });
      if (error) {
        // Not `known`. If the upsert failed the row may not exist, or may not
        // be usable, and handing that id back makes the ledger insert fail on
        // its foreign key -- turning a lost shipment link into a lost entry,
        // which is the opposite of what this is allowed to cost.
        console.error(`could not upsert the shipment row: ${error.message}`);
        return null;
      }

      if (!known) {
        writeShipmentIds({ ...ids, [key]: id });
      }
      return id;
    },
    [fieldLogMeta],
  );

  /**
   * Announces an excursion to the organisation's linked Telegram chats.
   *
   * Failures are swallowed on purpose. An alert that did not send is worth
   * far less than the entry that did, and letting a Telegram outage surface as
   * a ledger sync error would misreport which of the two failed.
   */
  const raiseAlerts = useCallback(
    async (organisation: string, pushed: readonly LedgerEntry[]) => {
      if (!supabase) return;
      // Keyed by organisation too: a digest is unique within an
      // organisation, not across them, and one organisation's alert must not
      // suppress another's.
      const seen = (entry: LedgerEntry) => `${organisation}:${entry.hash}`;
      // Only excursions from the shipment on screen. A delayed batch carries
      // older ones, and the only labels available here are the current box
      // and route -- announcing a closed shipment's excursion under them
      // would name the wrong shipment in the alert.
      const currentHashes = new Set(shipmentEntries(ledger).map((entry) => entry.hash));
      // An excursion from a shipment that has already closed is recorded as
      // announced rather than left owed for ever. There are no labels for it
      // here -- only the current box and route -- and naming the wrong
      // shipment in an alert is worse than not re-announcing an excursion
      // that is already on the ledger and in that shipment's report.
      for (const entry of pushed) {
        if (entry.event !== "EXCURSION_OPEN" || currentHashes.has(entry.hash)) continue;
        if (alertedHashesRef.current.has(seen(entry))) continue;
        console.warn(
          `excursion ${entry.hash.slice(0, 12)} belongs to a closed shipment and was not announced; it remains on the ledger`,
        );
        alertedHashesRef.current.add(seen(entry));
      }
      writeAlerted(alertedHashesRef.current);

      const fresh: OwedAlert[] = pushed
        .filter(
          (entry) =>
            entry.event === "EXCURSION_OPEN" &&
            currentHashes.has(entry.hash) &&
            !alertedHashesRef.current.has(seen(entry)),
        )
        .map((entry) => ({
          entry,
          organisation,
          box: fieldLogMeta.box,
          route: fieldLogMeta.route,
        }));

      // Anything still owed to THIS organisation goes first: it has waited
      // longer, and its entries are already on the server. Debts belonging to
      // another organisation are left where they are until that one syncs.
      const owed = [...owedAlertsRef.current.values()].filter(
        (candidate) => candidate.organisation === organisation,
      );
      const excursions = [...owed, ...fresh].filter(
        (candidate, index, all) =>
          all.findIndex((other) => other.entry.hash === candidate.entry.hash) === index,
      );
      if (excursions.length === 0) return;

      // Where the browser offers one, a lock makes the claim below actually
      // atomic across tabs rather than merely narrow.
      const withLock = async (run: () => Promise<void>) => {
        const locks = (navigator as Navigator & { locks?: LockManager }).locks;
        if (!locks) return run();
        return locks.request("vault:excursion-alerts", run);
      };

      for (const owedAlert of excursions) {
        const entry = owedAlert.entry;
        // Re-read immediately before sending. Two tabs each loaded the set
        // once at mount, so both could believe an excursion was unannounced
        // and both announce it; the store is the shared record and this is
        // the last moment it can be consulted.
        // Claimed before the call, not after it. Two tabs both reading an
        // empty set and then both sending is the duplicate this prevents;
        // writing first means the loser of the race sees the claim. A send
        // that then fails releases it below and becomes a debt.
        // Written before the claim below. If the tab dies between claiming
        // and sending, the claim would otherwise suppress the alert for ever
        // with no record that it was ever owed; this way the debt outlives
        // the crash and the next run retries it.
        owedAlertsRef.current.set(seen(entry), owedAlert);
        writeOwed(owedAlertsRef.current);

        let alreadyClaimed = false;
        await withLock(async () => {
          const announced = readAlerted();
          // An entry that is owed is retried even though it is claimed: the
          // claim is what stops a second tab starting it, not what says it
          // arrived.
          if (announced.has(seen(entry)) && !owedAlertsRef.current.has(seen(entry))) {
            alertedHashesRef.current = announced;
            owedAlertsRef.current.delete(seen(entry));
            writeOwed(owedAlertsRef.current);
            alreadyClaimed = true;
            return;
          }
          announced.add(seen(entry));
          alertedHashesRef.current = announced;
          writeAlerted(announced);
        });
        if (alreadyClaimed) continue;
        try {
          const { data, error } = await supabase.functions.invoke("telegram-alert", {
            body: {
              orgId: owedAlert.organisation,
              box: owedAlert.box,
              route: owedAlert.route,
              skipChatIds: owedAlert.deliveredTo ?? [],
              celsius: readingCelsius(entry) ?? Number.NaN,
              corridor: `${SAFE_MIN_C}–${SAFE_MAX_C} °C`,
              sequence: entry.sequence,
              hash: entry.hash,
              at: entry.at,
            },
          });
          // Marked only once it actually went. Marking before the call meant
          // a transient outage suppressed the retry permanently, and the
          // alert for a real excursion was simply never sent.
          // The function answers 200 for a partial send and names the
          // chats that failed in its body. Treating "no transport error" as
          // delivery marked the excursion announced while some of the
          // organisation's chats never heard about it.
          const result = data as {
            sent?: unknown;
            skipped?: unknown;
            linked?: unknown;
            results?: { chatId?: unknown; ok?: unknown }[];
          } | null;
          const sent = typeof result?.sent === "number" ? result.sent : 0;
          const skipped = typeof result?.skipped === "number" ? result.skipped : 0;
          // Absent means the function did not say, and silence is not
          // agreement: an older deployment answering without `linked` would
          // otherwise satisfy the comparison at zero and mark an excursion
          // announced that nobody was told about.
          const linked = typeof result?.linked === "number" ? result.linked : Number.POSITIVE_INFINITY;
          // Judged against how many chats the organisation actually has, as
          // the server counted them -- not against how many we asked it to
          // try. Otherwise naming every chat as already-delivered would make
          // an alert that reached nobody look complete.
          const delivered = !error && sent + skipped >= linked;

          if (delivered) {
            alertedHashesRef.current.add(seen(entry));
            owedAlertsRef.current.delete(seen(entry));
          } else {
            // Release the claim: this one is owed, not announced.
            alertedHashesRef.current.delete(seen(entry));
            writeAlerted(alertedHashesRef.current);
            // Remember which chats did receive it, so a retry does not send
            // the same alert again to the ones that already have it.
            const reached = new Set(owedAlert.deliveredTo ?? []);
            for (const row of result?.results ?? []) {
              if (row?.ok === true && typeof row.chatId === "string") reached.add(row.chatId);
            }
            owedAlertsRef.current.set(seen(entry), { ...owedAlert, deliveredTo: [...reached] });
          }
          writeAlerted(alertedHashesRef.current);
          writeOwed(owedAlertsRef.current);
        } catch {
          alertedHashesRef.current.delete(seen(entry));
          writeAlerted(alertedHashesRef.current);
          owedAlertsRef.current.set(seen(entry), owedAlert);
          writeOwed(owedAlertsRef.current);
          // Nothing to do: the excursion is on the ledger either way, and the
          // console shows it whether or not Telegram received a message. The
          // digest stays unmarked, so the next push tries again.
        }
      }
    },
    [fieldLogMeta.box, fieldLogMeta.route, ledger],
  );

  const sync = useCallback(async () => {
    // Claimed first, before every early return. A run in flight has to be
    // invalidated even by an invocation that cannot proceed -- a sign-out or
    // an organisation switch -- or it finishes believing it is current and
    // reports on a context nobody is looking at.
    const context = `${user?.id ?? "none"}:${orgId ?? "none"}`;
    contextRef.current = context;
    const stale = () => contextRef.current !== context;

    if (!supabase) {
      setState({ status: "LOCAL_ONLY" });
      return;
    }
    if (!user) {
      setState({ status: "SIGNED_OUT" });
      return;
    }
    if (!orgId) {
      setState({ status: "NO_ORGANISATION" });
      return;
    }
    if (!canWrite) {
      // A viewer's browser is not a source for the organisation's ledger, and
      // the INSERT policy would refuse it anyway. Say so rather than retrying
      // a request that is designed to fail.
      setState({ status: "READ_ONLY" });
      return;
    }
    if (!chainVerification.intact || discardedEntryCount > 0) {
      // The point of the server copy is that the writer cannot edit it
      // afterwards, which makes uploading the one thing that must not happen
      // on a chain this browser cannot vouch for. Anchoring a broken or
      // incomplete window would have the server attest to it permanently.
      setState({
        status: "ERROR",
        message: !chainVerification.intact
          ? "This browser's ledger does not verify, so nothing was uploaded."
          : "Part of this browser's ledger could not be read, so nothing was uploaded.",
        pending: ledger.length,
      });
      return;
    }
    if (runningRef.current) {
      // Do not just return: the run in flight may belong to a previous
      // organisation, and dropping this one leaves nothing to correct it.
      missedRunRef.current = true;
      return;
    }

    runningRef.current = true;
    // Declared out here so the catch below can report the real backlog. It
    // used to say zero for any failure, including one thrown before the push
    // -- which reads as "nothing is waiting" at the exact moment everything
    // is.
    let pending: readonly LedgerEntry[] = [];
    try {
      if (loadedForOrgRef.current !== orgId) {
        syncedHashesRef.current = new Set();
        const outcome = await loadSyncedHashes(orgId);
        if (outcome !== "OK") {
          // Not marked as loaded, so the next attempt reads again. Pushing on
          // top of a copy we could not read or could not verify would report
          // SYNCED for a server state nobody has confirmed -- and against a
          // broken chain, the upsert's duplicate handling would leave the
          // broken rows exactly where they are while the UI called it done.
          setState({
            status: "ERROR",
            message:
              outcome === "BROKEN"
                ? "The server's copy of this organisation's ledger did not verify. Nothing was uploaded."
                : "Could not read the server's copy of this organisation's ledger.",
            pending: ledger.length,
          });
          return;
        }
        loadedForOrgRef.current = orgId;
      }

      pending = unsyncedEntries(ledger, syncedHashesRef.current);
      if (pending.length === 0) {
        if (stale()) return;
        setState({
          status: "SYNCED",
          at: new Date().toISOString(),
          entryCount: syncedHashesRef.current.size,
        });
        // Still owed alerts get another attempt even with nothing to push.
        // Tying the retry to new entries meant a quiet shipment -- exactly
        // the one whose single excursion matters most -- never retried it.
        await raiseAlerts(orgId, []);
        return;
      }

      setState({ status: "SYNCING", pending: pending.length });

      const shipmentId = await ensureShipment(orgId, user.id);
      // Only the current shipment's entries get its id. The local chain is
      // append-only across createNewShipment, so a delayed sync carries
      // entries from shipments that closed long ago -- stamping the whole
      // batch with whatever is on screen now would file them permanently
      // against the wrong one.
      const current = new Set(shipmentEntries(ledger).map((entry) => entry.hash));
      const rows = pending.map((entry) =>
        toLedgerRow(entry, orgId, current.has(entry.hash) ? shipmentId : null, user.id, chainIdRef.current),
      );

      // Ignore duplicates rather than failing the batch: two tabs open on the
      // same organisation will each try to push the same entries, and the
      // second one is right to be a no-op.
      const { error } = await supabase
        .from(LEDGER_TABLE)
        .upsert(rows, { onConflict: "org_id,hash", ignoreDuplicates: true });

      if (error) {
        if (!stale()) {
          setState({ status: "ERROR", message: errorMessage(error), pending: pending.length });
        }
        return;
      }

      for (const entry of pending) syncedHashesRef.current.add(entry.hash);
      if (stale()) return;
      setState({
        status: "SYNCED",
        at: new Date().toISOString(),
        entryCount: syncedHashesRef.current.size,
      });

      await raiseAlerts(orgId, pending);
    } catch (error) {
      if (!stale()) {
        setState({ status: "ERROR", message: errorMessage(error), pending: pending.length });
      }
    } finally {
      runningRef.current = false;
      if (missedRunRef.current) {
        missedRunRef.current = false;
        // Scheduled rather than awaited, so this does not recurse inside its
        // own finally block.
        window.setTimeout(() => void syncRef.current?.(), 0);
      }
    }
  }, [
    user,
    orgId,
    canWrite,
    ledger,
    chainVerification,
    discardedEntryCount,
    loadSyncedHashes,
    ensureShipment,
    raiseAlerts,
  ]);

  // A sign-out or an organisation switch invalidates whatever is in flight
  // immediately, rather than when the next debounced run happens to start.
  useEffect(() => {
    contextRef.current = `${user?.id ?? "none"}:${orgId ?? "none"}`;
  }, [user, orgId]);

  // Debounced: the simulation appends a reading every ten seconds, and a
  // request per entry would be both wasteful and a poor use of a connection
  // that may be a phone's.
  useEffect(() => {
    const timer = window.setTimeout(() => void sync(), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [sync]);

  // Lets the finally block above reach the current sync without making it a
  // dependency of itself.
  const syncRef = useRef<(() => Promise<void>) | null>(null);
  useEffect(() => {
    syncRef.current = sync;
  }, [sync]);

  const syncNow = useCallback(() => {
    void sync();
  }, [sync]);

  return { state, syncNow };
}


/**
 * One sync for the session.
 *
 * The hook drives uploads and alerts, so mounting it twice means two of each:
 * two readers, two shipment upserts, two pushes, and -- on a browser with no
 * lock manager -- two Telegram alerts for one excursion. The provider runs it
 * once and the panel that displays its state reads that, rather than starting
 * a second one to look at.
 */
const LedgerSyncContext = createContext<LedgerSync | null>(null);

export function LedgerSyncProvider({ children }: { children: ReactNode }) {
  const value = useLedgerSync();
  return createElement(LedgerSyncContext.Provider, { value }, children);
}

/** The running sync's state. Read-only; nothing here starts a second one. */
export function useLedgerSyncState(): LedgerSync {
  const value = useContext(LedgerSyncContext);
  if (value) return value;
  // Outside the provider there is no sync to report on, which is the honest
  // answer rather than a thrown error for a panel that is merely early.
  return { state: { status: "LOCAL_ONLY" }, syncNow: () => {} };
}
