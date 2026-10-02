"use client";
import { motion } from "framer-motion";
import {ArrowUpRight, Mail, MapPin, Phone} from "lucide-react";
import GithubMark from "./GithubMark";
import WhatsAppMark from "./WhatsAppMark";
import { profile } from "@/lib/data";
import { inView, revealUp, revealUpAt } from "@/lib/motion";

const whatsappNumber = profile.phone.replace(/[^\d]/g, "");

const CHANNELS = [
  {
    key: "email",
    label: "Email",
    value: profile.email,
    href: `mailto:${profile.email}?subject=${encodeURIComponent("Engineering role / project")}`,
    Icon: Mail,
  },
  {
    key: "phone",
    label: "Phone",
    value: profile.phone,
    href: `tel:${profile.phone.replace(/\s/g, "")}`,
    Icon: Phone,
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    value: profile.phone,
    href: `https://wa.me/${whatsappNumber}?text=${encodeURIComponent("Hi Kennedy, I'd like to talk about an engineering role / project.")}`,
    Icon: WhatsAppMark,
  },
  {
    key: "github",
    label: "GitHub",
    value: "github.com/kennie-afk",
    href: profile.github,
    Icon: GithubMark,
  },
];

export default function Contact() {
  return (
    <section id="contact" className="section py-16 md:py-20">
      <div className="wrap">
        <div className="rule" />

        <div className="grid lg:grid-cols-[1fr_auto] gap-14 lg:gap-20 items-end pt-20">
          <motion.div
            variants={revealUp}
            initial="hidden"
            whileInView="show"
            viewport={inView}
            className="min-w-0"
          >
            <div className="flex items-center gap-3">
              <span className="mono text-[11px]" style={{ color: "var(--signal)" }}>
                05
              </span>
              <span className="tag">Contact</span>
            </div>

            <h2 className="display text-[clamp(2.4rem,6.5vw,4.5rem)] mt-6">
              Available for work
              <br />
              that needs to{" "}
              <span className="serif" style={{ color: "var(--signal)" }}>
                actually run
              </span>
            </h2>

            <p className="lead mt-7 max-w-[52ch]">
              Open to backend and machine learning engineering roles, and to consulting on
              distributed system design, multi-tenant architecture, retrieval or evaluation.
              Working remotely across time zones.
            </p>

            <a
              href={CHANNELS[0].href}
              className="btn btn-primary mt-10"
            >
              START A CONVERSATION <ArrowUpRight size={13} />
            </a>
          </motion.div>

          {/* Direct routes only. There is no contact form here on purpose: a form
              without a server behind it is a lie told politely. */}
          <motion.div
            variants={revealUpAt(1)}
            initial="hidden"
            whileInView="show"
            viewport={inView}
            className="w-full lg:w-[22rem] shrink-0"
          >
            <div className="border-t" style={{ borderColor: "var(--line)" }}>
              {CHANNELS.map(({ key, label, value, href, Icon }) => (
                <a
                  key={key}
                  href={href}
                  target={key === "github" || key === "whatsapp" ? "_blank" : undefined}
                  rel={key === "github" || key === "whatsapp" ? "noopener noreferrer" : undefined}
                  className="group flex items-center justify-between gap-6 py-5 border-b transition-colors duration-300 row-hover"
                  style={{ borderColor: "var(--line)" }}
                >
                  <span className="flex items-center gap-3.5 min-w-0">
                    <Icon
                      size={14}
                      className="shrink-0 transition-colors duration-300 group-hover:text-[var(--signal)]"
                      style={{ color: "var(--text-4)" }}
                    />
                    <span className="min-w-0">
                      <span className="tag block">{label}</span>
                      <span
                        className="mono text-[12px] block truncate mt-1"
                        style={{ color: "var(--text-2)" }}
                      >
                        {value}
                      </span>
                    </span>
                  </span>
                  <ArrowUpRight
                    size={14}
                    className="shrink-0 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300"
                    style={{ color: "var(--signal)" }}
                  />
                </a>
              ))}

              <div className="flex items-center gap-3.5 py-5">
                <MapPin size={14} className="shrink-0" style={{ color: "var(--text-4)" }} />
                <span>
                  <span className="tag block">Working</span>
                  <span className="mono text-[12px] block mt-1" style={{ color: "var(--text-2)" }}>
                    {profile.location}
                  </span>
                </span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
