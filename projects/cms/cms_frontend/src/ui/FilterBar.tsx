import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Input } from './Field';

/** A row of filters above a list. Filters change the query, never a client-side array. */
export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="ui-filterbar" role="search">
      {children}
    </div>
  );
}

/** Debounced search box; `onSearch` fires once typing pauses. */
export function SearchInput({ onSearch, placeholder = 'Search', delay = 300, initial = '' }: { onSearch: (query: string) => void; placeholder?: string; delay?: number; initial?: string }) {
  const [text, setText] = useState(initial);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const timer = window.setTimeout(() => onSearch(text.trim()), delay);
    return () => window.clearTimeout(timer);
  }, [text, delay, onSearch]);
  return (
    <div className="ui-field is-grow">
      <Input type="search" aria-label={placeholder} placeholder={placeholder} value={text} onChange={(event) => setText(event.target.value)} />
    </div>
  );
}
