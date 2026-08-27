import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import anime from "animejs";
import { Activity, ArrowRight, Database, Package } from "lucide-react";
import { useColdChain } from "@/context/ColdChainContext";
import { Button } from "@/components/ui/button";
import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import StatusPill from "@/components/StatusPill";
import { DURATION, EASING, prefersReducedMotion } from "@/lib/motion";
import { SAFE_MAX_C, SAFE_MIN_C } from "@/lib/chart";
import { LEDGER_INTERVAL_MS, SAMPLE_INTERVAL_MS, formatClock } from "@/lib/simulation";

export default function LandingPage() {
  const navigate = useNavigate();

  // One entrance, once per visit: the hero block and the "right now" preview
  // card (both direct children of `heroRef`), then the three feature cards
  // (children of `cardsRowRef`). Scoped to these two containers' own
  // children — never a global selector — and mount-only, so it never
  // competes with the live values ticking inside the preview card.
  const heroRef = useRef<HTMLElement>(null);
  const cardsRowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return undefined;

    const heroChildren = heroRef.current ? Array.from(heroRef.current.children) : [];
    const cardChildren = cardsRowRef.current ? Array.from(cardsRowRef.current.children) : [];
    const targets = [...heroChildren, ...cardChildren] as HTMLElement[];
    if (targets.length === 0) return undefined;

    anime.remove(targets);
    const instance = anime({
      targets,
      translateY: [10, 0],
      opacity: [0, 1],
      duration: DURATION.slow - 200, // 280ms per item
      delay: anime.stagger(50),
      easing: EASING.out,
    });

    return () => {
      instance.pause();
      anime.remove(targets);
    };
  }, []);

  // The preview reflects real state. A hardcoded snapshot would contradict the
  // console one click away.
  const { temperature, status, ledger, chainVerification, discardedEntryCount, fieldLogMeta, lastSyncAt } =
    useColdChain();

  // Same gate as the Ledger page: a chain whose tail was dropped still
  // verifies, so intact alone would report VERIFIED over known data loss.
  const isTrustworthy = chainVerification.intact && discardedEntryCount === 0;

  const latestEntry = ledger.length > 0 ? ledger[ledger.length - 1] : null;
  const isSafe = status === "SAFE";

  return (
    <div className="space-y-10">
      <section ref={heroRef} className="grid gap-10 pt-4 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div>
          <p className="eyebrow">Cold-chain integrity console</p>
          <h1 className="mt-3 max-w-[16ch] text-[34px] font-semibold leading-[1.1] tracking-[-0.03em] text-ink sm:text-[40px]">
            Proof the cold chain held.
          </h1>
          <p className="mt-4 max-w-[54ch] text-[15px] leading-relaxed text-ink-muted">
            Vault watches one shipment's {SAFE_MIN_C}–{SAFE_MAX_C} °C corridor, commits the
            reading to a hash-chained ledger every {LEDGER_INTERVAL_MS / 1000} seconds, and keeps
            the box, batch and route in one record — from loading bay to handoff.
          </p>

          <div className="mt-6 flex flex-wrap gap-2.5">
            <Button onClick={() => navigate("/monitor")} className="h-10 gap-2 px-5 text-sm">
              Open monitor
              <ArrowRight size={15} aria-hidden="true" />
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate("/shipment")}
              className="h-10 gap-2 px-5 text-sm"
            >
              <Package size={15} aria-hidden="true" />
              View shipment
            </Button>
          </div>

          <p className="mt-6 text-[12.5px] text-ink-subtle">
            Runs entirely in this browser. No sensor, no backend, no account.
          </p>
        </div>

        {/* Live preview */}
        <Card>
          <CardHeader className="flex items-center justify-between px-5 py-3.5">
            <span className="eyebrow">Right now</span>
            <span className="tabular font-mono text-[11.5px] text-ink-subtle">
              {lastSyncAt ? formatClock(lastSyncAt) : "—"}
            </span>
          </CardHeader>

          <dl className="divide-y divide-line">
            <div className="flex items-center justify-between gap-4 px-5 py-4">
              <dt className="flex items-center gap-2 text-[13.5px] text-ink-muted">
                <Activity size={15} className="text-ink-subtle" aria-hidden="true" />
                Temperature
              </dt>
              <dd className="flex items-center gap-2">
                <span
                  className={`tabular font-mono text-[15px] font-semibold ${
                    isSafe ? "text-ink" : "text-warning"
                  }`}
                >
                  {temperature.toFixed(1)} °C
                </span>
                <StatusPill size="sm" tone={isSafe ? "success" : "warning"}>
                  {status}
                </StatusPill>
              </dd>
            </div>

            <div className="flex items-center justify-between gap-4 px-5 py-4">
              <dt className="flex items-center gap-2 text-[13.5px] text-ink-muted">
                <Database size={15} className="text-ink-subtle" aria-hidden="true" />
                Ledger
              </dt>
              <dd className="flex items-center gap-2">
                <span className="tabular font-mono text-[13px] text-ink">
                  {latestEntry ? `#${String(latestEntry.sequence).padStart(3, "0")}` : "—"}
                </span>
                <StatusPill size="sm" tone={isTrustworthy ? "success" : "warning"}>
                  {isTrustworthy ? "VERIFIED" : chainVerification.intact ? "INCOMPLETE" : "BROKEN"}
                </StatusPill>
              </dd>
            </div>

            <div className="flex items-center justify-between gap-4 px-5 py-4">
              <dt className="flex items-center gap-2 text-[13.5px] text-ink-muted">
                <Package size={15} className="text-ink-subtle" aria-hidden="true" />
                Shipment
              </dt>
              <dd
                className="tabular min-w-0 truncate font-mono text-[13px] text-ink"
                title={`${fieldLogMeta.box} · ${fieldLogMeta.batch}`}
              >
                {fieldLogMeta.box}
                <span className="text-ink-subtle"> · {fieldLogMeta.batch}</span>
              </dd>
            </div>
          </dl>

          <CardFooter className="px-5 py-3.5">
            <button
              type="button"
              onClick={() => navigate("/ledger")}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-ink transition-colors hover:text-brand"
            >
              Open the ledger
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          </CardFooter>
        </Card>
      </section>

      <section className="border-t border-line pt-8">
        <h2 className="eyebrow">What it does</h2>
        <div ref={cardsRowRef} className="mt-4 grid gap-4 md:grid-cols-3">
          {[
            {
              icon: Activity,
              title: "Watches the corridor",
              body: `A reading every ${SAMPLE_INTERVAL_MS / 1000} seconds, plotted against the ${SAFE_MIN_C}–${SAFE_MAX_C} °C limits with 0.5 °C of headroom either side so excursions are visible rather than clamped to the edge.`,
            },
            {
              icon: Database,
              title: "Records the evidence",
              body: `The reading every ${LEDGER_INTERVAL_MS / 1000} seconds, plus every excursion, edit and handoff as it happens. Verification recomputes each digest, so an edited entry shows up as a broken chain.`,
            },
            {
              icon: Package,
              title: "Keeps one record",
              body: "Box, batch, product, doses and route live in a single shipment record, editable in a dedicated workspace and saved to this browser.",
            },
          ].map((item) => (
            <Card key={item.title} render={<article />} className="p-5">
              <item.icon size={16} className="text-ink-subtle" aria-hidden="true" />
              <h3 className="mt-3 text-[14px] font-semibold tracking-[-0.01em] text-ink">
                {item.title}
              </h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-muted">{item.body}</p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
