import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { BellOff, ChevronRight, ShieldAlert } from "lucide-react";
import { useColdChain } from "@/context/ColdChainContext";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import Stat from "@/components/Stat";
import StatusPill from "@/components/StatusPill";
import { playAnime } from "@/hooks/useAnime";
import { Button } from "@/components/ui/button";
import { acknowledgeAlarm, deviceUrl } from "@/lib/device";
import { DURATION, EASING } from "@/lib/motion";
import {
  CHART_HEIGHT,
  CHART_TICKS,
  CHART_WIDTH,
  CHART_MAX_C,
  CHART_MIN_C,
  SAFE_MAX_C,
  SAFE_MIN_C,
  isExcursion,
  toChartX,
  toChartY,
  toDomainPercent,
} from "@/lib/chart";
import { chartXLabels, formatClock, formatWindowLabel } from "@/lib/simulation";

// Transform/opacity only, no bounce — a brief emphasis, not a bounce/pulse
// loop. Fires once, only on an actual SAFE↔EXCURSION flip (see the effect
// below), never on the 2s tick.
const STATUS_TRANSITION = {
  scale: [0.92, 1],
  opacity: [0.5, 1],
  duration: DURATION.base,
  easing: EASING.out,
};

export default function MonitorPage() {
  const {
    temperature,
    status,
    readings,
    chartPath,
    lastSyncAt,
    investigation,
  } = useColdChain();
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  // Pulse the status pill (and, on an excursion, the reading itself) only on
  // an actual SAFE↔EXCURSION flip. Seeding the ref with the current status
  // means the first effect run (mount) always sees "no change" and skips —
  // so this never fires on mount, and never on the 2s tick unless `status`
  // itself changed.
  // The board's address, read once: it is build configuration, not state.
  const device = deviceUrl();
  const [acknowledging, setAcknowledging] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [ackNote, setAckNote] = useState<string | null>(null);
  // Counts breaches, so a reply can be matched to the one it was sent for.
  // State, because it changes during render when the corridor state does; the
  // ref mirrors it so a settled request can read the current value.
  const [breachId, setBreachId] = useState(0);
  const breachRef = useRef(0);
  useEffect(() => {
    breachRef.current = breachId;
  }, [breachId]);

  // Cleared whenever the corridor state changes, so a note about the last
  // breach is not still on screen describing a buzzer that has since
  // re-armed. Adjusted during render rather than in an effect: an effect
  // would set state synchronously and cascade an extra render on every tick.
  const [noteStatus, setNoteStatus] = useState(status);
  if (noteStatus !== status) {
    setNoteStatus(status);
    setAckNote(null);
    setAcknowledged(false);
    setAcknowledging(false);
    setBreachId((previous) => previous + 1);
  }

  const handleAcknowledge = async () => {
    // The breach this request belongs to. A reply that arrives after the
    // corridor was regained and broken again describes the previous alarm,
    // and showing it against the new one would say the buzzer is paused when
    // it is sounding.
    const forBreach = breachId;
    setAcknowledging(true);
    setAckNote(null);
    const result = await acknowledgeAlarm(device);
    // Only for the breach this reply belongs to. Clearing it unconditionally
    // would re-enable the button for a newer breach whose own request is
    // still out, letting two overlap. The new breach does not need clearing
    // from here: the reset above already did it when the corridor changed.
    if (breachRef.current !== forBreach) return;
    setAcknowledging(false);
    setAcknowledged(result.ok);
    setAckNote(
      result.ok
        ? "Buzzer paused on the device. It sounds again on the next breach."
        : result.message,
    );
  };

  const prevStatusRef = useRef(status);
  const statusPillRef = useRef<HTMLSpanElement>(null);
  const temperatureRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const previousStatus = prevStatusRef.current;
    prevStatusRef.current = status;
    if (previousStatus === status) return;

    playAnime(statusPillRef.current, STATUS_TRANSITION);
    if (status === "EXCURSION") {
      playAnime(temperatureRef.current, STATUS_TRANSITION);
    }
  }, [status]);

  const hoveredIndex = hoveredId === null ? -1 : readings.findIndex((r) => r.id === hoveredId);
  const hoveredReading = hoveredIndex >= 0 ? readings[hoveredIndex] : null;

  const values = readings.map((reading) => reading.value);
  const minValue = values.length > 0 ? Math.min(...values) : temperature;
  const maxValue = values.length > 0 ? Math.max(...values) : temperature;
  const excursionCount = values.filter(isExcursion).length;
  const outOfCorridor = isExcursion(temperature);

  const xLabels = chartXLabels(readings);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[21px] font-semibold tracking-[-0.02em] text-ink">Monitor</h1>
          <p className="mt-1 text-[13.5px] text-ink-muted">
            Live corridor for the box in transit. ESP32 readings sync continuously.
          </p>
        </div>
        <p className="tabular font-mono text-[12px] text-ink-subtle">
          Last sync {lastSyncAt ? formatClock(lastSyncAt) : "—"}
        </p>
      </header>

      {device !== null && status === "EXCURSION" && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-warning-line bg-warning-soft p-3.5 shadow-e1 dark:border-warning/40">
          <BellOff size={17} className="shrink-0 text-warning" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-medium text-ink">
              {acknowledged ? "Buzzer acknowledged" : "The device is sounding"}
            </p>
            <p className="mt-0.5 text-[13px] text-ink-muted">
              {ackNote ??
                "Acknowledging pauses the buzzer on the probe. It does not clear the excursion, close the investigation, or change anything on the ledger."}
            </p>
          </div>
          <Button
            onClick={handleAcknowledge}
            disabled={acknowledging}
            className="h-9 shrink-0 gap-2 text-sm"
          >
            <BellOff size={15} aria-hidden="true" />
            {acknowledging ? "Acknowledging…" : "Acknowledge"}
          </Button>
        </div>
      )}

      {investigation.status === "UNDER_INVESTIGATION" && investigation.openEntry && (
        <Link
          to="/ledger"
          className="flex items-start gap-3 rounded-lg border border-warning-line bg-warning-soft p-3.5 shadow-e1 transition-colors hover:border-warning dark:border-warning/40 dark:hover:border-warning/60"
        >
          <ShieldAlert size={17} className="mt-px shrink-0 text-warning" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-medium text-ink">Under investigation</p>
            <p className="mt-0.5 text-[13px] text-ink-muted">
              Opened {formatClock(investigation.openEntry.at)} — the ledger will not read as
              Cleared until this is resolved. View on the Ledger to resolve.
            </p>
          </div>
          <ChevronRight size={16} className="mt-0.5 shrink-0 text-ink-subtle" aria-hidden="true" />
        </Link>
      )}

      <div className="grid gap-4 lg:grid-cols-[300px_1fr] lg:items-start">
        {/* Gauge */}
        <Card render={<section />} className="p-5">
          <div className="flex items-center justify-between">
            <CardTitle>Current reading</CardTitle>
            <span ref={statusPillRef} className="inline-flex">
              <StatusPill
                tone={status === "SAFE" ? "success" : "warning"}
                weight="semibold"
                tracking="wide"
              >
                {status}
              </StatusPill>
            </span>
          </div>

          <p className="mt-4 flex items-baseline gap-1.5">
            <span
              ref={temperatureRef}
              className={`tabular text-[46px] font-semibold leading-none tracking-[-0.04em] ${
                outOfCorridor ? "text-warning" : "text-ink"
              }`}
            >
              {temperature.toFixed(1)}
            </span>
            <span className="text-[15px] font-medium text-ink-subtle">°C</span>
          </p>

          {/* Position within the full simulated domain, with the safe corridor
              highlighted — an excursion sits visibly outside the band. */}
          <div className="mt-5">
            <div className="relative h-2 rounded-full bg-sunken">
              <div
                className="absolute inset-y-0 rounded-full bg-brand-soft"
                style={{
                  left: `${toDomainPercent(SAFE_MIN_C)}%`,
                  right: `${100 - toDomainPercent(SAFE_MAX_C)}%`,
                }}
              />
              <div
                className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-raised transition-[left] duration-500 ease-out"
                style={{
                  left: `${toDomainPercent(temperature)}%`,
                  backgroundColor: outOfCorridor ? "var(--warning)" : "var(--brand)",
                }}
              />
            </div>
            <div className="tabular mt-2 flex justify-between font-mono text-[11px] text-ink-subtle">
              <span>{CHART_MIN_C.toFixed(1)}</span>
              <span className="text-ink-muted">
                safe {SAFE_MIN_C.toFixed(1)}–{SAFE_MAX_C.toFixed(1)}
              </span>
              <span>{CHART_MAX_C.toFixed(1)}</span>
            </div>
          </div>

          <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4">
            <Stat label="Low" value={minValue.toFixed(1)} mono size="sm" />
            <Stat label="High" value={maxValue.toFixed(1)} mono size="sm" />
            <Stat
              label="Excursions"
              value={excursionCount}
              mono
              size="sm"
              tone={excursionCount > 0 ? "warning" : "default"}
            />
          </dl>

          <p className="tabular mt-5 text-center font-mono text-[11.5px] text-ink-subtle">
            Live hardware feed · readings refresh automatically
          </p>
        </Card>

        {/* Chart */}
        <Card render={<section />} className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Temperature history</CardTitle>
              <CardDescription>
                {formatWindowLabel(readings).toLowerCase()} · {readings.length} readings
              </CardDescription>
            </div>
            <span className="font-mono text-[11.5px] text-ink-subtle">°C</span>
          </div>

          <div className="relative mt-5 pl-8">
            {/* Axis labels sit at their true value, not at even spacing. */}
            <div className="pointer-events-none absolute inset-y-0 left-0 w-7">
              {CHART_TICKS.map((tick) => (
                <span
                  key={tick}
                  className="tabular absolute right-0 -translate-y-1/2 font-mono text-[11px] text-ink-subtle"
                  style={{ top: `${toChartY(tick, 100)}%` }}
                >
                  {tick.toFixed(1)}
                </span>
              ))}
            </div>

            <div className="relative h-[190px]" onMouseLeave={() => setHoveredId(null)}>
              <svg
                viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                preserveAspectRatio="none"
                className="h-full w-full overflow-visible"
                role="img"
                aria-label={`Temperature history: ${readings.length} readings between ${minValue.toFixed(1)} and ${maxValue.toFixed(1)} degrees Celsius, currently ${temperature.toFixed(1)}, status ${status}.`}
              >
                {/* Safe corridor band */}
                <rect
                  x="0"
                  width={CHART_WIDTH}
                  y={toChartY(SAFE_MAX_C)}
                  height={toChartY(SAFE_MIN_C) - toChartY(SAFE_MAX_C)}
                  className="chart-band"
                />

                {CHART_TICKS.map((tick) => (
                  <line
                    key={tick}
                    x1="0"
                    x2={CHART_WIDTH}
                    y1={toChartY(tick)}
                    y2={toChartY(tick)}
                    className="chart-gridline"
                  />
                ))}

                {[SAFE_MIN_C, SAFE_MAX_C].map((limit) => (
                  <line
                    key={limit}
                    x1="0"
                    x2={CHART_WIDTH}
                    y1={toChartY(limit)}
                    y2={toChartY(limit)}
                    className="chart-threshold"
                  />
                ))}

                {hoveredReading && (
                  <line
                    x1={toChartX(hoveredIndex, readings.length)}
                    x2={toChartX(hoveredIndex, readings.length)}
                    y1={0}
                    y2={CHART_HEIGHT}
                    className="chart-cursor"
                  />
                )}

                <path d={chartPath} className="chart-path" />

                {readings.map((reading, index) => {
                  const x = toChartX(index, readings.length);
                  const y = toChartY(reading.value);
                  const isHovered = reading.id === hoveredId;
                  const isLatest = index === readings.length - 1;
                  const classes = [
                    "chart-point",
                    isHovered ? "hovered" : "",
                    isLatest ? "active" : "",
                    isExcursion(reading.value) ? "excursion" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");

                  return (
                    // Keyed by the reading's stable id: the window slides every
                    // 2s, so an index-based key would remount every point and
                    // drop the hover target out from under the cursor.
                    <g key={reading.id}>
                      <circle
                        cx={x}
                        cy={y}
                        r={13}
                        className="chart-hit"
                        tabIndex={0}
                        role="img"
                        aria-label={`${formatClock(reading.at)}: ${reading.value.toFixed(1)} degrees Celsius`}
                        onMouseEnter={() => setHoveredId(reading.id)}
                        onFocus={() => setHoveredId(reading.id)}
                        onBlur={() => setHoveredId(null)}
                      />
                      <circle
                        cx={x}
                        cy={y}
                        r={isHovered ? 5.5 : isLatest ? 4 : 2.5}
                        className={classes}
                        style={{ pointerEvents: "none" }}
                      />
                    </g>
                  );
                })}
              </svg>

              {hoveredReading && (
                <div
                  className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+10px)] rounded-lg border border-line bg-raised px-2.5 py-2 shadow-e3 dark:shadow-sm"
                  style={{
                    left: `${toChartX(hoveredIndex, readings.length, 100)}%`,
                    top: `${toChartY(hoveredReading.value, 100)}%`,
                  }}
                >
                  <p className="tabular font-mono text-[11px] text-ink-subtle">
                    {formatClock(hoveredReading.at)}
                  </p>
                  <p className="mt-0.5 flex items-baseline gap-1">
                    <span
                      className={`tabular font-mono text-[15px] font-semibold ${
                        isExcursion(hoveredReading.value) ? "text-warning" : "text-ink"
                      }`}
                    >
                      {hoveredReading.value.toFixed(1)}
                    </span>
                    <span className="font-mono text-[11px] text-ink-subtle">°C</span>
                  </p>
                </div>
              )}
            </div>

            <div className="tabular mt-2 flex justify-between font-mono text-[11px] text-ink-subtle">
              {xLabels.map((label, index) => (
                <span key={`${label}-${index}`}>{label}</span>
              ))}
            </div>
          </div>

          <p className="mt-4 border-t border-line pt-3 text-[13px] text-ink-muted">
            {outOfCorridor
              ? `Outside the ${SAFE_MIN_C}–${SAFE_MAX_C} °C corridor — an excursion is open on the ledger.`
              : `Inside the ${SAFE_MIN_C}–${SAFE_MAX_C} °C corridor. Hover a point for the exact reading.`}
          </p>
        </Card>
      </div>
    </div>
  );
}
