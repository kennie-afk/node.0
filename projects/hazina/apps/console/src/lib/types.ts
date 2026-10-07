export type OrgKind = "sacco" | "lender";
export interface Branch { id: string; code: string; name: string; paybillNumber: string | null; timezone: string; isSample: boolean }
export interface Me { id: string; displayName: string; role: string; phone: string; staffNo: string | null; branchId: string | null; organisation: { id: string; name: string } }
export interface Person { id: string; displayName: string; role: string; phone: string; staffNo: string | null; status: string; branchId: string | null; branch: string | null }

export interface Member { id: string; memberNo: string; fullName: string; idNumber: string | null; phone: string | null; status: string; joinedOn: string; branchId: string | null }
export interface MemberPage { items: Member[]; nextCursor: string | null }
export interface MemberProfile extends Member {
  kraPin: string | null; dateOfBirth: string | null; gender: string | null; employer: string | null; occupation: string | null;
  nextOfKin: { name?: string; phone?: string; relationship?: string };
  balances: { savingsCents: number; sharesCents: number; depositsCents: number; loanPrincipalOutstandingCents: number };
  loans: { id: string; loanNo: string; status: string; principalCents: number }[];
}
export type SavingsProduct = "savings" | "shares" | "deposits";
export interface SavingsStatement { member: { id: string; memberNo: string; fullName: string }; product: SavingsProduct; lines: { id: string; date: string; kind: string; amountCents: number; channel: string; reference: string | null; balanceCents: number }[]; closingBalanceCents: number }
export interface SavingsTxn { id: string; memberId: string; memberNo: string; memberName: string; product: string; kind: string; amountCents: number; channel: string; reference: string | null; status: string; occurredOn: string; requestedBy: string | null; decidedBy: string | null }

export interface LoanProduct { id: string; name: string; method: "flat" | "reducing"; annualRateBp: number; minAmountCents: number; maxAmountCents: number; minTermMonths: number; maxTermMonths: number; processingFeeBp: number; insuranceFeeBp: number; penaltyRateBp: number; graceDays: number; maxMultipleOfSavings: number; guarantorsRequired: number; active: boolean }
export interface Loan { id: string; loanNo: string; memberId: string; memberNo?: string; memberName?: string; productId: string; status: string; method: string; annualRateBp: number; principalCents: number; termMonths: number; purpose: string | null; createdAt: string; disbursedOn: string | null }
export interface LoanPage { items: Loan[]; nextCursor: string | null }
export interface ScheduleRow { installmentNo: number; dueDate: string; principalCents: number; interestCents: number; penaltyCents: number; paidPrincipalCents: number; paidInterestCents: number; paidPenaltyCents: number; overdueDays: number }
export interface LoanDetail extends Loan {
  appraisal: Record<string, unknown> | null; decisionNote: string | null; firstDueDate: string | null; closedOn: string | null; restructuredInto: string | null; restructuredFrom: string | null;
  fees: { processingFeeBp: number; insuranceFeeBp: number }; penaltyRateBp: number; graceDays: number;
  outstandingPrincipalCents: number; outstandingTotalCents: number; asOf: string;
  arrears: { overduePrincipalCents: number; overdueInterestCents: number; overduePenaltyCents: number; daysOverdue: number } | null;
  schedule: ScheduleRow[];
  repayments: { id: string; amountCents: number; channel: string; reference: string | null; receivedOn: string; penaltyCents: number; interestCents: number; principalCents: number; unappliedCents: number; recoveryCents: number }[];
  guarantors: { memberId: string; memberNo: string; fullName: string; guaranteedCents: number }[];
}
export interface Preview { installments: { installmentNo: number; dueDate: string; principalCents: number; interestCents: number }[]; totals: { principalCents: number; interestCents: number; totalCents: number } }

export interface Portfolio { asOf: string; loansBeingRepaid: number; outstandingPrincipalCents: number; buckets: { bucket: string; loans: number; outstandingPrincipalCents: number }[]; par: { days: number; amountCents: number; percent: number }[] }
export interface ArrearsRow { loanId: string; loanNo: string; memberNo: string; memberName: string; phone: string | null; outstandingPrincipalCents: number; overduePrincipalCents: number; overdueInterestCents: number; overduePenaltyCents: number; daysOverdue: number; bucket: string }
export interface ArrearsPage { asOf: string; total: number; items: ArrearsRow[] }

export interface MpesaPayment { id: string; externalRef: string; billRef: string | null; amountCents: number; payer: string | null; receivedAt: string; status: string; appliedToType: string | null; appliedToId: string | null; unappliedCents: number; note: string | null }

export interface Account { id: string; code: string; name: string; type: string; isSystem: boolean; active: boolean }
export interface JournalEntry { id: string; seq: number; date: string; memo: string; sourceType: string; totalCents: number; reverses: string | null; lines: { lineNo: number; code: string; account: string; debitCents: number; creditCents: number; memberId: string | null; loanId: string | null }[] }
export interface JournalPage { items: JournalEntry[]; nextBefore: number | null }
export interface TrialBalance { asOf: string; rows: { code: string; name: string; type: string; debitCents: number; creditCents: number }[]; totalDebitCents: number; totalCreditCents: number }
export interface Line { code: string; name: string; amountCents: number }
export interface IncomeStatement { from: string; to: string; income: Line[]; expenses: Line[]; totalIncomeCents: number; totalExpensesCents: number; surplusCents: number }
export interface BalanceSheet { asOf: string; assets: Line[]; liabilities: Line[]; equity: Line[]; surplusToDateCents: number; totalAssetsCents: number; totalLiabilitiesCents: number; totalEquityCents: number; balanced: boolean }

export interface ReturnTemplate { id: string; code: string; name: string; version: number; isOfficial: false; createdAt: string }
export interface ReturnRow { id: string; code: string; name: string; version: number; periodStart: string; periodEnd: string; createdAt: string }
export interface ReturnDetail { id: string; periodStart: string; periodEnd: string; createdAt: string; payload: { template?: { code: string; name: string; version: number }; title: string; banner: string; period: { from: string; to: string }; generatedAt: string; sections: { title: string; rows: { label: string; value: number; format: "money" | "count" | "percent" }[] }[]; notes: string[] } }

export interface Flag { code: string; severity: "info" | "warn" | "high"; message: string }
export interface StatementSummary { periodStart: string; periodEnd: string; transactionCount: number; completedCount: number; monthsCovered: number; averageMonthlyInflowCents: number; medianMonthlyInflowCents: number; lowestMonthlyInflowCents: number; averageMonthlyOutflowCents: number; inflowVariationPercent: number; regularMonthsPercent: number; topInflowSources: { name: string; shareOfInflowPercent: number }[]; openingBalanceCents: number | null; closingBalanceCents: number | null; indicativeCapacityCents: number; capacityShareBp: number; note: string; months: { month: string; inflowCents: number; outflowCents: number; count: number }[] }
export interface Upload { id: string; filename: string; format: string; status: string; error: string | null; periodStart: string | null; periodEnd: string | null; rows: number; summary: StatementSummary | null; flags: Flag[]; createdAt: string }
export interface DocCheck { id: string; kind: "payslip" | "national_id"; input: Record<string, unknown>; flags: Flag[]; createdAt: string }
export interface Intake { statements: Upload[]; checks: DocCheck[] }

export interface Settings { organisation: { kind: OrgKind; isDemo: boolean; name: string }; settings: { makerChecker: "strict" | "relaxed"; withdrawalApprovalCents: number; capacityShareBp: number; financialYearStartMonth: number; provisionRatesBp: Record<string, number> }; capabilities?: { mpesaSimulator: boolean; billingMode: string } }
export interface Onboarding { kind: OrgKind; isSample: boolean; items: { key: string; title: string; done: boolean; hint: string }[]; doneCount: number; total: number }
export interface Billing { mode: "mock" | "live"; status: string; writesAllowed: boolean; trialEndsAt: string; coveredUntil: string; suspendsAt: string; daysLeft: number; billingRef: string; billedUnits: number; kind: OrgKind; quote: { planCode: string; unitCount: number; unitCents: number; amountCents: number }; creditCents: number; outstandingCents: number; pay: { shortcode: string; accountNumber: string; amountCents: number } | null; invoices: { id: string; number: string; periodStart: string; periodEnd: string; unitCount: number; planCode: string; amountCents: number; paidCents: number; status: string; issuedAt: string }[] }

export interface Paged<T> { items: T[]; nextCursor: string | null }
export interface AuditPage { items: { id: number; action: string; entity: string; detail: unknown; at: string }[]; nextBefore: number | null }
export interface ReconDay { day: string; count: number; receivedCents: number; appliedCents: number; unmatchedCents: number; ignoredCents: number }
export interface Reconciliation { from: string; to: string; days: ReconDay[]; totals: { count: number; receivedCents: number; appliedCents: number; unmatchedCents: number; ignoredCents: number }; suspense: { ledgerCents: number; paymentsCents: number; paymentsCount: number; differenceCents: number; unmatchedBeforeSuspenseCount: number } }
export interface PeriodStatus { lockedThrough: string | null; lockedAt: string | null; note: string | null; snapshots: string[] }
export interface ProvisionBucket { bucket: string; loans: number; exposureCents: number; rateBp: number; requiredCents: number }
export interface Provisioning { preview: { asOf: string; buckets: ProvisionBucket[]; requiredCents: number }; ratesBp: Record<string, number>; history: { id: string; asOf: string; requiredCents: number; adjustmentCents: number; createdAt: string }[]; notice: string }
export interface DividendRun { id: string; kind: string; periodEnd: string; rateBp: number; members: number; totalCents: number; createdAt: string }
