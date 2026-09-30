import { useEffect, useMemo, useState } from 'react';
import { memberName } from '../lookups';

/**
 * Resolves member ids to names for a list that only carries ids. Returns a function so callers
 * write `names(id)`; it shows "Member #id" until the name arrives. Each id is fetched once.
 */
export function useMemberNames(ids: Array<number | null | undefined>): (id: number) => string {
  const [resolved, setResolved] = useState<Record<number, string>>({});
  const key = useMemo(() => [...new Set(ids.filter((x): x is number => typeof x === 'number'))].sort((a, b) => a - b).join(','), [ids]);
  useEffect(() => {
    let live = true;
    const wanted = key ? key.split(',').map(Number) : [];
    for (const id of wanted) {
      memberName(id)
        .then((label) => live && setResolved((prev) => (prev[id] === label ? prev : { ...prev, [id]: label })))
        .catch(() => undefined);
    }
    return () => {
      live = false;
    };
  }, [key]);
  return (id: number) => resolved[id] ?? `Member #${id}`;
}
