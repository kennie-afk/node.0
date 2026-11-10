import { useCallback, useSyncExternalStore } from 'react';

export type Theme = 'dark' | 'light';

const read = (): Theme => (document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
const listeners = new Set<() => void>();

export function setTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem('theme', theme);
  } catch {
    // Storage can be blocked; the choice then lasts for this page view only.
  }
  listeners.forEach((l) => l());
}

/** Current theme and a toggle. Light unless the person (or their system) chose dark. */
export function useTheme() {
  const theme = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => 'light' as Theme
  );
  const toggle = useCallback(() => setTheme(read() === 'dark' ? 'light' : 'dark'), []);
  return { theme, toggle };
}
