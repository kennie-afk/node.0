"use client";
import { useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { Maximize2 } from "lucide-react";
import GithubMark from "./GithubMark";
import { projects, evidenceNote } from "@/lib/data";
import SectionHeader from "./SectionHeader";
import { inView, inViewTall, revealUp, revealUpAt, revealFade, stagger } from "@/lib/motion";
import Lightbox from "./Lightbox";
import { galleries } from "@/lib/galleries";

export default function Projects() {
  // One viewer for the whole grid; the open card decides what it shows.
  const [viewer, setViewer] = useState<{ slug: string; title: string; index: number } | null>(null);

  return (
    <section id="systems" className="section py-16 md:py-20">
      <div className="wrap">
        <SectionHeader
          index="02"
          eyebrow="Systems"
          title="Systems built"
        />

        {/* Index first: every system at a glance, one row each, before anyone has to
            scroll through cards to find out what is here. */}
        <motion.div
          variants={stagger(0.055)}
          initial="hidden"
          whileInView="show"
          viewport={inViewTall}
          className="mt-10 panel overflow-hidden"
        >
          <table className="w-full">
            <motion.tbody variants={stagger(0.055)}>
              {projects.map((p, i) => (
                <motion.tr
                  key={p.slug}
                  variants={revealFade}
                  className="row-hover border-b last:border-b-0"
                  style={{ borderColor: "var(--line)" }}
                >
                  <td className="mono text-[10px] pl-4 pr-2 py-2 w-9" style={{ color: "var(--signal)" }}>
                    {String(i + 1).padStart(2, "0")}
                  </td>
                  <td className="py-2 pr-3 text-[12.5px] font-medium whitespace-nowrap">{p.title}</td>
                  <td
                    className="py-2 pr-3 text-[11.5px] hidden sm:table-cell"
                    style={{ color: "var(--text-3)" }}
                  >
                    {p.subtitle}
                  </td>
                  <td
                    className="mono text-[10.5px] py-2 pr-3 text-right whitespace-nowrap hidden md:table-cell"
                    style={{ color: "var(--text-3)" }}
                  >
                    {p.lang}
                  </td>
                  <td className="py-2 pr-4 text-right whitespace-nowrap w-24">
                    <span className="numeral text-[12px]">{p.tests}</span>
                    <span className="mono text-[9.5px] ml-1" style={{ color: "var(--text-4)" }}>
                      tests
                    </span>
                  </td>
                </motion.tr>
              ))}
            </motion.tbody>
          </table>
        </motion.div>

        <motion.div
          variants={revealFade}
          initial="hidden"
          whileInView="show"
          viewport={inView}
          className="mt-6 flex items-start gap-3 max-w-[86ch]"
        >
          <span className="mt-[7px] h-px w-5 shrink-0" style={{ background: "var(--signal)" }} />
          <p className="text-[11.5px] leading-[1.65]" style={{ color: "var(--text-4)" }}>
            <span className="mono uppercase tracking-[0.14em] text-[10px]" style={{ color: "var(--signal)" }}>
              Provenance ·{" "}
            </span>
            {evidenceNote}
          </p>
        </motion.div>

        {/* Cards. Deliberately small: a plate, a name, one sentence, three
            figures, the stack. Anything longer belongs in the repository. */}
        <div className="mt-10 grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map((project, i) => (
            <motion.article
              key={project.id}
              variants={revealUpAt(i % 3)}
              initial="hidden"
              whileInView="show"
              viewport={inViewTall}
              className="group panel lift flex flex-col overflow-hidden"
            >
              <button
                type="button"
                onClick={() =>
                  setViewer({ slug: project.slug, title: project.title, index: 0 })
                }
                aria-label={`View ${project.title} screenshots`}
                className="relative aspect-16/9 overflow-hidden border-b shrink-0 cursor-zoom-in text-left"
                style={{ borderColor: "var(--line)", background: "var(--bg-inset)" }}
              >
                <Image
                  src={project.image}
                  alt={`${project.title}: ${project.subtitle}`}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                  className="object-cover object-top grayscale-[25%] transition-all duration-700 group-hover:grayscale-0 group-hover:scale-[1.03]"
                />

                {/* Shot count doubles as the affordance that this opens. */}
                <span
                  className="absolute bottom-0 left-0 mono text-[9px] px-1.5 py-1 border-r border-t flex items-center gap-1.5"
                  style={{
                    background: "rgb(var(--scrim) / 0.92)",
                    borderColor: "var(--line)",
                    color: "var(--text-3)",
                  }}
                >
                  <Maximize2 size={9} /> {galleries[project.slug]?.length ?? 0} SHOTS
                </span>
                <span
                  aria-hidden
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  style={{ background: "rgb(217 45 32 / 0.07)" }}
                />
              </button>

              <div className="p-4 flex flex-col flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="display text-[1.15rem] leading-none">{project.title}</h3>
                  <span
                    className="mono text-[9px] shrink-0 uppercase tracking-[0.1em]"
                    style={{ color: "var(--text-4)" }}
                  >
                    {project.lang}
                  </span>
                </div>

                <div className="tag !text-[9.5px] mt-1.5 truncate">{project.domain}</div>

                <p
                  className="mt-2.5 text-[12px] leading-[1.6] line-clamp-2"
                  style={{ color: "var(--text-2)" }}
                >
                  {project.description}
                </p>

                <dl
                  className="mt-3.5 grid grid-cols-3 gap-px border-y"
                  style={{ background: "var(--line)", borderColor: "var(--line)" }}
                >
                  {project.metrics.slice(0, 3).map((metric) => (
                    <div key={metric.label} className="px-2 py-2" style={{ background: "var(--bg-panel)" }}>
                      <dt className="numeral text-[12px] leading-none truncate">{metric.value}</dt>
                      <dd
                        className="mono text-[9px] mt-1 truncate"
                        style={{ color: "var(--text-4)" }}
                      >
                        {metric.label}
                      </dd>
                    </div>
                  ))}
                </dl>

                <div className="flex items-center gap-1.5 mt-3 overflow-hidden">
                  {project.tech.slice(0, 3).map((tech) => (
                    <span key={tech} className="chip !text-[9px] !px-1.5 !py-[3px]">
                      {tech}
                    </span>
                  ))}
                  {project.tech.length > 3 ? (
                    <span className="chip !text-[9px] !px-1.5 !py-[3px]">
                      +{project.tech.length - 3}
                    </span>
                  ) : null}
                </div>

                <div className="flex items-center gap-4 mt-auto pt-3.5">
                  {project.github ? (
                    <a
                      href={project.github}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ul mono text-[10px] flex items-center gap-1.5 pb-0.5"
                      style={{ color: "var(--text-3)" }}
                    >
                      <GithubMark size={11} /> SOURCE
                    </a>
                  ) : null}
                  <span className="mono text-[10px]" style={{ color: "var(--text-4)" }}>
                    {project.lang}
                  </span>
                </div>
              </div>
            </motion.article>
          ))}
        </div>
      </div>

      <Lightbox
        title={viewer?.title ?? ""}
        shots={viewer ? galleries[viewer.slug] ?? [] : []}
        index={viewer?.index ?? null}
        onClose={() => setViewer(null)}
        onIndex={(next) => setViewer((v) => (v ? { ...v, index: next } : v))}
      />
    </section>
  );
}
