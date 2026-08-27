import { useEffect, useRef } from "react";
import anime from "animejs";
import { Package } from "lucide-react";
import { prefersReducedMotion } from "@/lib/motion";

const HOLD_MS = 900;

/**
 * Brief hand-off screen shown while the app shell mounts.
 *
 * `onFinished` is held in a ref so the effect can depend on nothing: the
 * parent passes a new closure on every render, and an effect that depends on
 * it would restart the animation and reset the timer each time.
 */
export default function LoadingScreen({ onFinished }: { onFinished?: () => void }) {
  const onFinishedRef = useRef(onFinished);

  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);

  useEffect(() => {
    const timer = window.setTimeout(() => onFinishedRef.current?.(), HOLD_MS);

    if (prefersReducedMotion()) {
      return () => window.clearTimeout(timer);
    }

    const targets = ".loading-mark, .loading-title, .loading-bar-fill";
    const timeline = anime.timeline({ easing: "easeOutQuad" });
    timeline
      .add({ targets: ".loading-mark", scale: [0.94, 1], opacity: [0, 1], duration: 260 })
      .add({ targets: ".loading-title", translateY: [6, 0], opacity: [0, 1], duration: 240 }, "-=140")
      .add(
        { targets: ".loading-bar-fill", scaleX: [0, 1], duration: HOLD_MS - 200, easing: "easeInOutQuad" },
        0,
      );

    // Every animation is torn down here. A looping anime instance left running
    // keeps ticking against detached nodes for the life of the session.
    return () => {
      window.clearTimeout(timer);
      timeline.pause();
      anime.remove(targets);
    };
  }, []);

  return (
    <div className="loading-screen fixed inset-0 z-50 grid place-items-center bg-surface">
      <div className="flex flex-col items-center gap-5">
        <div className="loading-mark grid h-11 w-11 place-items-center rounded-xl bg-brand text-primary-foreground">
          <Package size={20} strokeWidth={2} aria-hidden="true" />
        </div>
        <div className="loading-title text-center">
          <p className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Vault</p>
          <p className="mt-1 text-[12.5px] text-ink-subtle">Starting cold-chain console</p>
        </div>
        <div className="h-[3px] w-40 overflow-hidden rounded-full bg-sunken">
          <div className="loading-bar-fill h-full w-full origin-left rounded-full bg-brand" />
        </div>
      </div>
    </div>
  );
}
