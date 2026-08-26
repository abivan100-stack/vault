import { useEffect, useState } from "react";
import anime from "animejs";
import { Activity, Pause, Play, Clock3, ArrowRight } from "lucide-react";
import { useColdChain } from "../context/ColdChainContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardContent } from "@/components/ui/card";

export default function MonitorPage() {
  const { temperature, status, isMonitoring, setIsMonitoring, readings, chartPath, toChartY } = useColdChain();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  useEffect(() => {
    anime
      .timeline({ easing: "easeOutExpo" })
      .add({
        targets: ".status-panel",
        translateX: [-18, 0],
        opacity: [0, 1],
        duration: 560,
      })
      .add(
        {
          targets: ".chart-panel",
          translateX: [18, 0],
          opacity: [0, 1],
          duration: 560,
        },
        "-=420",
      )
      .add(
        {
          targets: ".chart-path",
          strokeDashoffset: [anime.setDashoffset, 0],
          duration: 1100,
          easing: "easeInOutSine",
        },
        "-=380",
      );

    anime({
      targets: ".chart-point",
      scale: [0, 1],
      opacity: [0, 1],
      delay: anime.stagger(45),
      duration: 420,
      easing: "easeOutBack",
    });

    return () => anime.remove(".status-panel, .chart-panel, .chart-path, .chart-point");
  }, []);

  useEffect(() => {
    anime({
      targets: ".temp-reading span",
      scale: [0.97, 1],
      duration: 320,
      easing: "easeOutQuad",
    });
    anime({
      targets: ".status-bar span",
      scaleX: [0.92, 1],
      duration: 380,
      easing: "easeOutExpo",
    });
  }, [temperature]);

  const hoveredReading = hoveredIndex !== null ? readings[hoveredIndex] : null;
  const hoveredX = hoveredIndex !== null ? (hoveredIndex / Math.max(readings.length - 1, 1)) * 720 : null;
  const hoveredY = hoveredReading ? toChartY(hoveredReading.value, 190) : null;

  return (
    <section className="monitor-section" id="monitor">
      <div className="section-heading">
        <div>
          <div className="eyebrow">01 / LIVE MONITOR</div>
          <h2>Temperature at a glance.</h2>
        </div>
        <div className="section-heading-meta mono">
          <span className="live-dot" /> LAST SYNC 14:20:02 UTC+05:30
        </div>
      </div>

      <div className="monitor-grid">
        <Card className="status-panel rounded-none border-r border-[#9ea99e] border-l-0 border-t-0 border-b-0 bg-transparent shadow-none gap-0 py-0" style={{ borderRadius: 0 }}>
          <CardHeader className="status-panel-head p-0 pb-0">
            <span className="eyebrow">CURRENT STATE</span>
            <Activity size={16} className="text-[#267e79] opacity-70" aria-hidden="true" />
          </CardHeader>
          <CardContent className="flex flex-col flex-1 p-0 pt-6">
            <Badge
              variant={status === "SAFE" ? "secondary" : "destructive"}
              className={
                status === "SAFE"
                  ? "w-fit bg-[#e6f0e9] dark:bg-[#1e2623] text-[#318b5d] dark:text-[#5ac18a] border-[#cbd2c6] dark:border-[#2a352f] font-mono text-[13px] tracking-[0.16em]"
                  : "w-fit bg-[#f9e8c9] dark:bg-[#2a1f0a] text-[#8a5510] dark:text-[#d19a4a] border-[#d19a4a] dark:border-[#5a3d16] font-mono text-[13px] tracking-[0.16em]"
              }
            >
              {status}
            </Badge>
            <div className="temp-reading">
              <span>{temperature.toFixed(1)}</span>
              <sup>deg C</sup>
            </div>
            <div className="status-bar">
              <span style={{ width: `${Math.min(100, Math.max(0, ((temperature - 2) / 6) * 100))}%` }} />
            </div>
            <div className="status-limits">
              <span>02.0</span>
              <span>SAFE CORRIDOR</span>
              <span>08.0</span>
            </div>
            <Button
              onClick={() => setIsMonitoring((current) => !current)}
              className={`mt-auto w-full rounded-full font-sans text-[15px] font-medium tracking-[-0.01em] h-10 gap-2 shadow-sm ${
                isMonitoring
                  ? "bg-[#172019] hover:bg-[#1d5d59] text-[#f3f4ed] border-[#172019] dark:bg-[#e8e9e3] dark:hover:bg-[#c8d5d0] dark:text-[#0e1210] dark:border-[#e8e9e3]"
                  : "bg-[#267e79] hover:bg-[#1d5d59] text-white border-[#267e79] dark:bg-[#3aa79f] dark:hover:bg-[#2e9e98] dark:text-[#0e1210] dark:border-[#3aa79f]"
              }`}
            >
              {isMonitoring ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
              {isMonitoring ? "PAUSE SIMULATION" : "RESUME SIMULATION"}
            </Button>
            <div className="panel-foot">
              <Clock3 size={13} aria-hidden="true" /> SAMPLE EVERY 02 SEC <span>/</span> NEXT LEDGER APPEND 09 SEC
            </div>
          </CardContent>
        </Card>

        <div className="chart-panel">
          <div className="chart-head">
            <div>
              <span className="eyebrow">TEMPERATURE HISTORY / LAST 16 MIN</span>
              <div className="chart-title">
                <span className="chart-key" /> Live reading
              </div>
            </div>
            <span className="mono chart-unit">CELSIUS / deg C</span>
          </div>
          <div className="chart-area group" onMouseLeave={() => setHoveredIndex(null)}>
            <div className="chart-y-labels mono">
              <span>08</span>
              <span>06</span>
              <span>04</span>
              <span>02</span>
            </div>
            <svg
              viewBox="0 0 720 190"
              role="img"
              aria-label="Temperature chart showing readings between 4.6 and 4.9 degrees Celsius"
              preserveAspectRatio="none"
            >
              <rect x="0" y="0" width="720" height="190" fill="rgba(22, 135, 93, 0.06)" />
              {[0, 63.3, 126.6, 190].map((y) => (
                <line key={y} x1="0" x2="720" y1={y} y2={y} className="chart-gridline" />
              ))}
              <line x1="0" x2="720" y1="0" y2="0" className="threshold-line" />
              <line x1="0" x2="720" y1="190" y2="190" className="threshold-line" />
              {hoveredX !== null && hoveredY !== null && (
                <line x1={hoveredX} x2={hoveredX} y1={0} y2={190} stroke="rgba(38,126,121,0.45)" strokeWidth={1} strokeDasharray="6 4" opacity={0.9} />
              )}
              <path d={chartPath} className="chart-path" />
              {readings.map((reading, index) => {
                const x = (index / Math.max(readings.length - 1, 1)) * 720;
                const y = toChartY(reading.value, 190);
                const isHovered = hoveredIndex === index;
                const isActive = index === readings.length - 1;
                return (
                  <g key={`${reading.time}-${index}`}>
                    {/* larger hit area */}
                    <circle
                      cx={x}
                      cy={y}
                      r={14}
                      fill="transparent"
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredIndex(index)}
                      onFocus={() => setHoveredIndex(index)}
                      onMouseLeave={() => setHoveredIndex(null)}
                      tabIndex={0}
                      aria-label={`${reading.time}: ${reading.value.toFixed(1)} deg C`}
                    />
                    <circle
                      cx={x}
                      cy={y}
                      r={isHovered ? 6.5 : isActive ? 5 : 2.5}
                      className={isHovered ? "chart-point hovered" : isActive ? "chart-point active" : "chart-point"}
                      style={{ transition: "r 160ms ease, fill 160ms ease", pointerEvents: "none" }}
                      strokeWidth={isHovered ? 2.5 : 1.5}
                    />
                  </g>
                );
              })}
            </svg>

            {/* Hover tooltip */}
            {hoveredReading && hoveredX !== null && hoveredY !== null && (
              <div
                className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+12px)] bg-white dark:bg-[#1c2220] border border-[#cbd2c6] dark:border-[#2a352f] rounded-lg shadow-[0_8px_24px_rgba(23,32,25,0.12)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.32)] px-3 py-2 min-w-[108px]"
                style={{ left: `${(hoveredIndex! / Math.max(readings.length - 1, 1)) * 100}%`, top: `${(hoveredY / 190) * 100}%` }}
              >
                <div className="font-mono text-[11px] tracking-[0.1em] text-[#5a6a62] dark:text-[#9aa6a1]">TIME</div>
                <div className="font-mono text-[13px] font-bold text-[#172019] dark:text-[#e8e9e3]">{hoveredReading.time}</div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="font-mono text-[16px] font-bold tracking-[-0.04em] text-[#1d5d59] dark:text-[#7ec8c1]">{hoveredReading.value.toFixed(1)}</span>
                  <span className="font-mono text-[11px] text-[#667068] dark:text-[#9aa6a1]">deg C</span>
                  <span className={`ml-auto h-1.5 w-1.5 rounded-full ${hoveredReading.value < 2 || hoveredReading.value > 8 ? "bg-[#d19a4a]" : "bg-[#318b5d] dark:bg-[#5ac18a]"}`} />
                </div>
                <div className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-[4px] rotate-45 bg-white dark:bg-[#1c2220] border-r border-b border-[#cbd2c6] dark:border-[#2a352f]" />
              </div>
            )}
          </div>
          <div className="chart-x-labels mono">
            <span>14:06</span>
            <span>14:10</span>
            <span>14:14</span>
            <span>14:18</span>
            <span>NOW</span>
          </div>
          <div className={`chart-callout ${status.toLowerCase()}`}>
            <span className="callout-marker" /> {status === "SAFE" ? "SAFE - no excursion detected in current window" : "EXCURSION - reading outside safe corridor"} <ArrowRight size={13} aria-hidden="true" />
          </div>
          <div className="mt-2 font-mono text-[11px] text-[#667068]">Hover over dots to see precise reading — live updates every 2 sec</div>
        </div>
      </div>
    </section>
  );
}
