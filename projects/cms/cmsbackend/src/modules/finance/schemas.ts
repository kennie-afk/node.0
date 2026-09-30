import { z } from 'zod';
import { moneyInput, signedMoneyInput } from '../../common/money';

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD').refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'not a real date');
export const idParam = z.object({ id: z.string().regex(/^\d+$/).transform(Number) });
export const idOnly = z.object({ params: idParam });
export const limitQuery = z.coerce.number().int().min(1).max(200).default(50);

export const restriction = z.enum(['UNRESTRICTED', 'TEMPORARILY_RESTRICTED', 'PERMANENTLY_RESTRICTED']);
export const accountType = z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE']);

export const settingsBody = z.object({
  body: z
    .object({
      baseCurrency: z.string().length(3).toUpperCase().optional(),
      fiscalYearStartMonth: z.number().int().min(1).max(12).optional(),
      approvalThreshold: signedMoneyInput.optional(),
      dualApprovalThreshold: signedMoneyInput.optional(),
      requireSeparationOfDuties: z.boolean().optional(),
      allowRestrictedOverspend: z.boolean().optional(),
      receiptPrefix: z.string().min(1).max(10).optional()
    })
    .strict()
});

export const fundCreate = z.object({
  body: z.object({
    code: z.string().min(2).max(20).regex(/^[A-Za-z0-9_-]+$/),
    name: z.string().min(2).max(120),
    description: z.string().max(500).nullish(),
    restriction: restriction.default('UNRESTRICTED')
  })
});

export const fundUpdate = z.object({
  params: idParam,
  body: z
    .object({
      name: z.string().min(2).max(120).optional(),
      description: z.string().max(500).nullish(),
      restriction: restriction.optional(),
      isActive: z.boolean().optional()
    })
    .strict()
});

export const accountCreate = z.object({
  body: z.object({
    code: z.string().min(1).max(12).regex(/^[A-Za-z0-9.-]+$/),
    name: z.string().min(2).max(150),
    type: accountType,
    parentId: z.number().int().positive().nullish(),
    isPostable: z.boolean().optional(),
    description: z.string().max(500).nullish()
  })
});

export const accountUpdate = z.object({
  params: idParam,
  body: z
    .object({
      name: z.string().min(2).max(150).optional(),
      description: z.string().max(500).nullish(),
      isActive: z.boolean().optional(),
      isPostable: z.boolean().optional()
    })
    .strict()
});

const line = z.object({
  accountId: z.number().int().positive(),
  fundId: z.number().int().positive(),
  debit: signedMoneyInput.optional(),
  credit: signedMoneyInput.optional(),
  memberId: z.number().int().positive().nullish(),
  ministryId: z.number().int().positive().nullish(),
  memo: z.string().max(255).nullish()
});

export const journalCreate = z.object({
  body: z.object({
    date: isoDate,
    memo: z.string().min(1).max(500),
    lines: z.array(line).min(2).max(500)
  })
});

export const journalList = z.object({
  query: z.object({
    from: isoDate.optional(),
    to: isoDate.optional(),
    sourceType: z.string().max(30).optional(),
    accountId: z.coerce.number().int().positive().optional(),
    fundId: z.coerce.number().int().positive().optional(),
    memberId: z.coerce.number().int().positive().optional(),
    q: z.string().max(100).optional(),
    limit: limitQuery,
    cursor: z.string().max(400).optional()
  })
});

export const reverseBody = z.object({
  params: idParam,
  body: z.object({ reason: z.string().min(3).max(300), date: isoDate.optional() })
});

export const transferBody = z.object({
  body: z
    .object({
      date: isoDate,
      fromFundId: z.number().int().positive(),
      toFundId: z.number().int().positive(),
      amount: moneyInput,
      memo: z.string().min(3).max(500),
      accountId: z.number().int().positive().optional()
    })
    .refine((v) => v.fromFundId !== v.toFundId, { message: 'choose two different funds', path: ['toFundId'] })
});

export const registerQuery = z.object({
  params: idParam,
  query: z.object({ from: isoDate.optional(), to: isoDate.optional(), fundId: z.coerce.number().int().positive().optional(), limit: limitQuery, cursor: z.string().max(400).optional() })
});

export const trialBalanceQuery = z.object({
  query: z.object({ asOf: isoDate.optional(), fundId: z.coerce.number().int().positive().optional() })
});

export const reopenBody = z.object({ params: idParam, body: z.object({ reason: z.string().min(5).max(300) }) });

export const auditQuery = z.object({
  query: z.object({ limit: limitQuery, cursor: z.string().max(100).optional(), entityType: z.string().max(40).optional(), entityId: z.string().max(40).optional(), action: z.string().max(60).optional() })
});
