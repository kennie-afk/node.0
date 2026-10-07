"use client";

import { useRef, useState } from "react";
import { inputClass } from "@/components/ui";

export interface PickOption { id: string; label: string; hint?: string; /** anything the form needs to know about the choice, such as a product's class */ meta?: string }

/**
 * Pick one record by searching for it, instead of choosing from a list that has to hold all of them. It asks the server
 * for at most a dozen matches as the person types, so it works the same for 20 products or 20,000. The chosen id is posted
 * with the form under `name` (or reported through onPick for forms that build their own request).
 */
export function Picker({ name, search, placeholder, onPick, initial, required }: {
  name?: string;
  search: (query: string) => Promise<PickOption[]>;
  placeholder: string;
  onPick?: (option: PickOption | null) => void;
  initial?: PickOption | null;
  required?: boolean;
}) {
  const [chosen, setChosen] = useState<PickOption | null>(initial ?? null);
  const [text, setText] = useState("");
  const [options, setOptions] = useState<PickOption[]>([]);
  const [searched, setSearched] = useState(false);
  const latest = useRef(0);

  async function type(value: string) {
    setText(value);
    const ticket = (latest.current += 1);
    if (value.trim().length < 1) { setOptions([]); setSearched(false); return; }
    const found = await search(value.trim());
    if (ticket === latest.current) { setOptions(found); setSearched(true); }
  }
  function pick(option: PickOption | null) {
    setChosen(option);
    setText("");
    setOptions([]);
    setSearched(false);
    onPick?.(option);
  }

  if (chosen) {
    return (
      <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-[0.8125rem]">
        <span className="min-w-0 truncate">{chosen.label}{chosen.hint ? <span className="ml-2 text-[var(--color-faint)]">{chosen.hint}</span> : null}</span>
        {name ? <input type="hidden" name={name} value={chosen.id} /> : null}
        <button type="button" onClick={() => pick(null)} className="shrink-0 text-[0.75rem] font-medium text-[var(--color-muted)] underline">Change</button>
      </div>
    );
  }
  return (
    <div className="relative">
      <input value={text} onChange={(e) => void type(e.target.value)} placeholder={placeholder} autoComplete="off" required={required && !chosen} className={inputClass} aria-label={placeholder} />
      {options.length > 0 ? (
        <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] text-[0.8125rem] shadow-sm">
          {options.map((o) => (
            <li key={o.id}><button type="button" onClick={() => pick(o)} className="block w-full px-3 py-2 text-left">{o.label}{o.hint ? <span className="ml-2 text-[var(--color-faint)]">{o.hint}</span> : null}</button></li>
          ))}
        </ul>
      ) : searched ? <p className="mt-1 text-[0.75rem] text-[var(--color-faint)]">Nothing matches.</p> : null}
    </div>
  );
}
