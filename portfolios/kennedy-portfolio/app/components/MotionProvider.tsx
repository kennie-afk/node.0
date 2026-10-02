"use client";
import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Reveals always play. They're a plain fade and a short rise — no blur, no
 * rotation, nothing with the kind of motion an OS reduced-motion setting
 * exists to guard against — so there's no reason to let that setting turn
 * scroll reveals off and leave content simply sitting there already visible.
 */
export default function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="never">{children}</MotionConfig>;
}
