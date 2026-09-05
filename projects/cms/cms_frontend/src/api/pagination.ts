export interface Page<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export function unwrapList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) {
    return payload as T[];
  }
  if (payload && typeof payload === 'object') {
    const candidate = payload as Record<string, unknown>;
    if (Array.isArray(candidate.data)) {
      return candidate.data as T[];
    }
    for (const value of Object.values(candidate)) {
      if (Array.isArray(value)) {
        return value as T[];
      }
    }
  }
  return [];
}

export function asPage<T>(payload: unknown): Page<T> {
  const rows = unwrapList<T>(payload);
  const source = (payload ?? {}) as Partial<Page<T>>;
  const pageSize = source.pageSize ?? rows.length;
  const total = source.total ?? rows.length;
  return {
    data: rows,
    page: source.page ?? 1,
    pageSize,
    total,
    totalPages: source.totalPages ?? (pageSize > 0 ? Math.ceil(total / pageSize) : 0),
    hasNext: source.hasNext ?? false,
    hasPrevious: source.hasPrevious ?? false
  };
}
