import { z } from 'zod';
import { isoDate } from '../finance/schemas';

const format = z.enum(['json', 'csv']).default('json');
const fundId = z.coerce.number().int().positive().optional();
const range = { from: isoDate.optional(), to: isoDate.optional(), yearId: z.coerce.number().int().positive().optional(), fundId, format };

export const rangeQuery = z.object({ query: z.object(range) });
export const incomeQuery = z.object({
  query: z.object({ ...range, compare: z.enum(['none', 'prior-period', 'prior-year']).default('none'), byFund: z.enum(['true', 'false']).default('false').transform((v) => v === 'true') })
});
export const asOfQuery = z.object({ query: z.object({ asOf: isoDate.optional(), fundId, format }) });
export const topQuery = z.object({ query: z.object({ ...range, limit: z.coerce.number().int().min(1).max(200).default(25) }) });
export const lapsedQuery = z.object({
  query: z.object({
    asOf: isoDate.optional(),
    quietMonths: z.coerce.number().int().min(1).max(24).default(3),
    lookbackMonths: z.coerce.number().int().min(2).max(60).default(12),
    limit: z.coerce.number().int().min(1).max(500).default(100),
    format
  })
});
export const retentionQuery = z.object({ query: z.object({ year: z.coerce.number().int().min(2000).max(2100).default(new Date().getUTCFullYear()), format }) });
export const registerQuery = z.object({
  params: z.object({ accountId: z.string().regex(/^\d+$/).transform(Number) }),
  query: z.object({ from: isoDate.optional(), to: isoDate.optional(), fundId, limit: z.coerce.number().int().min(1).max(500).default(100), cursor: z.string().max(400).optional(), format })
});
export const dashboardQuery = z.object({ query: z.object({}) });
