import { useEffect, useId, useRef, useState } from 'react';
import { cx } from './classes';

export interface ComboOption<V = number> {
  value: V;
  label: string;
  meta?: string;
}

interface Props<V> {
  /** Asks the server; never load a whole table into the browser. */
  search: (query: string) => Promise<Array<ComboOption<V>>>;
  value: ComboOption<V> | null;
  onChange: (option: ComboOption<V> | null) => void;
  placeholder?: string;
  disabled?: boolean;
  debounceMs?: number;
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

/** Type-ahead picker with server-side search, arrow-key navigation, and ARIA combobox wiring. */
export function Combobox<V = number>({ search, value, onChange, placeholder = 'Search', disabled, debounceMs = 250, id, ...aria }: Props<V>) {
  const listId = useId();
  const [text, setText] = useState('');
  const [options, setOptions] = useState<Array<ComboOption<V>>>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    window.clearTimeout(timer.current);
    const ticket = ++latest.current;
    timer.current = window.setTimeout(async () => {
      setLoading(true);
      try {
        const found = await search(text);
        if (ticket === latest.current) {
          setOptions(found);
          setActive(0);
        }
      } catch {
        if (ticket === latest.current) setOptions([]);
      } finally {
        if (ticket === latest.current) setLoading(false);
      }
    }, debounceMs);
    return () => window.clearTimeout(timer.current);
  }, [text, open, search, debounceMs]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const choose = (option: ComboOption<V> | null) => {
    onChange(option);
    setText('');
    setOpen(false);
  };

  return (
    <div className="ui-combo" ref={box}>
      <input
        {...aria}
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && options[active] ? `${listId}-${active}` : undefined}
        className={cx('ui-input')}
        disabled={disabled}
        placeholder={value ? value.label : placeholder}
        value={open ? text : value ? value.label : ''}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setText(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(i + 1, Math.max(options.length - 1, 0)));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (event.key === 'Enter' && open && options[active]) {
            event.preventDefault();
            choose(options[active]);
          } else if (event.key === 'Escape') {
            setOpen(false);
          } else if (event.key === 'Backspace' && text === '' && value) {
            choose(null);
          }
        }}
      />
      {open && (
        <ul className="ui-combo-list" role="listbox" id={listId}>
          {loading && options.length === 0 && <li className="ui-combo-empty">Searching</li>}
          {!loading && options.length === 0 && <li className="ui-combo-empty">No matches</li>}
          {options.map((option, index) => (
            <li
              key={String(option.value)}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              className="ui-combo-opt"
              onMouseDown={(event) => {
                event.preventDefault();
                choose(option);
              }}
              onMouseEnter={() => setActive(index)}
            >
              {option.label}
              {option.meta && <span className="ui-combo-meta"> {option.meta}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
