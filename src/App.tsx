import { useEffect, useMemo, useState } from "react";

type Status = "SAFE" | "EXCURSION";

type Reading = {
  time: string;
  value: number;
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

const ledgerRows = [
  { sequence: "042", event: "TEMPERATURE_READING", time: "14:20:02", status: "VALID" },
  { sequence: "041", event: "TEMPERATURE_READING", time: "14:10:02", status: "VALID" },
  { sequence: "040", event: "TEMPERATURE_READING", time: "14:00:02", status: "VALID" },
];

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function App() {
  const [isMonitoring, setIsMonitoring] = useState(true);
  const [temperature, setTemperature] = useState(4.8);
  const [readings, setReadings] = useState(seedReadings);
  const status: Status = temperature < 2 || temperature > 8 ? "EXCURSION" : "SAFE";

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
        const y = height - ((reading.value - 2) / 6) * height;
        return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  }, [readings]);

  return (
    <div className="vault-app">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Vault home">
          <span className="brand-mark">V</span>
          <span>
            <strong>VAULT</strong>
            <small>COLD-CHAIN / 01</small>
          </span>
        </a>
        <nav className="topnav" aria-label="Primary navigation">
          <a className="active" href="#monitor">MONITOR</a>
          <a href="#ledger">LEDGER</a>
          <a href="#shipment">SHIPMENT</a>
        </nav>
        <div className="topbar-meta">
          <span className="live-dot" />
          <span className="mono">SIMULATED / LOCAL</span>
          <button className="icon-button" aria-label="Open help">?</button>
        </div>
      </header>

      <main id="top" className="page-wrap">
        <section className="intro-grid" id="shipment">
          <aside className="field-log" aria-label="Shipment log">
            <div className="eyebrow">FIELD LOG / 2026-00124</div>
            <div className="log-rule" />
            <dl>
              <div><dt>BOX</dt><dd>VCC-BOX-001</dd></div>
              <div><dt>PRODUCT</dt><dd>Demo Vaccine A</dd></div>
              <div><dt>BATCH</dt><dd>VAC-B2418</dd></div>
              <div><dt>DOSES</dt><dd>250 units</dd></div>
              <div><dt>RANGE</dt><dd>02.0-08.0 deg C</dd></div>
            </dl>
            <div className="log-foot mono">STARTED 13:42:17<br />ROUTE / DELHI -&gt; JAIPUR</div>
          </aside>

          <div className="intro-copy">
            <div className="eyebrow teal">COLD-CHAIN INTEGRITY / LIVE SPECIMEN</div>
            <h1>Keep every<br /><span>dose</span> in range.</h1>
            <p className="intro-lede">A quiet record of temperature, time, and trust. Vault keeps the journey visible from loading bay to last-mile handoff.</p>
            <div className="intro-note"><span className="note-line" /> <span>One box. One unbroken chain.</span></div>
          </div>

          <div className="orbit-wrap" aria-label="Live monitoring visual">
            <div className="orbit-ring ring-one" />
            <div className="orbit-ring ring-two" />
            <div className={`orbit-core ${status.toLowerCase()}`}>
              <span className="shield-glyph" aria-hidden="true">OK</span>
              <strong>{status}</strong>
              <span>{status === "SAFE" ? "2-8 deg C corridor" : "outside corridor"}</span>
            </div>
            <div className="orbit-label label-top mono">SENSOR / DHT22</div>
            <div className="orbit-label label-bottom mono">SIGNAL 98%</div>
          </div>
        </section>

        <section className="monitor-section" id="monitor">
          <div className="section-heading">
            <div>
              <div className="eyebrow">01 / LIVE MONITOR</div>
              <h2>Temperature at a glance.</h2>
            </div>
            <div className="section-heading-meta mono"><span className="live-dot" /> LAST SYNC 14:20:02 UTC+05:30</div>
          </div>

          <div className="monitor-grid">
            <div className="status-panel">
              <div className="status-panel-head"><span className="eyebrow">CURRENT STATE</span><span className="tiny-icon" aria-hidden="true">o</span></div>
              <div className={`status-word ${status.toLowerCase()}`}>
                {status}
              </div>
              <div className="temp-reading"><span>{temperature.toFixed(1)}</span><sup>deg C</sup></div>
              <div className="status-bar"><span style={{ width: `${Math.min(100, Math.max(0, ((temperature - 2) / 6) * 100))}%` }} /></div>
              <div className="status-limits"><span>02.0</span><span>SAFE CORRIDOR</span><span>08.0</span></div>
              <button className={`monitor-button ${isMonitoring ? "pause" : "start"}`} onClick={() => setIsMonitoring((current) => !current)}>
                <span aria-hidden="true">{isMonitoring ? "||" : ">"}</span>
                {isMonitoring ? "PAUSE SIMULATION" : "RESUME SIMULATION"}
              </button>
              <div className="panel-foot"><span aria-hidden="true">o</span> SAMPLE EVERY 02 SEC <span>/</span> NEXT LEDGER APPEND 09 SEC</div>
            </div>

            <div className="chart-panel">
              <div className="chart-head"><div><span className="eyebrow">TEMPERATURE HISTORY / LAST 16 MIN</span><div className="chart-title"><span className="chart-key" /> Live reading</div></div><span className="mono chart-unit">CELSIUS / deg C</span></div>
              <div className="chart-area">
                <div className="chart-y-labels mono"><span>08</span><span>06</span><span>04</span><span>02</span></div>
                <svg viewBox="0 0 720 190" role="img" aria-label="Temperature chart showing readings between 4.6 and 4.9 degrees Celsius" preserveAspectRatio="none">
                  <rect x="0" y="0" width="720" height="190" fill="rgba(22, 135, 93, 0.06)" />
                  {[0, 63.3, 126.6, 190].map((y) => <line key={y} x1="0" x2="720" y1={y} y2={y} className="chart-gridline" />)}
                  <line x1="0" x2="720" y1="0" y2="0" className="threshold-line" />
                  <line x1="0" x2="720" y1="190" y2="190" className="threshold-line" />
                  <path d={chartPath} className="chart-path" />
                  {readings.map((reading, index) => {
                    const x = (index / Math.max(readings.length - 1, 1)) * 720;
                    const y = 190 - ((reading.value - 2) / 6) * 190;
                    return <circle key={`${reading.time}-${index}`} cx={x} cy={y} r={index === readings.length - 1 ? 5 : 2.5} className={index === readings.length - 1 ? "chart-point active" : "chart-point"} />;
                  })}
                </svg>
              </div>
              <div className="chart-x-labels mono"><span>14:06</span><span>14:10</span><span>14:14</span><span>14:18</span><span>NOW</span></div>
              <div className={`chart-callout ${status.toLowerCase()}`}><span className="callout-marker" /> {status === "SAFE" ? "SAFE - no excursion detected in current window" : "EXCURSION - reading outside safe corridor"} <span aria-hidden="true">-&gt;</span></div>
            </div>
          </div>
        </section>

        <section className="ledger-section" id="ledger">
          <div className="section-heading ledger-heading"><div><div className="eyebrow">02 / IMMUTABLE TRAIL</div><h2>Every reading leaves a mark.</h2></div><a className="text-link" href="#ledger">OPEN FULL LEDGER <span aria-hidden="true">&gt;</span></a></div>
          <div className="ledger-table" role="table" aria-label="Recent ledger entries">
            <div className="ledger-row ledger-header" role="row"><span>SEQ</span><span>ENTRY TYPE</span><span>UTC TIMESTAMP</span><span>STATUS</span><span>HASH</span></div>
            {ledgerRows.map((row, index) => <div className="ledger-row" role="row" key={row.sequence}><span className="mono teal-text">{row.sequence}</span><span className="event-name">{row.event}</span><span className="mono">2026-08-26 / {row.time}</span><span><span className="valid-tag"><span />{row.status}</span></span><span className="mono hash">{index === 0 ? "8f2a...c91d" : index === 1 ? "2b11...0a48" : "b728...f0e2"}</span></div>)}
          </div>
        </section>

        <footer className="footer"><span className="mono">VAULT / FRONTEND PROTOTYPE</span><span>Designed for a future sensor, ready for today's handoff.</span><span className="mono">BUILD 0.1.0 <span className="footer-square" /></span></footer>
      </main>
    </div>
  );
}

export default App;
