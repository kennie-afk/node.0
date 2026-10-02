"use client";
import { motion } from "framer-motion";
import { capabilities } from "@/lib/data";
import { inView, revealUpAt } from "@/lib/motion";
import SectionHeader from "./SectionHeader";

export default function Capabilities() {
  return (
    <section id="capabilities" className="section py-16 md:py-20">
      <div className="wrap">
        <SectionHeader
          index="01"
          eyebrow="Capabilities"
          title="What I build"
        />

        {/* A two-up grid of compact panels. The earlier full-width rows opened a
            dead gutter under every short title and made the section read as a
            list of paragraphs rather than a set of things. */}
        <div className="mt-10 grid md:grid-cols-2 gap-px" style={{ background: "var(--line)" }}>
          {capabilities.map((cap, i) => (
            <motion.div
              key={cap.title}
              variants={revealUpAt(i % 2)}
              initial="hidden"
              whileInView="show"
              viewport={inView}
              className="group p-5 transition-colors duration-300 hover:bg-[var(--bg-panel)]"
              style={{ background: "var(--bg)" }}
            >
              <div className="flex items-baseline gap-2.5">
                <span
                  className="mono text-[10px] transition-colors duration-300"
                  style={{ color: "var(--signal)" }}
                >
                  {cap.index}
                </span>
                <h3 className="text-[15px] font-medium tracking-[-0.02em]">{cap.title}</h3>
              </div>

              <p className="mt-2.5 text-[13px] leading-[1.65]" style={{ color: "var(--text-2)" }}>
                {cap.body}
              </p>

              <div className="flex flex-wrap gap-1.5 mt-3.5">
                {cap.tags.map((tag) => (
                  <span key={tag} className="chip !text-[9.5px] !px-1.5 !py-[3px]">
                    {tag}
                  </span>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
