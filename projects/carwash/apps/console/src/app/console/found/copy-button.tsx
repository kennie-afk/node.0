"use client";

import { useState } from "react";
import { secondaryButtonClass } from "@/components/ui";

export function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  return (
    <button
      type="button"
      className={secondaryButtonClass}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setState("copied");
        } catch {
          setState("failed");
        }
      }}
    >
      {state === "copied" ? "Copied" : state === "failed" ? "Select the text and copy it" : "Copy summary"}
    </button>
  );
}
