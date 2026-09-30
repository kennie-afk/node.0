import { useCallback, useEffect, useRef, useState } from 'react';
import { http, normalizeError, type ApiError, type KeysetPage, type Query } from '../../api/http';

export interface KeysetList<T> {
  items: T[];
  loading: boolean;
  loadingMore: boolean;
  error: ApiError | null;
  hasMore: boolean;
  loadMore: () => void;
  refresh: () => void;
}

interface Loaded<T> {
  request: string;
  items: T[];
  cursor: string | null;
  error: ApiError | null;
}

/**
 * Cursor-paged list against `{data, nextCursor, limit}` endpoints (journal, audit, registers).
 * Changing `params` (filters) starts again from the first page; stale responses are dropped.
 */
export function useKeysetList<T>(path: string, params: Query = {}, options: { limit?: number; enabled?: boolean } = {}): KeysetList<T> {
  const { limit = 50, enabled = true } = options;
  const [tick, setTick] = useState(0);
  const [loaded, setLoaded] = useState<Loaded<T>>({ request: '', items: [], cursor: null, error: null });
  const [loadingMore, setLoadingMore] = useState(false);
  const key = JSON.stringify(params);
  const request = `${path}|${key}|${limit}|${tick}`;
  const latest = useRef(request);
  useEffect(() => {
    latest.current = request;
  });

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    http
      .get<KeysetPage<T>>(path, { ...JSON.parse(key), limit })
      .then((page) => live && setLoaded({ request, items: page.data, cursor: page.nextCursor, error: null }))
      .catch((failure) => live && setLoaded((previous) => ({ ...previous, request, error: normalizeError(failure) })));
    return () => {
      live = false;
    };
  }, [path, key, limit, enabled, request]);

  const loadMore = useCallback(() => {
    if (!loaded.cursor || loadingMore) return;
    const startedFor = request;
    setLoadingMore(true);
    http
      .get<KeysetPage<T>>(path, { ...JSON.parse(key), limit, cursor: loaded.cursor })
      .then((page) => {
        if (latest.current === startedFor) setLoaded((previous) => ({ request: previous.request, items: [...previous.items, ...page.data], cursor: page.nextCursor, error: null }));
      })
      .catch((failure) => {
        if (latest.current === startedFor) setLoaded((previous) => ({ ...previous, error: normalizeError(failure) }));
      })
      .finally(() => setLoadingMore(false));
  }, [loaded.cursor, loadingMore, path, key, limit, request]);

  return {
    items: loaded.items,
    loading: enabled && loaded.request !== request,
    loadingMore,
    error: loaded.error,
    hasMore: loaded.cursor !== null,
    loadMore,
    refresh: () => setTick((n) => n + 1)
  };
}
