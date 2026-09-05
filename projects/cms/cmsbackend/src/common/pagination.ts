import { z } from 'zod';

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 25;

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE)
});

export type Pagination = z.infer<typeof paginationSchema>;

export interface Page<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export function toPage<T>(rows: T[], total: number, pagination: Pagination): Page<T> {
  const totalPages = total === 0 ? 0 : Math.ceil(total / pagination.pageSize);
  return {
    data: rows,
    page: pagination.page,
    pageSize: pagination.pageSize,
    total,
    totalPages,
    hasNext: pagination.page < totalPages,
    hasPrevious: pagination.page > 1
  };
}

export function toOffset(pagination: Pagination): { limit: number; offset: number } {
  return {
    limit: pagination.pageSize,
    offset: (pagination.page - 1) * pagination.pageSize
  };
}
