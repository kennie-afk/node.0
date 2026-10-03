"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

type Flash = (message: string | null) => void;
const FlashContext = createContext<Flash | null>(null);

/**
 * A confirmation that outlives the form that caused it. Many actions change what the page shows (a loan moves to the next
 * step), which removes the very form that would have said "done"; the layout stays mounted, so the message is kept here until
 * the person dismisses it or moves to another page.
 */
export function FlashProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const pathname = usePathname();
  useEffect(() => setMessage(null), [pathname]);
  return (
    <FlashContext.Provider value={setMessage}>
      {children}
      {message ? (
        <div role="status" className="fixed bottom-5 left-1/2 z-50 flex max-w-xl -translate-x-1/2 items-start gap-3 rounded-lg border border-[#c8e9db] bg-[var(--color-good-soft)] px-4 py-3 text-[0.8125rem] leading-relaxed text-[var(--color-good)] shadow-sm">
          <span>{message}</span>
          <button type="button" onClick={() => setMessage(null)} aria-label="Dismiss" className="shrink-0 font-semibold">×</button>
        </div>
      ) : null}
    </FlashContext.Provider>
  );
}

export const useFlash = (): Flash => useContext(FlashContext) ?? (() => undefined);
