import type { Variants, Transition } from "framer-motion";

// One easing curve for the whole page. Slow out, quick settle — the entrance
// should feel like the element arriving, not like it being animated at you.
export const EASE = [0.16, 1, 0.3, 1] as const;

export const DURATION = 0.75;

const base: Transition = { duration: DURATION, ease: EASE };

/** Elements enter from below each time they come into view, and retreat the
 * same way each time they leave, so both directions feel equally deliberate. */
export const revealUp: Variants = {
  hidden: { opacity: 0, y: 34, transition: base },
  show: { opacity: 1, y: 0, transition: base },
};

/** Same entrance, offset by position in a row so a grid arrives as a wave. */
export const revealUpAt = (i: number): Variants => ({
  hidden: { opacity: 0, y: 34, transition: base },
  show: { opacity: 1, y: 0, transition: { ...base, delay: i * 0.085 } },
});

/** A quieter version for text that sits inside an already-revealed block. */
export const revealFade: Variants = {
  hidden: { opacity: 0, y: 14, transition: { duration: 0.6, ease: EASE } },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};

/** Parent that hands the entrance down to its children in sequence. */
export const stagger = (gap = 0.09, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: gap, delayChildren: delay } },
});

/**
 * Trigger every time a real slice of the element is on screen, not just the
 * first: scrolling away hides it again, scrolling back replays the reveal.
 * The negative bottom margin holds the reveal until the element is properly
 * in the frame rather than firing the moment its first pixel appears.
 */
export const inView = {
  once: false,
  amount: 0.18,
  margin: "0px 0px -8% 0px",
} as const;

/** For tall blocks that would never reach 18% visibility on a short viewport. */
export const inViewTall = {
  once: false,
  amount: 0.06,
  margin: "0px 0px -6% 0px",
} as const;
