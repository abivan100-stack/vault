import { useColdChain } from "../context/ColdChainContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardContent } from "@/components/ui/card";

export default function MonitorPage() {
  const { temperature, status, isMonitoring, setIsMonitoring, readings, chartPath, toChartY } = useColdChain();

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
            <span className="tiny-icon" aria-hidden="true">o</span>
          </CardHeader>
          <CardContent className="flex flex-col flex-1 p-0 pt-6">
            <Badge
              variant={status === "SAFE" ? "secondary" : "destructive"}
              className={
                status === "SAFE"
                  ? "w-fit bg-[#e6f0e9] text-[#318b5d] border-[#cbd2c6] font-mono text-[11px] tracking-[0.16em]"
                  : "w-fit bg-[#f9e8c9] text-[#8a5510] border-[#d19a4a] font-mono text-[11px] tracking-[0.16em]"
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
              className={`mt-auto w-full rounded-none font-mono text-[9px] tracking-[0.05em] h-10 gap-2 ${
                isMonitoring
                  ? "bg-[#172019] hover:bg-[#1d5d59] text-[#f3f4ed] border-[#172019]"
                  : "bg-[#267e79] hover:bg-[#1d5d59] text-white border-[#267e79]"
              }`}
            >
              <span aria-hidden="true">{isMonitoring ? "||" : ">"}</span>
              {isMonitoring ? "PAUSE SIMULATION" : "RESUME SIMULATION"}
            </Button>
            <div className="panel-foot">
              <span aria-hidden="true">o</span> SAMPLE EVERY 02 SEC <span>/</span> NEXT LEDGER APPEND 09 SEC
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
          <div className="chart-area">
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
              <path d={chartPath} className="chart-path" />
              {readings.map((reading, index) => {
                const x = (index / Math.max(readings.length - 1, 1)) * 720;
                const y = toChartY(reading.value, 190);
                return (
                  <circle
                    key={`${reading.time}-${index}`}
                    cx={x}
                    cy={y}
                    r={index === readings.length - 1 ? 5 : 2.5}
                    className={index === readings.length - 1 ? "chart-point active" : "chart-point"}
                  />
                );
              })}
            </svg>
          </div>
          <div className="chart-x-labels mono">
            <span>14:06</span>
            <span>14:10</span>
            <span>14:14</span>
            <span>14:18</span>
            <span>NOW</span>
          </div>
          <div className={`chart-callout ${status.toLowerCase()}`}>
            <span className="callout-marker" /> {status === "SAFE" ? "SAFE - no excursion detected in current window" : "EXCURSION - reading outside safe corridor"} <span aria-hidden="true">-&gt;</span>
          </div>
        </div>
      </div>
    </section>
  );
}
