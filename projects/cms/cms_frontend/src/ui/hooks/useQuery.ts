import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeError, type ApiError } from '../../api/http';

export interface QueryState<T> {
  data: T | undefined;
  error: ApiError | null;
  loading: boolean;
  refetch: () => void;
}

interface Settled<T> {
  run: string;
  data: T | undefined;
  error: ApiError | null;
}

/**
 * Small fetch hook: runs `fetcher` when `deps` change, ignores a response that arrives after a
 * newer request started, and keeps the previous data on screen while refetching. No cache and no
 * dependency; screens that need more can grow into it. `loading` is derived (a run has started
 * that has not settled), so the effect never has to set state synchronously.
 */
export function useQuery<T>(fetcher: () => Promise<T>, deps: readonly unknown[], options: { enabled?: boolean } = {}): QueryState<T> {
  const { enabled = true } = options;
  const [tick, setTick] = useState(0);
  const [settled, setSettled] = useState<Settled<T>>({ run: '', data: undefined, error: null });
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });
  // Each distinct (deps, tick) is one run; it stays current until the inputs change again.
  const current = `${JSON.stringify(deps)}|${tick}`;

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    fetcherRef
      .current()
      .then((data) => live && setSettled({ run: current, data, error: null }))
      .catch((failure) => live && setSettled((previous) => ({ run: current, data: previous.data, error: normalizeError(failure) })));
    return () => {
      live = false;
    };
  }, [enabled, current]);

  const refetch = useCallback(() => setTick((n) => n + 1), []);
  return { data: settled.data, error: settled.run === current ? settled.error : null, loading: enabled && settled.run !== current, refetch };
}
