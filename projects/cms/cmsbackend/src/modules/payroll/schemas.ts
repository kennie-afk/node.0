import { z } from 'zod';
import { moneyInput, signedMoneyInput } from '../../common/money';
import { idParam, isoDate, limitQuery } from '../finance/schemas';

const phone = z.string().regex(/^\+?\d{9,15}$/, 'a phone number such as 0712345678 or +254712345678');
const name = z.string().min(1).max(100);

const allowance = z.object({ name, amount: signedMoneyInput.refine((v) => v >= 0, 'cannot be negative'), taxable: z.boolean().default(true) }).transform((a) => ({ name: a.name, amountMinor: a.amount, taxable: a.taxable }));
const deduction = z.object({ name, amount: signedMoneyInput.refine((v) => v >= 0, 'cannot be negative') }).transform((d) => ({ name: d.name, amountMinor: d.amount }));

const employeeFields = {
  memberId: z.number().int().positive().nullish(),
  fullName: z.string().min(2).max(150),
  nationalId: z.string().min(5).max(20).nullish(),
  kraPin: z.string().regex(/^[AP]\d{9}[A-Z]$/i, 'a KRA PIN looks like A123456789Z').transform((v) => v.toUpperCase()).nullish(),
  nssfNo: z.string().max(20).nullish(),
  shifNo: z.string().max(20).nullish(),
  email: z.string().email().max(120).nullish(),
  phone: phone.nullish(),
  bankName: z.string().max(80).nullish(),
  bankAccount: z.string().max(40).nullish(),
  mpesaPhone: phone.nullish(),
  jobTitle: z.string().max(100).nullish(),
  basicSalary: signedMoneyInput.refine((v) => v >= 0, 'cannot be negative'),
  allowances: z.array(allowance).max(30).optional(),
  deductions: z.array(deduction).max(30).optional(),
  insurancePremium: signedMoneyInput.refine((v) => v >= 0, 'cannot be negative').optional(),
  fundId: z.number().int().positive().nullish(),
  ministryId: z.number().int().positive().nullish(),
  startDate: isoDate,
  endDate: isoDate.nullish(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional()
};

export const employeeCreate = z.object({ body: z.object(employeeFields) });
export const employeeUpdate = z.object({ params: idParam, body: z.object(employeeFields).partial().strict() });
export const employeeList = z.object({ query: z.object({ status: z.enum(['ACTIVE', 'INACTIVE']).optional(), q: z.string().max(60).optional(), limit: limitQuery, cursor: z.string().max(400).optional() }) });

export const runCreate = z.object({ body: z.object({ year: z.number().int().min(2025).max(2100), month: z.number().int().min(1).max(12) }) });
export const runList = z.object({ query: z.object({ year: z.coerce.number().int().optional() }) });
export const reasonBody = z.object({ params: idParam, body: z.object({ reason: z.string().min(3).max(300), date: isoDate.optional() }) });
export const payBody = z.object({ params: idParam, body: z.object({ date: isoDate, accountId: z.number().int().positive().optional(), reference: z.string().max(60).optional() }) });
export const remitBody = z.object({
  params: idParam,
  body: z.object({ kind: z.enum(['PAYE', 'NSSF', 'SHIF', 'HOUSING_LEVY']), date: isoDate, accountId: z.number().int().positive().optional(), reference: z.string().max(60).optional() })
});
export const slipParams = z.object({ params: z.object({ id: z.string().regex(/^\d+$/).transform(Number), employeeId: z.string().regex(/^\d+$/).transform(Number) }) });
export const advanceCreate = z.object({
  body: z.object({ employeeId: z.number().int().positive(), amount: moneyInput, monthlyRecovery: moneyInput, date: isoDate, accountId: z.number().int().positive().optional(), note: z.string().max(255).nullish() })
});
export const summaryQuery = z.object({ query: z.object({ year: z.coerce.number().int().min(2025).max(2100).default(new Date().getUTCFullYear()) }) });
