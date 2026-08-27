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
import { buildChartPath, statusFor, type Status } from "@/lib/chart";
import {
  appendEntry,
  parseChain,
  verifyChain,
  type ChainVerification,
  type LedgerEntry,
  type LedgerEventType,
  type ParsedChain,
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

const SEED_TEMPERATURE = 4.8;
const SAMPLES_PER_LEDGER_APPEND = Math.max(1, Math.round(LEDGER_INTERVAL_MS / SAMPLE_INTERVAL_MS));

/** Event types surfaced in the notification bell. */
const NOTIFIABLE_EVENTS: readonly LedgerEventType[] = [
  "EXCURSION_OPEN",
  "EXCURSION_CLEAR",
  "HANDOFF_INIT",
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
    value = nextTemperature(value, randomDrift());
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
  recordHandoff: () => void;
  ledger: LedgerEntry[];
  chainVerification: ChainVerification;
  /** Stored entries that were unreadable on load — non-zero means data loss. */
  discardedEntryCount: number;
  notifications: LedgerEntry[];
  unreadNotificationCount: number;
  markNotificationsRead: () => void;
};

const ColdChainContext = createContext<ColdChainValue | null>(null);

export function ColdChainProvider({ children }: { children: ReactNode }) {
  const [isMonitoring, setIsMonitoring] = useState(true);
  const [readings, setReadings] = useState<Reading[]>(() => seedReadings(new Date()));

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

  const appendLedger = useCallback((event: LedgerEventType, detail: string, at: Date) => {
    setLedger((previous) => appendEntry(previous, event, detail, at));
  }, []);

  useEffect(() => {
    writeStorage(FIELD_LOG_KEY, fieldLogMeta);
  }, [fieldLogMeta]);

  useEffect(() => {
    writeStorage(LEDGER_KEY, ledger);
  }, [ledger]);

  useEffect(() => {
    writeStorage(NOTIFICATIONS_SEEN_KEY, notificationsSeen);
  }, [notificationsSeen]);

  useEffect(() => {
    if (!isMonitoring) return undefined;

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
        appendLedger(
          nextStatus === "EXCURSION" ? "EXCURSION_OPEN" : "EXCURSION_CLEAR",
          `${value.toFixed(1)} °C — ${movement} safe corridor`,
          at,
        );
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
  }, [isMonitoring, appendLedger]);

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

    // The trail is append-only: a new shipment opens a new record on the same
    // chain rather than erasing what came before.
    appendLedger("SHIPMENT_CREATE", describeShipment(next), now);
  }, [appendLedger]);

  const recordHandoff = useCallback(() => {
    const now = new Date();
    setFieldLogMeta({ ...fieldLogMeta, handedOffAt: now.toISOString() });
    appendLedger("HANDOFF_INIT", `Handoff confirmed — ${fieldLogMeta.route}`, now);
  }, [appendLedger, fieldLogMeta]);

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
      recordHandoff,
      ledger,
      chainVerification,
      discardedEntryCount: storedChain.discarded,
      notifications,
      unreadNotificationCount,
      markNotificationsRead,
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
      recordHandoff,
      ledger,
      chainVerification,
      storedChain.discarded,
      notifications,
      unreadNotificationCount,
      markNotificationsRead,
    ],
  );

  return <ColdChainContext.Provider value={value}>{children}</ColdChainContext.Provider>;
}

export function useColdChain(): ColdChainValue {
  const context = useContext(ColdChainContext);
  if (!context) throw new Error("useColdChain must be used within ColdChainProvider");
  return context;
}
