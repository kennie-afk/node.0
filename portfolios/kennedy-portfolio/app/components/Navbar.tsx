"use client";
import { useEffect, useState } from "react";
import { motion, useScroll, useSpring, AnimatePresence } from "framer-motion";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { resume } from "@/lib/data";

const LINKS = [
  { id: "capabilities", label: "Capabilities" },
  { id: "systems", label: "Systems" },
  { id: "experience", label: "Experience" },
  { id: "stack", label: "Stack" },
  { id: "contact", label: "Contact" },
];

export default function Navbar() {
  const [active, setActive] = useState("home");
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Scroll-linked progress rail sitting on the navbar's bottom hairline.
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 320, damping: 40, mass: 0.2 });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: [0, 0.2, 0.6] }
    );
    document.querySelectorAll("section[id]").forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  // Lock body scroll while the mobile menu is open, and close it on Escape.
  useEffect(() => {
    if (!mobileOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [mobileOpen]);

  return (
    <nav
      className="fixed top-0 inset-x-0 z-50 transition-colors duration-300"
      style={{
        height: "var(--nav-h)",
        background: scrolled || mobileOpen ? "rgb(var(--scrim) / 0.78)" : "transparent",
        backdropFilter: scrolled || mobileOpen ? "blur(14px) saturate(140%)" : "none",
        borderBottom: `1px solid ${scrolled || mobileOpen ? "var(--line)" : "transparent"}`,
      }}
    >
      <div className="wrap h-full flex items-center justify-between gap-6">
        <a href="#home" className="flex items-center gap-3 shrink-0" onClick={() => setMobileOpen(false)}>
          <span
            className="mono text-[10px] tracking-[0.2em] px-1.5 py-1 border"
            style={{ borderColor: "var(--line-2)", color: "var(--signal)" }}
          >
            KM
          </span>
          <span className="hidden sm:block text-[14px] font-medium tracking-[-0.02em]">
            Kennedy Mwanzia
          </span>
        </a>

        <div className="hidden lg:flex items-center gap-0.5">
          {LINKS.map((link, i) => {
            const on = active === link.id;
            return (
              <a
                key={link.id}
                href={`#${link.id}`}
                className="group relative px-3 py-2 text-[12.5px] transition-colors duration-200"
                style={{ color: on ? "var(--text)" : "var(--text-3)" }}
              >
                <span
                  className="mono text-[9px] mr-1.5 align-super"
                  style={{ color: on ? "var(--signal)" : "var(--text-4)" }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                {link.label}
              </a>
            );
          })}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <a
            href={resume.href}
            download={resume.filename}
            className="btn btn-ghost !py-2 !px-3.5 hidden sm:inline-flex"
          >
            RÉSUMÉ <ArrowUpRight size={13} />
          </a>

          <button
            type="button"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
            className="lg:hidden inline-flex items-center justify-center w-9 h-9 border transition-colors duration-200"
            style={{ borderColor: "var(--line-2)", color: "var(--text)" }}
          >
            {mobileOpen ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>
      </div>

      <motion.div
        aria-hidden
        className="absolute bottom-0 left-0 h-px origin-left"
        style={{ scaleX: progress, background: "var(--signal)", width: "100%" }}
      />

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="lg:hidden absolute top-full inset-x-0"
            style={{
              background: "rgb(var(--scrim) / 0.98)",
              backdropFilter: "blur(14px) saturate(140%)",
              borderBottom: "1px solid var(--line)",
            }}
          >
            <div className="wrap py-4 flex flex-col">
              {LINKS.map((link, i) => {
                const on = active === link.id;
                return (
                  <a
                    key={link.id}
                    href={`#${link.id}`}
                    onClick={() => setMobileOpen(false)}
                    className="row-hover flex items-center gap-2.5 py-3 text-[15px]"
                    style={{ color: on ? "var(--text)" : "var(--text-2)" }}
                  >
                    <span className="mono text-[10px]" style={{ color: on ? "var(--signal)" : "var(--text-4)" }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {link.label}
                  </a>
                );
              })}
              <a
                href={resume.href}
                download={resume.filename}
                onClick={() => setMobileOpen(false)}
                className="btn btn-primary mt-3 sm:hidden"
              >
                RÉSUMÉ <ArrowUpRight size={13} />
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
