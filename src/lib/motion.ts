import type anime from "animejs";

/** Respects the OS "reduce motion" setting for every decorative animation. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Shared timing scale. Pick one — do not invent a fourth without a reason. */
export const DURATION = {
  fast: 160,
  base: 320,
  slow: 480,
} as const;

/** Shared easings. Everything in this codebase so far uses one of these two. */
export const EASING = {
  out: "easeOutQuad",
  inOut: "easeInOutQuad",
} as const;

type AnimeParams = anime.AnimeParams;

/** A settled element fading/rising into view. */
export const fadeInUp: AnimeParams = {
  translateY: [6, 0],
  opacity: [0, 1],
  duration: DURATION.base,
  easing: EASING.out,
};

/** A settled element fading out in place. */
export const fadeOut: AnimeParams = {
  opacity: [1, 0],
  duration: DURATION.base,
  easing: EASING.inOut,
};
