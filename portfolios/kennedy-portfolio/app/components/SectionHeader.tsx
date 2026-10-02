"use client";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { inView, revealUp, revealFade, stagger } from "@/lib/motion";

interface Props {
  index: string;
  eyebrow: string;
  title: ReactNode;
  lead?: ReactNode;
}

export default function SectionHeader({ index, eyebrow, title, lead }: Props) {
  return (
    <motion.div
      variants={stagger(0.1)}
      initial="hidden"
      whileInView="show"
      viewport={inView}
    >
      {/* Index, rule and eyebrow sit on one line above the title — the earlier
          two-column split read as a layout accident. */}
      <motion.div variants={revealFade} className="flex items-center gap-3">
        <span className="mono text-[11px] font-medium" style={{ color: "var(--signal)" }}>
          {index}
        </span>
        <span className="h-px w-8" style={{ background: "var(--signal)" }} />
        <span className="tag">{eyebrow}</span>
      </motion.div>

      <motion.div variants={revealUp} className="mt-4">
        <h2 className="h2 max-w-[22ch]">{title}</h2>
        {lead ? <p className="lead mt-4 max-w-[62ch]">{lead}</p> : null}
      </motion.div>
    </motion.div>
  );
}
