import { useColdChain } from "../context/ColdChainContext";

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
        <div className="status-panel">
          <div className="status-panel-head">
            <span className="eyebrow">CURRENT STATE</span>
            <span className="tiny-icon" aria-hidden="true">o</span>
          </div>
          <div className={`status-word ${status.toLowerCase()}`}>{status}</div>
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
          <button
            className={`monitor-button ${isMonitoring ? "pause" : "start"}`}
            onClick={() => setIsMonitoring((current) => !current)}
          >
            <span aria-hidden="true">{isMonitoring ? "||" : ">"}</span>
            {isMonitoring ? "PAUSE SIMULATION" : "RESUME SIMULATION"}
          </button>
          <div className="panel-foot">
            <span aria-hidden="true">o</span> SAMPLE EVERY 02 SEC <span>/</span> NEXT LEDGER APPEND 09 SEC
          </div>
        </div>

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
