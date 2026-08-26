import { useColdChain } from "../context/ColdChainContext";

export default function LedgerPage() {
  const { ledgerRows } = useColdChain();

  return (
    <section className="ledger-section" id="ledger">
      <div className="section-heading ledger-heading">
        <div>
          <div className="eyebrow">02 / IMMUTABLE TRAIL</div>
          <h2>Every reading leaves a mark.</h2>
        </div>
        <a className="text-link" href="#ledger">
          OPEN FULL LEDGER <span aria-hidden="true">&gt;</span>
        </a>
      </div>
      <div className="ledger-table" role="table" aria-label="Recent ledger entries">
        <div className="ledger-row ledger-header" role="row">
          <span>SEQ</span>
          <span>ENTRY TYPE</span>
          <span>UTC TIMESTAMP</span>
          <span>STATUS</span>
          <span>HASH</span>
        </div>
        {ledgerRows.map((row, index) => (
          <div className="ledger-row" role="row" key={row.sequence}>
            <span className="mono teal-text">{row.sequence}</span>
            <span className="event-name">{row.event}</span>
            <span className="mono">2026-08-26 / {row.time}</span>
            <span>
              <span className="valid-tag">
                <span />
                {row.status}
              </span>
            </span>
            <span className="mono hash">{index === 0 ? "8f2a...c91d" : index === 1 ? "2b11...0a48" : "b728...f0e2"}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
