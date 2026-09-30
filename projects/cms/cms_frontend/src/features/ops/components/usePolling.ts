import { useEffect, useRef } from 'react';

/**
 * Calls `tick` every `ms` while `active` and the tab is visible, and once more when the tab
 * becomes visible again. The floor is 15 seconds: the API rate-limits per IP and every device on a
 * church's wifi shares one address, so a chatty screen would lock out the whole congregation.
 */
export function usePolling(tick: () => void, ms: number, active = true): void {
  const latest = useRef(tick);
  useEffect(() => {
    latest.current = tick;
  });
  const interval = Math.max(15_000, ms);
  useEffect(() => {
    if (!active) return;
    const run = () => {
      if (document.visibilityState === 'visible') latest.current();
    };
    const timer = window.setInterval(run, interval);
    document.addEventListener('visibilitychange', run);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', run);
    };
  }, [active, interval]);
}
