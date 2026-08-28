import { forwardRef, useEffect, useRef } from "react";
import anime from "animejs";
import { Package } from "lucide-react";
import { EASING, prefersReducedMotion } from "@/lib/motion";

const HOLD_MS = 900;

/**
 * Brief hand-off screen shown while the app shell mounts.
 *
 * `onFinished` is held in a ref so the effect can depend on nothing: the
 * parent passes a new closure on every render, and an effect that depends on
 * it would restart the animation and reset the timer each time.
 *
 * The root node is forwarded so the parent (App) can target it directly by
 * ref for the fade-out, rather than a global `.loading-screen` selector —
 * React 18 has no plain `ref` prop on function components, so this needs
 * `forwardRef` explicitly.
 */
const LoadingScreen = forwardRef<HTMLDivElement, { onFinished?: () => void }>(function LoadingScreen(
  { onFinished },
  forwardedRef,
) {
  const onFinishedRef = useRef(onFinished);
  const markRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const barFillRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);

  useEffect(() => {
    const timer = window.setTimeout(() => onFinishedRef.current?.(), HOLD_MS);

    if (prefersReducedMotion()) {
      return () => window.clearTimeout(timer);
    }

    const nodes = [markRef.current, titleRef.current, barFillRef.current].filter(
      (node): node is HTMLDivElement => node !== null,
    );

    const timeline = anime.timeline({ easing: EASING.out });
    timeline
      .add({ targets: markRef.current, scale: [0.94, 1], opacity: [0, 1], duration: 260 })
      .add({ targets: titleRef.current, translateY: [6, 0], opacity: [0, 1], duration: 240 }, "-=140")
      .add(
        { targets: barFillRef.current, scaleX: [0, 1], duration: HOLD_MS - 200, easing: EASING.inOut },
        0,
      );

    // Every animation is torn down here. A looping anime instance left running
    // keeps ticking against detached nodes for the life of the session.
    return () => {
      window.clearTimeout(timer);
      timeline.pause();
      anime.remove(nodes);
    };
  }, []);

  return (
    <div
      ref={forwardedRef}
      className="loading-screen fixed inset-0 z-50 grid place-items-center bg-surface"
    >
      <div className="flex flex-col items-center gap-5">
        <div
          ref={markRef}
          className="loading-mark grid h-11 w-11 place-items-center rounded-xl bg-brand text-primary-foreground"
        >
          <Package size={20} strokeWidth={2} aria-hidden="true" />
        </div>
        <div ref={titleRef} className="loading-title text-center">
          <p className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Vault</p>
          <p className="mt-1 text-[12.5px] text-ink-subtle">Starting cold-chain console</p>
        </div>
        <div className="h-[3px] w-40 overflow-hidden rounded-full bg-sunken">
          <div ref={barFillRef} className="loading-bar-fill h-full w-full origin-left rounded-full bg-brand" />
        </div>
      </div>
    </div>
  );
});

export default LoadingScreen;
