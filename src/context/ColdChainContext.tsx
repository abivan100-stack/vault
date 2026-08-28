import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { buildChartPath, clampToCorridor, statusFor, type Status } from "@/lib/chart";
import {
  appendEntry,
  coveredExcursionSequences,
  deriveInvestigationState,
  hasInvestigationEvidence,
  investigationPointerMatches,
  isPersistedInvestigationPointer,
  parseChain,
  resolutionReasonLabel,
  verifyChain,
  type ChainVerification,
  type InvestigationState,
  type LedgerEntry,
  type LedgerEventType,
  type ParsedChain,
  type PersistedInvestigationPointer,
  type ResolutionReason,
} from "@/lib/ledger";
import {
  boxSerial,
  createFieldLog,
  normalizeFieldLog,
  randomSerial,
  type FieldLogMeta,
} from "@/lib/shipment";
import {
  LEDGER_INTERVAL_MS,
  READING_WINDOW,
  SAMPLE_INTERVAL_MS,
  nextTemperature,
  pushReading,
  randomDrift,
  type Reading,
} from "@/lib/simulation";

export type { FieldLogMeta } from "@/lib/shipment";

const FIELD_LOG_KEY = "vault:fieldLog";
const LEDGER_KEY = "vault:ledger";
const NOTIFICATIONS_SEEN_KEY = "vault:notificationsSeen";
/**
 * Last-known Investigation status, persisted separately from the ledger.
 *
 * `ledger` in storage is capped at MAX_LEDGER_ENTRIES, so a long-open
 * Investigation's anchor entry (and even the shipment's SHIPMENT_CREATE) can
 * age out of the retained window entirely. When that happens the window has
 * no evidence either way, and this is the only thing that remembers the
 * shipment was still Under Investigation. It is a cache of a ledger-recorded
 * fact, not a competing source of truth: whenever the retained window does
 * contain evidence, that evidence wins (see hasInvestigationEvidence).
 */
const OPEN_INVESTIGATION_KEY = "vault:openInvestigation";

const SEED_TEMPERATURE = 4.8;
const SAMPLES_PER_LEDGER_APPEND = Math.max(1, Math.round(LEDGER_INTERVAL_MS / SAMPLE_INTERVAL_MS));
const VAULT_API_URL = "http://127.0.0.1:8787";
const VAULT_API_SHIPMENT_ID = "TEST-01";
const VAULT_API_DEVICE_ID = "esp32-vault-01";

export type AlarmAcknowledgementState = "NONE" | "UNACKNOWLEDGED" | "PENDING" | "CONFIRMED";

/** Event types surfaced in the notification bell. */
const NOTIFIABLE_EVENTS: readonly LedgerEventType[] = [
  "EXCURSION_OPEN",
  "EXCURSION_CLEAR",
  "HANDOFF_INIT",
  "INVESTIGATION_OPEN",
  "INVESTIGATION_RESOLVED",
];

/** Nothing is stored under the key (or storage is unavailable). */
const ABSENT = Symbol("absent");
/** Something is stored under the key, but it could not be parsed. */
const CORRUPT = Symbol("corrupt");

/**
 * Reads and parses a stored value.
 *
 * Absence and emptiness are distinct results and must not collapse: a stored
 * literal `null` parses to `null`, which is a value someone wrote, whereas a
 * missing key is a value nobody ever wrote. Returning `null` for both let a
 * stored value be overwritten while the UI reported the fresh chain as
 * verified.
 */
function readStorage(key: string): unknown {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    // Storage unavailable (private mode) — nothing was stored to lose.
    return ABSENT;
  }
  if (raw === null) return ABSENT;
  try {
    return JSON.parse(raw);
  } catch {
    return CORRUPT;
  }
}

/**
 * Copies a stored value aside before it is overwritten.
 *
 * The ledger is meant to be evidence. Replacing an unreadable or partially
 * malformed chain with a fresh one would destroy whatever was left of it, so
 * the raw text is preserved under a sibling key first.
 */
function quarantineStorage(key: string): void {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw !== null) window.localStorage.setItem(`${key}.corrupt`, raw);
  } catch {
    // Nothing further to do if storage is unavailable.
  }
}

function writeStorage(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable — the session still works in memory.
  }
}

/**
 * Back-fills the chart window so the console opens on a running corridor
 * rather than a single dot. Timestamps are real and spaced at the true
 * sampling cadence; only the values are simulated.
 */
function seedReadings(now: Date): Reading[] {
  const readings: Reading[] = [];
  let value = SEED_TEMPERATURE;
  for (let i = READING_WINDOW - 1; i >= 0; i -= 1) {
    value = clampToCorridor(nextTemperature(value, randomDrift()));
    readings.push({
      id: READING_WINDOW - 1 - i,
      at: new Date(now.getTime() - i * SAMPLE_INTERVAL_MS).toISOString(),
      value,
    });
  }
  return readings;
}

function describeShipment(meta: FieldLogMeta): string {
  return `${meta.box} / ${meta.batch} / ${meta.doses}`;
}

/** Fields an operator can edit, and which therefore need an audit trail. */
const AUDITED_FIELDS: readonly (keyof FieldLogMeta)[] = [
  "box",
  "product",
  "batch",
  "doses",
  "range",
  "route",
];

/**
 * Before/after for every field that actually changed.
 *
 * Recording a fixed summary instead would leave an edit to the product,
 * corridor or route logged as a shipment update with no auditable value.
 */
function describeChanges(previous: FieldLogMeta, next: FieldLogMeta): string {
  const changes = AUDITED_FIELDS.filter((field) => previous[field] !== next[field]).map(
    (field) => `${field}: ${String(previous[field])} → ${String(next[field])}`,
  );
  return changes.length > 0 ? changes.join("; ") : "No field changed";
}

type ColdChainValue = {
  temperature: number;
  status: Status;
  isMonitoring: boolean;
  setIsMonitoring: (value: boolean | ((previous: boolean) => boolean)) => void;
  readings: Reading[];
  chartPath: string;
  /** ISO instant of the most recent sample. */
  lastSyncAt: string | null;
  /** Whole seconds until the next ledger append. */
  secondsUntilLedgerAppend: number;
  fieldLogMeta: FieldLogMeta;
  updateFieldLog: (patch: Partial<FieldLogMeta>) => void;
  resetFieldLog: () => void;
  createNewShipment: () => void;
  simulateExcursion: (direction: "hot" | "cold") => void;
  recordHandoff: () => void;
  ledger: LedgerEntry[];
  chainVerification: ChainVerification;
  /** Stored entries that were unreadable on load — non-zero means data loss. */
  discardedEntryCount: number;
  /** Cleared vs Under Investigation — independent of chainVerification. */
  investigation: InvestigationState;
  resolveInvestigation: (reason: ResolutionReason, note: string) => void;
  notifications: LedgerEntry[];
  unreadNotificationCount: number;
  markNotificationsRead: () => void;
  alarmAcknowledgementState: AlarmAcknowledgementState;
  acknowledgementError: string | null;
  acknowledgeAlarm: () => Promise<void>;
};

const ColdChainContext = createContext<ColdChainValue | null>(null);

export function ColdChainProvider({ children }: { children: ReactNode }) {
  const [isMonitoring, setIsMonitoring] = useState(true);
  const [readings, setReadings] = useState<Reading[]>(() => seedReadings(new Date()));
  const [liveApiAvailable, setLiveApiAvailable] = useState(false);
  const [alarmAcknowledgementState, setAlarmAcknowledgementState] = useState<AlarmAcknowledgementState>("NONE");
  const [acknowledgementError, setAcknowledgementError] = useState<string | null>(null);

  const [fieldLogMeta, setFieldLogMeta] = useState<FieldLogMeta>(() => {
    const fallback = createFieldLog(new Date(), randomSerial());
    const raw = readStorage(FIELD_LOG_KEY);
    if (raw === ABSENT) return fallback;
    // A stored value that is not a usable record is about to be replaced, so
    // keep a copy of it first.
    if (raw === CORRUPT || typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      quarantineStorage(FIELD_LOG_KEY);
      return fallback;
    }
    return normalizeFieldLog(raw, fallback);
  });

  // Parsed once, up front: the discarded count is evidence of tampering or a
  // truncated write, and is lost if the chain is simply re-read later.
  const [storedChain] = useState(() => {
    const raw = readStorage(LEDGER_KEY);
    let parsed: ParsedChain;
    if (raw === ABSENT) {
      parsed = { entries: [], discarded: 0 };
    } else if (raw === CORRUPT) {
      parsed = { entries: [], discarded: 1 };
    } else {
      // Anything that reaches here was genuinely written by someone, so a value
      // that is not a chain counts as a discard rather than an empty start.
      parsed = parseChain(raw);
    }
    // Anything we are about to drop gets preserved before the persistence
    // effect writes the cleaned chain back over it.
    if (parsed.discarded > 0) quarantineStorage(LEDGER_KEY);
    return parsed;
  });

  const [ledger, setLedger] = useState<LedgerEntry[]>(() => {
    if (storedChain.entries.length > 0) return storedChain.entries;
    return appendEntry([], "SHIPMENT_CREATE", "Corridor opened", new Date());
  });

  const [notificationsSeen, setNotificationsSeen] = useState<number>(() => {
    const stored = readStorage(NOTIFICATIONS_SEEN_KEY);
    return typeof stored === "number" && Number.isFinite(stored) ? stored : 0;
  });

  // Read the investigation pointer once, before the persistence effect can
  // overwrite it. Invalid or stale bytes are evidence too: preserve them
  // beside the live key rather than silently replacing the only surviving
  // record with a cleared state.
  const [storedInvestigation] = useState<PersistedInvestigationPointer | null>(() => {
    const raw = readStorage(OPEN_INVESTIGATION_KEY);
    if (raw === ABSENT || raw === null) return null;
    if (raw === CORRUPT || !isPersistedInvestigationPointer(raw)) {
      quarantineStorage(OPEN_INVESTIGATION_KEY);
      return null;
    }
    return raw;
  });

  const [secondsUntilLedgerAppend, setSecondsUntilLedgerAppend] = useState(
    Math.round(LEDGER_INTERVAL_MS / 1000),
  );

  const temperature = readings.length > 0 ? readings[readings.length - 1].value : SEED_TEMPERATURE;
  const status = statusFor(temperature);

  // Mutable simulation cursors. Kept in refs so the interval callback can read
  // and advance them without re-subscribing, and so nothing impure ever runs
  // inside a state updater (React 18 StrictMode invokes updaters twice).
  const nextReadingIdRef = useRef(readings.length);
  const latestValueRef = useRef(temperature);
  const statusRef = useRef<Status>(status);
  const sampleCountRef = useRef(0);
  const nextLedgerSequenceRef = useRef(
    ledger.length > 0 ? ledger[ledger.length - 1].sequence + 1 : 1,
  );
  // Real state, not derived from `ledger` on every render: `ledger` is capped
  // at MAX_LEDGER_ENTRIES, so an old INVESTIGATION_OPEN can slide out of the
  // retained window while still logically open, and rescanning from scratch
  // each render would then silently report Cleared. Instead this only
  // transitions at the three moments that actually open, resolve, or reset
  // an Investigation (see the effect below and createNewShipment), so it
  // naturally carries forward across everything in between.
  const [investigation, setInvestigation] = useState<InvestigationState>(() => {
    const scanned = deriveInvestigationState(ledger);
    if (storedInvestigation && !investigationPointerMatches(storedInvestigation, ledger, fieldLogMeta.logId)) {
      quarantineStorage(OPEN_INVESTIGATION_KEY);
      return scanned;
    }
    if (hasInvestigationEvidence(ledger)) return scanned;
    // The retained window has nothing to say about Cleared vs Under
    // Investigation at all — fall back to the separately persisted pointer
    // rather than defaulting to Cleared, which would silently drop a still-
    // open Investigation the moment its evidence aged out.
    if (storedInvestigation) return { status: "UNDER_INVESTIGATION", openEntry: storedInvestigation.openEntry };
    return scanned;
  });

  // Keep the complete set of excursions covered by the open Investigation.
  // Unlike a scan of `ledger`, this survives the retained-window cap and is
  // persisted alongside the investigation pointer.
  const coveredExcursionsRef = useRef<number[]>(
    storedInvestigation && investigationPointerMatches(storedInvestigation, ledger, fieldLogMeta.logId)
      ? [...(storedInvestigation.coveredExcursionSequences ?? [])]
      : investigation.openEntry
        ? coveredExcursionSequences(ledger, investigation.openEntry.sequence - 1)
        : [],
  );

  // Mirrors whether an Investigation is currently open, read/written
  // synchronously inside the interval callback so a run of excursions within
  // the same render cycle is absorbed rather than each opening its own
  // Investigation. Seeded from `investigation` above (not a fresh
  // `deriveInvestigationState(ledger)` scan) so it agrees with the same
  // evidence-aged-out fallback — otherwise a reload after a long-open
  // Investigation's anchor slid out of the window would leave this false
  // while the UI still (correctly) shows Under Investigation, and the next
  // excursion would open a second, unrelated Investigation.
  const investigationOpenRef = useRef(investigation.openEntry !== null);
  // Highest ledger sequence already accounted for by the render-time
  // adjustment below, so it can scan forward from there rather than just the
  // newest entry — see there for why the newest entry alone isn't enough.
  const [lastScannedSequence, setLastScannedSequence] = useState(
    ledger.length > 0 ? ledger[ledger.length - 1].sequence : 0,
  );

  const appendLedger = useCallback((event: LedgerEventType, detail: string, at: Date): number => {
    const sequence = nextLedgerSequenceRef.current;
    nextLedgerSequenceRef.current += 1;
    setLedger((previous) => appendEntry(previous, event, detail, at));
    return sequence;
  }, []);

  useEffect(() => {
    writeStorage(FIELD_LOG_KEY, fieldLogMeta);
  }, [fieldLogMeta]);

  useEffect(() => {
    writeStorage(LEDGER_KEY, ledger);
  }, [ledger]);

  // Adjusts `investigation` during render when `ledger` has changed since the
  // last render, following React's "adjusting state when a prop changes"
  // pattern rather than an effect — an effect would run a render late and
  // cascade an extra commit. Scans every entry with a sequence after
  // `lastScannedSequence`, not just the newest one: a single interval tick
  // can append EXCURSION_OPEN, INVESTIGATION_OPEN and TEMPERATURE_READING
  // together (a breach coinciding with the 10s ledger-append cadence), and
  // TEMPERATURE_READING — the actual newest entry in that batch — carries no
  // Investigation transition, which would hide the one from INVESTIGATION_OPEN
  // entirely. This is immune to older entries sliding out of the
  // MAX_LEDGER_ENTRIES window: only entries newer than the last scan matter,
  // regardless of what else has fallen off the front of the array.
  const newestSequence = ledger.length > 0 ? ledger[ledger.length - 1].sequence : 0;
  if (newestSequence !== lastScannedSequence) {
    setLastScannedSequence(newestSequence);
    for (const entry of ledger) {
      if (entry.sequence <= lastScannedSequence) continue;
      if (entry.event === "INVESTIGATION_OPEN") {
        setInvestigation({ status: "UNDER_INVESTIGATION", openEntry: entry });
        // An Investigation cannot span a SHIPMENT_CREATE — see
        // deriveInvestigationState's docstring in ledger.ts.
      } else if (entry.event === "INVESTIGATION_RESOLVED" || entry.event === "SHIPMENT_CREATE") {
        setInvestigation({ status: "CLEARED", openEntry: null });
      }
    }
  }

  useEffect(() => {
    writeStorage(NOTIFICATIONS_SEEN_KEY, notificationsSeen);
  }, [notificationsSeen]);

  useEffect(() => {
    const pointer = investigation.openEntry
      ? {
          openEntry: investigation.openEntry,
          shipmentKey: fieldLogMeta.logId,
          ledgerHeadHash: ledger.length > 0 ? ledger[ledger.length - 1].hash : "0".repeat(64),
          coveredExcursionSequences: [...coveredExcursionsRef.current],
        }
      : null;
    writeStorage(OPEN_INVESTIGATION_KEY, pointer);
  }, [fieldLogMeta.logId, investigation, ledger]);

  useEffect(() => {
    if (!isMonitoring || liveApiAvailable) return undefined;

    const interval = window.setInterval(() => {
      // Every impure step happens here, outside the state updaters below.
      const at = new Date();
      const value = nextTemperature(latestValueRef.current, randomDrift());
      latestValueRef.current = value;

      const reading: Reading = { id: nextReadingIdRef.current, at: at.toISOString(), value };
      nextReadingIdRef.current += 1;
      setReadings((previous) => pushReading(previous, reading));

      const nextStatus = statusFor(value);
      if (nextStatus !== statusRef.current) {
        statusRef.current = nextStatus;
        const movement = nextStatus === "EXCURSION" ? "left" : "back inside";
        const excursionSequence = appendLedger(
          nextStatus === "EXCURSION" ? "EXCURSION_OPEN" : "EXCURSION_CLEAR",
          `${value.toFixed(1)} °C — ${movement} safe corridor`,
          at,
        );

        // A breach opens an Investigation automatically. While one is already
        // open, further breaches are absorbed into it rather than opening a
        // second — the operator is already on the hook for one unresolved
        // problem, not a new one per alarm.
        if (nextStatus === "EXCURSION") {
          coveredExcursionsRef.current = Array.from(
            new Set([...coveredExcursionsRef.current, excursionSequence]),
          );
          if (!investigationOpenRef.current) {
            investigationOpenRef.current = true;
            appendLedger(
              "INVESTIGATION_OPEN",
              `Investigation opened — triggered by excursion at ${value.toFixed(1)} °C`,
              at,
            );
          }
        }
      }

      sampleCountRef.current += 1;
      const samplesIntoCycle = sampleCountRef.current % SAMPLES_PER_LEDGER_APPEND;
      if (samplesIntoCycle === 0) {
        appendLedger("TEMPERATURE_READING", `${value.toFixed(1)} °C`, at);
      }
      const samplesRemaining = SAMPLES_PER_LEDGER_APPEND - samplesIntoCycle;
      setSecondsUntilLedgerAppend(Math.round((samplesRemaining * SAMPLE_INTERVAL_MS) / 1000));
    }, SAMPLE_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [isMonitoring, liveApiAvailable, appendLedger]);

  // These three read the current record from the closure rather than from an
  // updater argument. Appending to the ledger is a side effect, and a state
  // updater must stay pure — React 18 StrictMode invokes it twice, which would
  // write two ledger entries (and two notifications) per user action.
  const updateFieldLog = useCallback(
    (patch: Partial<FieldLogMeta>) => {
      const next = { ...fieldLogMeta, ...patch };
      setFieldLogMeta(next);
      appendLedger("SHIPMENT_UPDATE", describeChanges(fieldLogMeta, next), new Date());
    },
    [appendLedger, fieldLogMeta],
  );

  const resetFieldLog = useCallback(() => {
    const at = new Date();
    const defaults = createFieldLog(at, boxSerial(fieldLogMeta.box));
    // Reset restores the editable fields only. It must not rewrite the
    // shipment's identity or its history: taking createFieldLog wholesale
    // cleared handedOffAt, which reopened a completed shipment as in-transit
    // and allowed a second handoff with no reversal ever recorded.
    const next: FieldLogMeta = {
      ...defaults,
      logId: fieldLogMeta.logId,
      box: fieldLogMeta.box,
      startedAt: fieldLogMeta.startedAt,
      handedOffAt: fieldLogMeta.handedOffAt,
    };
    setFieldLogMeta(next);
    appendLedger("SHIPMENT_UPDATE", `Reset to defaults — ${describeChanges(fieldLogMeta, next)}`, at);
  }, [appendLedger, fieldLogMeta]);

  const createNewShipment = useCallback(() => {
    const now = new Date();
    const next = createFieldLog(now, randomSerial());
    setFieldLogMeta(next);

    const seeded = seedReadings(now);
    nextReadingIdRef.current = seeded.length;
    latestValueRef.current = seeded[seeded.length - 1].value;
    statusRef.current = statusFor(latestValueRef.current);
    sampleCountRef.current = 0;
    setReadings(seeded);
    setSecondsUntilLedgerAppend(Math.round(LEDGER_INTERVAL_MS / 1000));

    // An Investigation cannot span a SHIPMENT_CREATE (deriveInvestigationState
    // in ledger.ts, and the render-time adjustment above, both encode this),
    // so `investigation` resets on its own once this append lands. Only the
    // interval callback's synchronous ref guard needs resetting here.
    investigationOpenRef.current = false;
    coveredExcursionsRef.current = [];

    // The trail is append-only: a new shipment opens a new record on the same
    // chain rather than erasing what came before.
    appendLedger("SHIPMENT_CREATE", describeShipment(next), now);
  }, [appendLedger]);

  const simulateExcursion = useCallback(
    (direction: "hot" | "cold") => {
      const at = new Date();
      const value = direction === "hot" ? 8.4 : 1.6;
      const reading: Reading = { id: nextReadingIdRef.current, at: at.toISOString(), value };
      nextReadingIdRef.current += 1;
      latestValueRef.current = value;
      statusRef.current = "EXCURSION";
      setReadings((previous) => pushReading(previous, reading));

      const excursionSequence = appendLedger(
        "EXCURSION_OPEN",
        `${value.toFixed(1)} °C — simulated ${direction} excursion`,
        at,
      );
      coveredExcursionsRef.current = Array.from(
        new Set([...coveredExcursionsRef.current, excursionSequence]),
      );
      if (!investigationOpenRef.current) {
        investigationOpenRef.current = true;
        appendLedger("INVESTIGATION_OPEN", `Investigation opened — simulated excursion at ${value.toFixed(1)} °C`, at);
      }
    },
    [appendLedger],
  );

  const recordHandoff = useCallback(() => {
    const now = new Date();
    setFieldLogMeta({ ...fieldLogMeta, handedOffAt: now.toISOString() });
    appendLedger("HANDOFF_INIT", `Handoff confirmed — ${fieldLogMeta.route}`, now);
  }, [appendLedger, fieldLogMeta]);

  // Resolving requires an explicit human action with a reason and a note —
  // the temperature returning to range proves the corridor recovered, not
  // that anyone reviewed why it left it, so nothing here auto-resolves.
  const resolveInvestigation = useCallback(
    (reason: ResolutionReason, note: string) => {
      const trimmedNote = note.trim();
      if (!trimmedNote) return;
      // Reads current `investigation` state, not a fresh scan of `ledger`:
      // the entry that opened this Investigation may already have slid out
      // of the retained window, and a fresh scan would find nothing to
      // resolve.
      const openEntry = investigation.openEntry;
      if (!openEntry) return;

      const covered = [...new Set(coveredExcursionsRef.current)].sort((a, b) => a - b);
      const coveredLabel =
        covered.length > 0
          ? `covered excursion${covered.length > 1 ? "s" : ""} ${covered.map((sequence) => `#${sequence}`).join(", ")}`
          : "covered no further excursions";

      appendLedger(
        "INVESTIGATION_RESOLVED",
        `${resolutionReasonLabel(reason)} — ${trimmedNote} — ${coveredLabel}`,
        new Date(),
      );
      // The ledger-tail effect will also flip `investigation` to Cleared once
      // this INVESTIGATION_RESOLVED entry lands, but the interval callback's
      // guard is a plain ref and must be reset here, synchronously.
      investigationOpenRef.current = false;
      coveredExcursionsRef.current = [];
    },
    [appendLedger, investigation],
  );

  const chartPath = useMemo(
    () => buildChartPath(readings.map((reading) => reading.value)),
    [readings],
  );

  const chainVerification = useMemo(() => verifyChain(ledger), [ledger]);

  const notifications = useMemo(
    () => ledger.filter((entry) => NOTIFIABLE_EVENTS.includes(entry.event)).slice(-20).reverse(),
    [ledger],
  );

  const unreadNotificationCount = useMemo(
    () => notifications.filter((entry) => entry.sequence > notificationsSeen).length,
    [notifications, notificationsSeen],
  );

  const markNotificationsRead = useCallback(() => {
    const newest = notifications.length > 0 ? notifications[0].sequence : 0;
    setNotificationsSeen((previous) => Math.max(previous, newest));
  }, [notifications]);

  const acknowledgeAlarm = useCallback(async () => {
    setAcknowledgementError(null);
    const response = await fetch(`${VAULT_API_URL}/api/alarms/acknowledge`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shipmentId: VAULT_API_SHIPMENT_ID, deviceId: VAULT_API_DEVICE_ID }),
    });
    const payload = (await response.json()) as { acknowledgementState?: AlarmAcknowledgementState; error?: string };
    if (!response.ok) {
      const message = payload.error || "Could not request the hardware acknowledgement.";
      setAcknowledgementError(message);
      throw new Error(message);
    }
    setAlarmAcknowledgementState(payload.acknowledgementState || "PENDING");
  }, []);

  // Prefer real ESP32 readings whenever the API is reachable. The local
  // simulator remains available as a fallback for offline demos.
  useEffect(() => {
    let cancelled = false;
    const syncFromApi = async () => {
      try {
        const response = await fetch(
          `${VAULT_API_URL}/api/readings?shipmentId=${encodeURIComponent(VAULT_API_SHIPMENT_ID)}`,
        );
        if (!response.ok) throw new Error("API request failed");
        const payload = (await response.json()) as {
          readings?: Array<{ id: number; temperature: number; recorded_at: string }>;
        };
        const alarmResponse = await fetch(
          `${VAULT_API_URL}/api/alarms/status?shipmentId=${encodeURIComponent(VAULT_API_SHIPMENT_ID)}&deviceId=${encodeURIComponent(VAULT_API_DEVICE_ID)}`,
        );
        if (!alarmResponse.ok) throw new Error("Alarm state request failed");
        const alarm = (await alarmResponse.json()) as { acknowledgementState?: AlarmAcknowledgementState };
        if (!cancelled) setAlarmAcknowledgementState(alarm.acknowledgementState || "NONE");
        const incoming = (payload.readings || [])
          .filter((item) => Number.isFinite(item.temperature) && Boolean(item.recorded_at))
          .slice(-READING_WINDOW)
          .map((item) => ({ id: item.id, at: item.recorded_at, value: item.temperature }));
        if (cancelled || incoming.length === 0) return;
        const latest = incoming[incoming.length - 1];
        latestValueRef.current = latest.value;
        statusRef.current = statusFor(latest.value);
        nextReadingIdRef.current = latest.id + 1;
        setReadings(incoming);
        setLiveApiAvailable(true);
      } catch {
        if (!cancelled) setLiveApiAvailable(false);
      }
    };
    void syncFromApi();
    const interval = window.setInterval(() => void syncFromApi(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const lastSyncAt = readings.length > 0 ? readings[readings.length - 1].at : null;

  const value = useMemo<ColdChainValue>(
    () => ({
      temperature,
      status,
      isMonitoring,
      setIsMonitoring,
      readings,
      chartPath,
      lastSyncAt,
      secondsUntilLedgerAppend,
      fieldLogMeta,
      updateFieldLog,
      resetFieldLog,
      createNewShipment,
      simulateExcursion,
      recordHandoff,
      ledger,
      chainVerification,
      discardedEntryCount: storedChain.discarded,
      investigation,
      resolveInvestigation,
      notifications,
      unreadNotificationCount,
      markNotificationsRead,
      alarmAcknowledgementState,
      acknowledgementError,
      acknowledgeAlarm,
    }),
    [
      temperature,
      status,
      isMonitoring,
      readings,
      chartPath,
      lastSyncAt,
      secondsUntilLedgerAppend,
      fieldLogMeta,
      updateFieldLog,
      resetFieldLog,
      createNewShipment,
      simulateExcursion,
      recordHandoff,
      ledger,
      chainVerification,
      storedChain.discarded,
      investigation,
      resolveInvestigation,
      notifications,
      unreadNotificationCount,
      markNotificationsRead,
      alarmAcknowledgementState,
      acknowledgementError,
      acknowledgeAlarm,
    ],
  );

  return <ColdChainContext.Provider value={value}>{children}</ColdChainContext.Provider>;
}

export function useColdChain(): ColdChainValue {
  const context = useContext(ColdChainContext);
  if (!context) throw new Error("useColdChain must be used within ColdChainProvider");
  return context;
}
