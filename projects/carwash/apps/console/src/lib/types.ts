export interface Overview {
  organisation: string;
  sites: number;
  jobs: number;
  openJobs: number;
  payments: number;
  unmatchedPayments: number;
  receivedCents: number;
  expectedCents: number;
  gapCents: number;
  openFlags: number;
  flaggedCents: number;
  devices: number;
}

export interface Site {
  id: string;
  name: string;
  timezone: string;
  tillNumber: string | null;
  litresPerWash: number;
  cashRatio: number;
  bays: number;
  jobs: number;
  openFlags: number;
}

export interface Job {
  id: string;
  state: string;
  quotedCents: number;
  listCents: number;
  createdAt: string;
  closedAt: string | null;
  plate: string | null;
  worker: string | null;
  paid: boolean;
}

export interface Payment {
  id: string;
  channel: string;
  amountCents: number;
  reference: string | null;
  jobId: string | null;
  matched: boolean;
  receivedAt: string;
}

export interface Discrepancy {
  id: string;
  type: string;
  severity: string;
  estimatedCents: number;
  summary: string;
  evidence: Record<string, unknown>;
  state: string;
  businessDay: string;
  site: string;
}

export interface TelemetryPoint {
  hour: string;
  metric: string;
  total: number;
}

export interface DailyReport {
  summary: string;
  vehiclesDetected: number;
  jobsRecorded: number;
  expectedCents: number;
  receivedCents: number;
  gapCents: number;
  discrepancies: {
    type: string;
    severity: string;
    estimatedValue: number;
    summary: string;
  }[];
}

export function ksh(cents: number): string {
  const shillings = Math.abs(cents) / 100;
  return `${cents < 0 ? "-" : ""}KSh ${shillings.toLocaleString("en-KE", {
    maximumFractionDigits: 0
  })}`;
}
