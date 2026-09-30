import { useCallback, useRef, useState } from 'react';
import { useToast } from '../../../ui';
import { newIdempotencyKey, normalizeError, type ApiError } from '../../../api/http';

/**
 * Runs a submit handler with loading state, error capture and a stable Idempotency-Key for the
 * life of one user action. The key is renewed after a success so the next action is a new one.
 */
export function useSubmit() {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const key = useRef(newIdempotencyKey());
  const run = useCallback(
    async <T,>(work: (idempotencyKey: string) => Promise<T>, success?: string): Promise<T | undefined> => {
      setLoading(true);
      setError(null);
      try {
        const result = await work(key.current);
        key.current = newIdempotencyKey();
        if (success) toast.success(success);
        return result;
      } catch (failure) {
        setError(normalizeError(failure));
        return undefined;
      } finally {
        setLoading(false);
      }
    },
    [toast]
  );
  return { run, loading, error, clearError: () => setError(null) };
}

