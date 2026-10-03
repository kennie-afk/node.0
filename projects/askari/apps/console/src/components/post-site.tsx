"use client";

import { useEffect, useRef } from "react";

/** Keeps a hidden `siteId` in step with whichever post is chosen in the same form. */
export function PostSiteField({ map }: { map: Record<string, string> }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const form = ref.current?.form;
    const select = form?.querySelector<HTMLSelectElement>("select[name=postId]");
    if (!form || !select || !ref.current) return;
    const sync = () => { ref.current!.value = map[select.value] ?? ""; };
    sync();
    select.addEventListener("change", sync);
    return () => select.removeEventListener("change", sync);
  }, [map]);
  return <input ref={ref} type="hidden" name="siteId" defaultValue="" />;
}
