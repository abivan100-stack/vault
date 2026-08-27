import { useEffect, type DependencyList, type RefObject } from "react";
import anime from "animejs";
import { prefersReducedMotion } from "@/lib/motion";

type AnimeParams = anime.AnimeParams;
type AnimeTarget = HTMLElement | SVGElement;

/**
 * Property keys anime.js treats as instance/timing options rather than
 * animatable properties. Everything else in a params object is assumed to be
 * a CSS/transform property and gets resolved to its final value for the
 * reduced-motion path.
 */
const OPTION_KEYS = new Set<string>([
  "targets",
  "duration",
  "delay",
  "endDelay",
  "easing",
  "round",
  "keyframes",
  "autoplay",
  "loop",
  "direction",
  "loopBegin",
  "loopComplete",
  "changeBegin",
  "changeComplete",
  "change",
  "begin",
  "update",
  "complete",
]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function finalValue(value: any): unknown {
  if (typeof value === "function") return value();
  if (Array.isArray(value)) return value[value.length - 1];
  return value;
}

/**
 * Resolves a params object down to the end-state values and applies them
 * instantly. Used so a reduced-motion viewer never gets stuck at an
 * in-between frame (e.g. opacity: 0) — they see exactly where the animation
 * would have landed.
 */
function applyFinalState(node: AnimeTarget, params: AnimeParams): void {
  const finalProps: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (OPTION_KEYS.has(key)) continue;
    finalProps[key] = finalValue(value);
  }
  if (Object.keys(finalProps).length > 0) {
    anime.set(node, finalProps);
  }
}

/**
 * Runs an anime.js animation against a ref'd DOM node — never a CSS
 * selector, so it can only ever affect the one node it was given.
 *
 * Re-runs whenever `deps` changes, same contract as useEffect.
 *
 * - Reduced motion: the animation never starts. The node is set straight to
 *   its final values via `anime.set`, so content is never left hidden.
 * - StrictMode double-invoke: `anime.remove(node)` runs immediately before
 *   (re)starting and again on cleanup, so an aborted first run can never
 *   race the second and there is never more than one instance driving the
 *   node.
 * - A null/detached ref is a no-op.
 *
 * Caution: under reduced motion the animation never runs, so lifecycle
 * callbacks (`complete`, `begin`, `update`) never fire. Anything that must
 * happen regardless — advancing a state machine, unmounting a splash — has to
 * be driven by the caller, not by `complete`.
 */
export function useAnime(
  ref: RefObject<AnimeTarget | null>,
  params: AnimeParams,
  deps: DependencyList,
): void {
  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    anime.remove(node);

    if (prefersReducedMotion()) {
      applyFinalState(node, params);
      return undefined;
    }

    anime({ ...params, targets: node });

    return () => anime.remove(node);
    // `ref` and `params` are intentionally excluded: the ref identity is
    // stable across renders and params is typically an inline object, so
    // depending on it would re-run the animation every render. Callers
    // control re-runs explicitly via `deps`, matching useEffect/useMemo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * Imperative escape hatch for event-triggered animation that isn't tied to
 * a render/deps cycle (e.g. a one-shot pulse fired from a status change
 * detected in other application logic). Same reduced-motion and
 * remove-before-run guarantees as `useAnime`, without the effect wrapper.
 */
export function playAnime(node: AnimeTarget | null, params: AnimeParams): void {
  if (!node) return;

  anime.remove(node);

  if (prefersReducedMotion()) {
    applyFinalState(node, params);
    return;
  }

  anime({ ...params, targets: node });
}
