import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type Status = "SAFE" | "EXCURSION";

type Reading = {
  time: string;
  value: number;
};

type FieldLogMeta = {
  logId: string;
  box: string;
  product: string;
  batch: string;
  doses: string;
  range: string;
  started: string;
  route: string;
};

type LedgerRow = {
  sequence: string;
  event: string;
  time: string;
  status: string;
};

const seedReadings: Reading[] = [
  { time: "14:06", value: 4.6 },
  { time: "14:08", value: 4.8 },
  { time: "14:10", value: 4.7 },
  { time: "14:12", value: 4.9 },
  { time: "14:14", value: 4.8 },
  { time: "14:16", value: 4.8 },
  { time: "14:18", value: 4.7 },
  { time: "14:20", value: 4.8 },
];

const ledgerRows: LedgerRow[] = [
  { sequence: "042", event: "TEMPERATURE_READING", time: "14:20:02", status: "VALID" },
  { sequence: "041", event: "TEMPERATURE_READING", time: "14:10:02", status: "VALID" },
  { sequence: "040", event: "TEMPERATURE_READING", time: "14:00:02", status: "VALID" },
];

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function toChartY(value: number, height: number): number {
  const raw = height - ((value - 2) / 6) * height;
  return Math.min(height, Math.max(0, raw));
}

type ColdChainValue = {
  temperature: number;
  status: Status;
  isMonitoring: boolean;
  setIsMonitoring: (v: boolean | ((prev: boolean) => boolean)) => void;
  readings: Reading[];
  chartPath: string;
  fieldLogMeta: FieldLogMeta;
  ledgerRows: LedgerRow[];
  toChartY: (value: number, height: number) => number;
};

const ColdChainContext = createContext<ColdChainValue | null>(null);

export function ColdChainProvider({ children }: { children: ReactNode }) {
  const [isMonitoring, setIsMonitoring] = useState(true);
  const [temperature, setTemperature] = useState(4.8);
  const [readings, setReadings] = useState<Reading[]>(seedReadings);
  const status: Status = temperature < 2 || temperature > 8 ? "EXCURSION" : "SAFE";

  const fieldLogMeta = useMemo<FieldLogMeta>(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return {
      logId: `FIELD LOG / ${y}-${m}${d}-00124`,
      box: "VCC-BOX-001",
      product: "IPV Polio Vaccine",
      batch: `VAC-${y}${m}${d}-A124`,
      doses: "250 units",
      range: "02.0\u201308.0 \u00B0C",
      started: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }),
      route: "DELHI \u2192 JAIPUR",
    };
  }, []);

  useEffect(() => {
    if (!isMonitoring) return undefined;

    const interval = window.setInterval(() => {
      setTemperature((previous) => {
        const next = previous + (Math.random() - 0.5) * 0.24;
        const nextTemperature = Math.min(8.5, Math.max(1.5, Number(next.toFixed(1))));
        setReadings((current) => [
          ...current.slice(-7),
          { time: formatTime(new Date()), value: nextTemperature },
        ]);
        return nextTemperature;
      });
    }, 2000);

    return () => window.clearInterval(interval);
  }, [isMonitoring]);

  const chartPath = useMemo(() => {
    const width = 720;
    const height = 190;
    return readings
      .map((reading, index) => {
        const x = (index / Math.max(readings.length - 1, 1)) * width;
        const y = toChartY(reading.value, height);
        return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  }, [readings]);

  const value = useMemo<ColdChainValue>(
    () => ({
      temperature,
      status,
      isMonitoring,
      setIsMonitoring,
      readings,
      chartPath,
      fieldLogMeta,
      ledgerRows,
      toChartY,
    }),
    [temperature, status, isMonitoring, readings, chartPath, fieldLogMeta],
  );

  return <ColdChainContext.Provider value={value}>{children}</ColdChainContext.Provider>;
}

export function useColdChain(): ColdChainValue {
  const ctx = useContext(ColdChainContext);
  if (!ctx) throw new Error("useColdChain must be used within ColdChainProvider");
  return ctx;
}
