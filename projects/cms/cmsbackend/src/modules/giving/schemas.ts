import { z } from 'zod';
import { moneyInput } from '../../common/money';

export const id = z.string().regex(/^\d+$/, 'ID must be a number string.').transform(Number);
export const idOnly = z.object({ params: z.object({ id }) });
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD');
/** A plain date or a full ISO timestamp (the console sends the latter). */
const dateOrTimestamp = z.union([isoDate, z.string().datetime()]);
const limit = z.coerce.number().int().min(1).max(200).default(50);
const cursor = z.string().max(400).optional();
const frequency = z.enum(['ONE_TIME', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL']);
const schedule = z.enum(['WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL']);

const giftFields = {
  memberId: z.number().int().positive().nullish(),
  contributorName: z.string().max(255).nullish(),
  amount: moneyInput,
  contributionType: z.string().min(1).max(100).optional(),
  givingTypeId: z.number().int().positive().optional(),
  fundId: z.number().int().positive().optional(),
  paymentMethod: z.string().max(100).nullish(),
  transactionId: z.string().min(1).max(255).nullish(),
  notes: z.string().max(2000).nullish(),
  depositAccountId: z.number().int().positive().optional(),
  pledgeId: z.number().int().positive().optional(),
  campaignId: z.number().int().positive().optional(),
  isAnonymous: z.boolean().optional()
};

export const createContribution = z.object({ body: z.object({ ...giftFields, date: dateOrTimestamp }) });

export const updateContribution = z.object({
  params: z.object({ id }),
  body: z
    .object({
      memberId: z.number().int().positive().nullable().optional(),
      amount: moneyInput.optional(),
      date: dateOrTimestamp.optional(),
      contributionType: z.string().min(1).max(100).optional(),
      contributorName: z.string().max(255).nullable().optional(),
      paymentMethod: z.string().max(100).nullable().optional(),
      notes: z.string().max(2000).nullable().optional()
    })
    .strict()
});

export const voidContribution = z.object({ params: z.object({ id }), body: z.object({ reason: z.string().min(3).max(300) }) });

export const listContributions = z.object({
  query: z.object({
    memberId: z.coerce.number().int().positive().optional(),
    type: z.string().max(100).optional(),
    fundId: z.coerce.number().int().positive().optional(),
    status: z.enum(['POSTED', 'VOID', 'PENDING']).optional(),
    batchId: z.coerce.number().int().positive().optional(),
    pledgeId: z.coerce.number().int().positive().optional(),
    campaignId: z.coerce.number().int().positive().optional(),
    source: z.string().max(20).optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    q: z.string().max(100).optional(),
    limit,
    cursor,
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(25)
  })
});

export const typeCreate = z.object({
  body: z.object({
    code: z.string().min(2).max(20).regex(/^[A-Za-z0-9_-]+$/),
    name: z.string().min(2).max(100),
    incomeAccountId: z.number().int().positive(),
    defaultFundId: z.number().int().positive().nullish(),
    taxDeductible: z.boolean().optional()
  })
});
export const typeUpdate = z.object({
  params: z.object({ id }),
  body: z
    .object({
      name: z.string().min(2).max(100).optional(),
      incomeAccountId: z.number().int().positive().optional(),
      defaultFundId: z.number().int().positive().nullable().optional(),
      taxDeductible: z.boolean().optional(),
      isActive: z.boolean().optional()
    })
    .strict()
});

export const batchCreate = z.object({
  body: z.object({ name: z.string().min(2).max(150), serviceDate: isoDate, depositAccountId: z.number().int().positive().nullish() })
});
export const batchList = z.object({ query: z.object({ status: z.enum(['OPEN', 'COUNTED', 'POSTED']).optional(), limit, cursor }) });
export const batchItem = z.object({
  params: z.object({ id }),
  body: z.object({
    memberId: z.number().int().positive().nullish(),
    contributorName: z.string().max(255).nullish(),
    amount: moneyInput,
    contributionType: z.string().min(1).max(100).optional(),
    givingTypeId: z.number().int().positive().optional(),
    fundId: z.number().int().positive().optional(),
    paymentMethod: z.string().max(100).nullish(),
    pledgeId: z.number().int().positive().optional(),
    notes: z.string().max(2000).nullish()
  })
});
export const batchItemRemove = z.object({ params: z.object({ id, contributionId: id }) });
export const batchCount = z.object({ params: z.object({ id }), body: z.object({ countedTotal: moneyInput }) });

export const campaignCreate = z.object({
  body: z.object({
    name: z.string().min(2).max(150),
    description: z.string().max(1000).nullish(),
    goal: moneyInput.optional(),
    startDate: isoDate,
    endDate: isoDate.nullish(),
    fundId: z.number().int().positive().nullish()
  })
});
export const campaignUpdate = z.object({
  params: z.object({ id }),
  body: z
    .object({
      name: z.string().min(2).max(150).optional(),
      description: z.string().max(1000).nullable().optional(),
      goal: moneyInput.optional(),
      endDate: isoDate.nullable().optional(),
      status: z.enum(['ACTIVE', 'CLOSED']).optional(),
      fundId: z.number().int().positive().nullable().optional()
    })
    .strict()
});
export const campaignList = z.object({ query: z.object({ status: z.enum(['ACTIVE', 'CLOSED']).optional() }) });

export const pledgeCreate = z.object({
  body: z.object({
    memberId: z.number().int().positive(),
    campaignId: z.number().int().positive().nullish(),
    givingTypeId: z.number().int().positive().nullish(),
    amount: moneyInput,
    installment: moneyInput.optional(),
    frequency: frequency.default('ONE_TIME'),
    startDate: isoDate,
    endDate: isoDate.nullish(),
    notes: z.string().max(500).nullish()
  })
});
export const pledgeUpdate = z.object({
  params: z.object({ id }),
  body: z
    .object({
      amount: moneyInput.optional(),
      installment: moneyInput.nullable().optional(),
      endDate: isoDate.nullable().optional(),
      notes: z.string().max(500).nullable().optional()
    })
    .strict()
});
export const pledgeCancel = z.object({ params: z.object({ id }), body: z.object({ reason: z.string().min(3).max(300) }) });
export const pledgeList = z.object({
  query: z.object({
    memberId: z.coerce.number().int().positive().optional(),
    campaignId: z.coerce.number().int().positive().optional(),
    status: z.enum(['ACTIVE', 'FULFILLED', 'CANCELLED']).optional(),
    behindOnly: z.enum(['true', 'false']).optional(),
    limit,
    cursor
  })
});

export const recurringCreate = z.object({
  body: z.object({
    memberId: z.number().int().positive(),
    givingTypeId: z.number().int().positive(),
    fundId: z.number().int().positive().nullish(),
    amount: moneyInput,
    frequency: schedule,
    paymentMethod: z.string().max(100).nullish(),
    depositAccountId: z.number().int().positive().nullish(),
    pledgeId: z.number().int().positive().nullish(),
    startDate: isoDate,
    endDate: isoDate.nullish()
  })
});
export const recurringUpdate = z.object({
  params: z.object({ id }),
  body: z
    .object({
      amount: moneyInput.optional(),
      status: z.enum(['ACTIVE', 'PAUSED', 'ENDED']).optional(),
      endDate: isoDate.nullable().optional(),
      paymentMethod: z.string().max(100).nullable().optional()
    })
    .strict()
});
export const recurringList = z.object({ query: z.object({ memberId: z.coerce.number().int().positive().optional(), status: z.enum(['ACTIVE', 'PAUSED', 'ENDED']).optional() }) });
export const recurringRun = z.object({ body: z.object({ asOf: isoDate.optional() }) });

export const statementQuery = z.object({
  params: z.object({ memberId: id }),
  query: z.object({ year: z.coerce.number().int().min(2000).max(2100).default(new Date().getUTCFullYear()) })
});
export const receiptParam = z.object({ params: z.object({ receiptNo: z.string().min(3).max(30) }) });
