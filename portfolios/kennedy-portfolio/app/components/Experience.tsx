"use client";
import { motion } from "framer-motion";
import { Download, FileText } from "lucide-react";
import { experience, resume } from "@/lib/data";
import { inView, inViewTall, revealUp } from "@/lib/motion";
import SectionHeader from "./SectionHeader";

export default function Experience() {
  return (
    <section id="experience" className="section py-16 md:py-20">
      <div className="wrap">
        <SectionHeader index="03" eyebrow="Experience" title="Where the work happened" />

        {/* A single rail runs the length of the list; each role hangs off it with a
            node that lights up on hover. */}
        <div className="mt-10 relative">
          <div
            aria-hidden
            className="absolute left-0 md:left-[10.5rem] top-[6px] bottom-[6px] w-px"
            style={{ background: "var(--line)" }}
          />

          <div className="flex flex-col gap-7">
            {experience.map((role, i) => (
              <motion.div
                key={`${role.org}-${role.period}`}
                variants={revealUp}
                initial="hidden"
                whileInView="show"
                viewport={inViewTall}
                className="group grid md:grid-cols-[10.5rem_1fr] gap-x-7 gap-y-2.5 relative pl-6 md:pl-0"
              >
                <span
                  aria-hidden
                  className="absolute left-0 md:left-[10.5rem] top-[6px] w-[5px] h-[5px] -translate-x-[2px] rounded-full transition-colors duration-300"
                  style={{ background: "var(--text-4)" }}
                />
                <span
                  aria-hidden
                  className="absolute left-0 md:left-[10.5rem] top-[6px] w-[5px] h-[5px] -translate-x-[2px] rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  style={{ background: "var(--signal)", boxShadow: "0 0 12px var(--signal)" }}
                />

                <div className="md:text-right md:pr-7">
                  <div className="mono text-[10px]" style={{ color: "var(--text-3)" }}>
                    {role.period}
                  </div>
                  <div className="text-[11.5px] mt-1 leading-snug" style={{ color: "var(--text-2)" }}>
                    {role.org}
                  </div>
                </div>

                <div className="md:pl-7 min-w-0">
                  <h3 className="text-[14px] font-medium tracking-[-0.015em]">{role.role}</h3>
                  <ul className="mt-2.5 flex flex-col gap-1.5">
                    {role.points.map((point) => (
                      <li key={point} className="flex gap-2.5">
                        <span
                          aria-hidden
                          className="mt-[0.52rem] w-2 h-px shrink-0"
                          style={{ background: "var(--text-4)" }}
                        />
                        <span className="text-[12.5px] leading-[1.6]" style={{ color: "var(--text-2)" }}>
                          {point}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* The résumé is the thing a recruiter came for, so it gets a real block
            with its filename, size and date rather than a link in the nav bar. */}
        <motion.a
          href={resume.href}
          download={resume.filename}
          variants={revealUp}
          initial="hidden"
          whileInView="show"
          viewport={inView}
          className="group panel lift mt-8 p-4 flex flex-wrap items-center gap-4 justify-between"
        >
          <span className="flex items-center gap-3.5 min-w-0">
            <span
              className="grid place-items-center w-9 h-9 shrink-0 border"
              style={{ borderColor: "var(--line-2)", background: "var(--bg-inset)" }}
            >
              <FileText size={15} style={{ color: "var(--signal)" }} />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-medium tracking-[-0.01em]">
                Full résumé, {resume.pages} pages
              </span>
              <span className="mono text-[9.5px] block mt-0.5" style={{ color: "var(--text-3)" }}>
                {resume.filename} · PDF · {resume.size} · updated {resume.updated}
              </span>
            </span>
          </span>

          <span className="btn btn-primary shrink-0 !py-2 !px-3.5">
            <Download size={13} /> DOWNLOAD
          </span>
        </motion.a>
      </div>
    </section>
  );
}
