"use client";
import Image from "next/image";
import { ArrowDown, Download, MapPin } from "lucide-react";
import { motion } from "framer-motion";
import GithubMark from "./GithubMark";
import { headline, profile, projects, resume } from "@/lib/data";
import { inView, revealUpAt } from "@/lib/motion";

const rise = {
  hidden: { opacity: 0, y: 26 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.75, delay: i * 0.09, ease: [0.16, 1, 0.3, 1] as const },
  }),
};

export default function Hero() {
  return (
    <section id="home" className="section pt-[var(--nav-h)]">
      <div className="wrap pt-12 md:pt-16 pb-10">
        <div className="grid lg:grid-cols-[1.25fr_0.75fr] gap-10 lg:gap-16 items-center">
          {/* ------------------------------------------------------------ Left */}
          <div className="min-w-0">
            <motion.div custom={0} variants={rise} initial="hidden" animate="show">
              <span className="rail-tag">{profile.role}</span>
            </motion.div>

            <motion.h1
              custom={1}
              variants={rise}
              initial="hidden"
              animate="show"
              className="display mt-5 text-[clamp(2.5rem,5.6vw,4.25rem)]"
            >
              Software and AI/ML engineering,
              <br />
              multi-tenant SaaS
              <br />
              and the{" "}
              <span className="relative whitespace-nowrap">
                <span className="serif" style={{ color: "var(--signal)" }}>
                  numbers underneath
                </span>
                <svg
                  aria-hidden
                  viewBox="0 0 300 10"
                  preserveAspectRatio="none"
                  className="absolute left-0 -bottom-1.5 w-full h-[7px]"
                >
                  <path
                    d="M2 7 C 70 2, 150 2, 298 5"
                    fill="none"
                    stroke="var(--signal)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    opacity="0.45"
                  />
                </svg>
              </span>
            </motion.h1>

            <motion.p
              custom={2}
              variants={rise}
              initial="hidden"
              animate="show"
              className="lead mt-7 max-w-[56ch]"
            >
              {profile.summary}
            </motion.p>

            <motion.p
              custom={2.4}
              variants={rise}
              initial="hidden"
              animate="show"
              className="lead mt-3.5 max-w-[56ch]"
            >
              {profile.secondary}
            </motion.p>

            <motion.div
              custom={3}
              variants={rise}
              initial="hidden"
              animate="show"
              className="mt-8 flex flex-wrap items-center gap-2.5"
            >
              <a href="#systems" className="btn btn-primary">
                SEE THE SYSTEMS <ArrowDown size={13} />
              </a>
              <a
                href={profile.github}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost"
              >
                <GithubMark size={13} /> GITHUB
              </a>
              <a href={resume.href} download={resume.filename} className="btn btn-ghost">
                <Download size={13} /> RÉSUMÉ
              </a>
            </motion.div>

            <motion.div
              custom={4}
              variants={rise}
              initial="hidden"
              animate="show"
              className="mt-7 flex items-center gap-5 mono text-[11px]"
              style={{ color: "var(--text-3)" }}
            >
              <span className="flex items-center gap-1.5">
                <MapPin size={12} /> {profile.location}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="pulse" /> Available for work
              </span>
            </motion.div>
          </div>

          {/* ----------------------------------------------------------- Right
              A cut-out portrait with no frame and no plate. The background was
              removed from the source photo, so the subject sits on the page
              itself rather than inside a box attached to it. */}
          <motion.div
            custom={2}
            variants={rise}
            initial="hidden"
            animate="show"
            className="cutout-stage w-full max-w-[420px] mx-auto lg:mx-0 lg:justify-self-end"
          >
            <Image
              src="/images/profile-cutout.png"
              alt={profile.name}
              width={1200}
              height={1224}
              sizes="(max-width: 1024px) 80vw, 420px"
              className="cutout-img w-full h-auto select-none"
              priority
            />
          </motion.div>
        </div>
      </div>

      {/* Spec band. Tabular numerals so the four figures align down the column. */}
      <div className="wrap">
        <dl
          className="grid grid-cols-2 lg:grid-cols-4 border-y"
          style={{ borderColor: "var(--line-2)", background: "var(--bg-inset)" }}
        >
          {headline.map((stat, i) => (
            <motion.div
              key={stat.label}
              variants={revealUpAt(i)}
              initial="hidden"
              whileInView="show"
              viewport={inView}
              className="group px-5 py-6 lg:border-r last:border-r-0 border-b lg:border-b-0"
              style={{ borderColor: "var(--line)" }}
            >
              <span className="block w-6 h-[2px] mb-3.5" style={{ background: "var(--signal)" }} />
              <dt className="numeral text-[clamp(1.6rem,2.8vw,2.125rem)] leading-none">
                {stat.value}
              </dt>
              <dd className="mt-2.5 text-[12.5px] leading-snug" style={{ color: "var(--text-2)" }}>
                {stat.label}
              </dd>
              <dd
                className="mono text-[10px] mt-1.5 leading-relaxed"
                style={{ color: "var(--text-4)" }}
              >
                {stat.method}
              </dd>
            </motion.div>
          ))}
        </dl>
      </div>
    </section>
  );
}
