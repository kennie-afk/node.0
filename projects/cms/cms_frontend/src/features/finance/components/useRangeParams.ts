import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { todayISO, yearStartISO } from '../../../ui';

export interface RangeParams {
  from: string;
  to: string;
  fundId: string;
  asOf: string;
  set: (patch: Record<string, string | undefined>) => void;
}

/** Report filters live in the URL so a report can be bookmarked, shared and printed as shown. */
export function useRangeParams(): RangeParams {
  const [params, setParams] = useSearchParams();
  const set = useCallback(
    (patch: Record<string, string | undefined>) => {
      const next = new URLSearchParams(params);
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === '') next.delete(key);
        else next.set(key, value);
      }
      setParams(next, { replace: true });
    },
    [params, setParams]
  );
  return useMemo(
    () => ({
      from: params.get('from') ?? yearStartISO(),
      to: params.get('to') ?? todayISO(),
      fundId: params.get('fundId') ?? '',
      asOf: params.get('asOf') ?? todayISO(),
      set
    }),
    [params, set]
  );
}

