import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { prefersReducedMotion } from "@/lib/motion";

type Box = { left: number; top: number; width: number; height: number };

/** The pill that slides between segments. Shared by both navs and the ledger filters. */
export const SEGMENT_INDICATOR =
  "pointer-events-none absolute left-0 top-0 rounded-md bg-raised ring-1 ring-line";

/** Applied only once the first position has painted, so nothing slides in from the origin. */
export const SEGMENT_MOVES = "transition-[transform,width,opacity] duration-200 ease-out";

/**
 * Positions a sliding pill behind the active item of a segmented control.
 *
 * The items have different widths — nav labels, filter names — so the
 * indicator has to be measured rather than assumed. Both axes are measured
 * against the container and applied as a single transform, so moving it never
 * touches layout and the container's padding or border can change without
 * this needing to know.
 *
 * Mark each item with `data-segment="<key>"` and pass the active key.
 */
export function useSegmentedIndicator(
  containerRef: RefObject<HTMLElement | null>,
  activeKey: string,
) {
  const [box, setBox] = useState<Box | null>(null);
  // The first placement must appear where it belongs rather than sliding in
  // from the container's origin. Movement is enabled one frame later.
  const placedRef = useRef(false);
  const [moves, setMoves] = useState(false);

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const active = container.querySelector<HTMLElement>(
      `[data-segment="${CSS.escape(activeKey)}"]`,
    );
    // No active item is a real state — the landing route matches no nav item.
    if (!active) {
      setBox(null);
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    // getBoundingClientRect measures from the border box, but an absolutely
    // positioned child is placed against the padding box. Subtracting the
    // border keeps the two agreeing.
    const style = window.getComputedStyle(container);
    const borderLeft = Number.parseFloat(style.borderLeftWidth) || 0;
    const borderTop = Number.parseFloat(style.borderTopWidth) || 0;

    setBox({
      left: activeRect.left - containerRect.left - borderLeft,
      top: activeRect.top - containerRect.top - borderTop,
      width: activeRect.width,
      height: activeRect.height,
    });
  }, [containerRef, activeKey]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    if (placedRef.current) return undefined;
    placedRef.current = true;
    if (prefersReducedMotion()) return undefined;
    // One frame after the initial position lands, so the first paint is static.
    const frame = window.requestAnimationFrame(() => setMoves(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  // Labels reflow on resize and on font load; a stale indicator is worse than
  // none, so re-measure rather than trusting the first read.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => measure());
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef, measure]);

  const indicatorStyle: CSSProperties = box
    ? {
        transform: `translate(${box.left}px, ${box.top}px)`,
        width: box.width,
        height: box.height,
        opacity: 1,
      }
    : { opacity: 0 };

  return { indicatorStyle, moves };
}
