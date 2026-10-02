"use client";
import Image from "next/image";
import { useCallback, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { Shot } from "@/lib/galleries";

interface Props {
  title: string;
  shots: Shot[];
  index: number | null;
  onClose: () => void;
  onIndex: (next: number) => void;
}

export default function Lightbox({ title, shots, index, onClose, onIndex }: Props) {
  const open = index !== null;
  const stripRef = useRef<HTMLDivElement>(null);

  const step = useCallback(
    (delta: number) => {
      if (index === null) return;
      onIndex((index + delta + shots.length) % shots.length);
    },
    [index, shots.length, onIndex]
  );

  // Keyboard is the whole point of a viewer like this: arrows to move, Esc out.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, onClose, step]);

  // Keep the active thumbnail in view as the selection moves.
  useEffect(() => {
    if (index === null || !stripRef.current) return;
    const active = stripRef.current.querySelector<HTMLElement>(`[data-i="${index}"]`);
    active?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [index]);

  const shot = index === null ? null : shots[index];

  return (
    <AnimatePresence>
      {open && shot ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex flex-col"
          style={{ background: "rgb(14 16 19 / 0.94)", backdropFilter: "blur(6px)" }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label={`${title} screenshots`}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between gap-4 px-5 py-3 border-b shrink-0"
            style={{ borderColor: "rgb(255 255 255 / 0.12)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="min-w-0">
              <div className="text-[14px] font-medium text-white truncate">{title}</div>
              <div className="mono text-[10.5px] mt-0.5" style={{ color: "rgb(255 255 255 / 0.5)" }}>
                {String(index + 1).padStart(2, "0")} / {String(shots.length).padStart(2, "0")} ·{" "}
                {shot.caption}
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close viewer"
              className="grid place-items-center w-9 h-9 border transition-colors hover:bg-white/10"
              style={{ borderColor: "rgb(255 255 255 / 0.18)", color: "#fff" }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Stage. The image scrolls when it is taller than the viewport, so a
              long dashboard capture can be read top to bottom. */}
          <div className="flex-1 min-h-0 flex items-center gap-2 px-2 sm:px-4">
            <button
              onClick={(e) => {
                e.stopPropagation();
                step(-1);
              }}
              aria-label="Previous screenshot"
              className="hidden sm:grid place-items-center w-10 h-10 shrink-0 border transition-colors hover:bg-white/10"
              style={{ borderColor: "rgb(255 255 255 / 0.18)", color: "#fff" }}
            >
              <ChevronLeft size={18} />
            </button>

            <div
              className="flex-1 min-w-0 h-full overflow-auto py-4"
              onClick={(e) => e.stopPropagation()}
            >
              <motion.div
                key={shot.src}
                initial={{ opacity: 0, scale: 0.985 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
                className="mx-auto w-fit max-w-full border"
                style={{ borderColor: "rgb(255 255 255 / 0.14)" }}
              >
                <Image
                  src={shot.src}
                  alt={`${title}: ${shot.caption}`}
                  width={1600}
                  height={1000}
                  className="block w-auto max-w-full h-auto"
                  style={{ maxHeight: "none" }}
                  unoptimized
                />
              </motion.div>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                step(1);
              }}
              aria-label="Next screenshot"
              className="hidden sm:grid place-items-center w-10 h-10 shrink-0 border transition-colors hover:bg-white/10"
              style={{ borderColor: "rgb(255 255 255 / 0.18)", color: "#fff" }}
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Thumbnail strip */}
          <div
            ref={stripRef}
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 flex gap-2 overflow-x-auto px-4 py-3 border-t"
            style={{ borderColor: "rgb(255 255 255 / 0.12)" }}
          >
            {shots.map((s, i) => (
              <button
                key={s.src}
                data-i={i}
                onClick={() => onIndex(i)}
                aria-label={s.caption}
                aria-current={i === index}
                className="relative w-24 sm:w-28 aspect-16/10 shrink-0 overflow-hidden border transition-all"
                style={{
                  borderColor: i === index ? "var(--signal)" : "rgb(255 255 255 / 0.16)",
                  opacity: i === index ? 1 : 0.5,
                }}
              >
                <Image src={s.src} alt="" fill sizes="112px" className="object-cover object-top" unoptimized />
              </button>
            ))}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
