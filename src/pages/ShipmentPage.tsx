import { useColdChain } from "../context/ColdChainContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function ShipmentPage() {
  const { fieldLogMeta, status } = useColdChain();

  return (
    <section className="intro-grid" id="shipment">
      <Card className="field-log gap-0 !p-0 overflow-hidden bg-white border-[#cbd2c6] rounded-[10px] shadow-[0_8px_24px_rgba(23,32,25,0.08)]">
        <CardContent className="p-[22px_20px_20px]">
          <div className="eyebrow text-[#172019] font-bold tracking-[0.11em] text-[9.5px]">{fieldLogMeta.logId}</div>
          <div className="log-rule border-t-[1.5px] border-[#e0e6dd] mt-[14px] mb-[2px]" />
          <dl className="m-0">
            <div className="py-[12px] border-b border-[#e6ebe4] flex flex-col gap-1">
              <dt className="font-mono text-[8px] font-bold text-[#267e79] tracking-[0.14em] uppercase">BOX</dt>
              <dd className="font-mono text-[10.5px] font-semibold text-[#172019]">{fieldLogMeta.box}</dd>
            </div>
            <div className="py-[12px] border-b border-[#e6ebe4] flex flex-col gap-1">
              <dt className="font-mono text-[8px] font-bold text-[#267e79] tracking-[0.14em] uppercase">PRODUCT</dt>
              <dd className="font-mono text-[10.5px] font-semibold text-[#172019]">{fieldLogMeta.product}</dd>
            </div>
            <div className="py-[12px] border-b border-[#e6ebe4] flex flex-col gap-1">
              <dt className="font-mono text-[8px] font-bold text-[#267e79] tracking-[0.14em] uppercase">BATCH</dt>
              <dd className="font-mono text-[10.5px] font-semibold text-[#172019]">{fieldLogMeta.batch}</dd>
            </div>
            <div className="py-[12px] border-b border-[#e6ebe4] flex flex-col gap-1">
              <dt className="font-mono text-[8px] font-bold text-[#267e79] tracking-[0.14em] uppercase">DOSES</dt>
              <dd className="font-mono text-[10.5px] font-semibold text-[#172019]">{fieldLogMeta.doses}</dd>
            </div>
            <div className="py-[12px] flex flex-col gap-1">
              <dt className="font-mono text-[8px] font-bold text-[#267e79] tracking-[0.14em] uppercase">RANGE</dt>
              <dd className="font-mono text-[10.5px] font-semibold text-[#172019]">{fieldLogMeta.range}</dd>
            </div>
          </dl>
          <div className="log-foot font-mono bg-[#f7f8f4] border border-[#e6ebe4] rounded-md p-[10px_12px] text-[8px] leading-[1.7] mt-4 font-semibold tracking-[0.04em] text-[#172019]">
            STARTED {fieldLogMeta.started}
            <br />
            ROUTE / {fieldLogMeta.route}
            <div className="mt-2 flex gap-1.5">
              <Badge variant="secondary" className="bg-[#e6f0e9] text-[#318b5d] border text-[7px] px-1.5 py-0">
                LIVE
              </Badge>
              <Badge variant="outline" className="font-mono text-[7px]">
                SHIPMENT
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="intro-copy">
        <div className="eyebrow teal">COLD-CHAIN INTEGRITY / LIVE SPECIMEN</div>
        <h1>
          Keep every
          <br />
          <span>dose</span> in range.
        </h1>
        <p className="intro-lede">A quiet record of temperature, time, and trust. Vault keeps the journey visible from loading bay to last-mile handoff.</p>
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
