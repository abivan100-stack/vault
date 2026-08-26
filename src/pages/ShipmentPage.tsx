import { useColdChain } from "../context/ColdChainContext";

export default function ShipmentPage() {
  const { fieldLogMeta, status } = useColdChain();

  return (
    <section className="intro-grid" id="shipment">
      <aside className="field-log" aria-label="Shipment log">
        <div className="eyebrow">{fieldLogMeta.logId}</div>
        <div className="log-rule" />
        <dl>
          <div>
            <dt>BOX</dt>
            <dd>{fieldLogMeta.box}</dd>
          </div>
          <div>
            <dt>PRODUCT</dt>
            <dd>{fieldLogMeta.product}</dd>
          </div>
          <div>
            <dt>BATCH</dt>
            <dd>{fieldLogMeta.batch}</dd>
          </div>
          <div>
            <dt>DOSES</dt>
            <dd>{fieldLogMeta.doses}</dd>
          </div>
          <div>
            <dt>RANGE</dt>
            <dd>{fieldLogMeta.range}</dd>
          </div>
        </dl>
        <div className="log-foot mono">
          STARTED {fieldLogMeta.started}
          <br />
          ROUTE / {fieldLogMeta.route}
        </div>
      </aside>

      <div className="intro-copy">
        <div className="eyebrow teal">COLD-CHAIN INTEGRITY / LIVE SPECIMEN</div>
        <h1>
          Keep every
          <br />
          <span>dose</span> in range.
        </h1>
        <p className="intro-lede">
          A quiet record of temperature, time, and trust. Vault keeps the journey visible from loading bay to last-mile handoff.
        </p>
        <div className="intro-note">
          <span className="note-line" /> <span>One box. One unbroken chain.</span>
        </div>
      </div>

      <div className="orbit-wrap" aria-label="Live monitoring visual">
        <div className="orbit-ring ring-one" />
        <div className="orbit-ring ring-two" />
        <div className={`orbit-core ${status.toLowerCase()}`}>
          <span className="shield-glyph" aria-hidden="true">
            {status === "SAFE" ? "OK" : "!!"}
          </span>
          <strong>{status}</strong>
          <span>{status === "SAFE" ? "2-8 deg C corridor" : "outside corridor"}</span>
        </div>
        <div className="orbit-label label-top mono">SENSOR / DHT22</div>
        <div className="orbit-label label-bottom mono">SIGNAL 98%</div>
      </div>
    </section>
  );
}
