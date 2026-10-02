"use client";
import { motion } from "framer-motion";
import { Icon } from "@iconify/react";
import { skillGroups } from "@/lib/data";
import { inView, revealUpAt } from "@/lib/motion";
import SectionHeader from "./SectionHeader";

export default function Skills() {
  return (
    <section id="stack" className="section py-16 md:py-20">
      <div className="wrap">
        <SectionHeader
          index="04"
          eyebrow="Stack"
          title="The stack, as it appears in the repositories"
        />

        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-px" style={{ background: "var(--line)" }}>
          {skillGroups.map((group, i) => (
            <motion.div
              key={group.group}
              variants={revealUpAt(i % 4)}
              initial="hidden"
              whileInView="show"
              viewport={inView}
              className="p-6 transition-colors duration-300 row-hover"
              style={{ background: "var(--bg)" }}
            >
              <div className="flex items-baseline gap-2.5 mb-5">
                <span className="mono text-[10px]" style={{ color: "var(--signal)" }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="tag !text-[var(--text-2)]">{group.group}</h3>
              </div>
              <ul className="flex flex-col gap-2.5">
                {group.items.map((item) => (
                  <li
                    key={item.name}
                    className="mono text-[11.5px] leading-relaxed flex items-center gap-2"
                    style={{ color: "var(--text-3)" }}
                  >
                    {item.icon ? (
                      <Icon
                        icon={`simple-icons:${item.icon}`}
                        width={13}
                        height={13}
                        className="shrink-0"
                      />
                    ) : (
                      <span className="w-[13px] shrink-0" aria-hidden />
                    )}
                    {item.name}
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
