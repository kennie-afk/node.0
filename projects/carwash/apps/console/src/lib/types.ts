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
  resolutionNote?: string | null;
  siteId?: string;
  resolvedBy?: string | null;
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

export interface Bay {
  id: string;
  label: string;
  devices: number;
  jobs: number;
}

export interface SiteDetail {
  id: string;
  name: string;
  timezone: string;
  tillNumber: string | null;
  opensMinute: number;
  closesMinute: number;
  daysOpen: number[];
  litresPerWash: number;
  cashRatio: number;
  bays: Bay[];
}

export interface Service {
  id: string;
  name: string;
  listPriceCents: number;
  expectedWaterL: number;
  expectedDurationS: number;
  commissionRate: number;
  active: boolean;
  uses?: number;
}

export interface Person {
  id: string;
  displayName: string;
  phone: string;
  role: string;
  siteId: string | null;
  site: string | null;
  status: string;
}

export interface Device {
  id: string;
  type: string;
  firmware: string | null;
  status: string;
  lastSeen: string | null;
  lastSequence: number;
  site: string;
  bay: string | null;
}

export interface JobDetail {
  id: string;
  state: string;
  site: string;
  bay: string | null;
  plate: string | null;
  worker: string | null;
  quotedCents: number;
  listCents: number;
  discountAuthorised: boolean;
  createdAt: string;
  closedAt: string | null;
  services: { name: string; unitPriceCents: number; qty: number }[];
  events: { type: string; at: string; payload: Record<string, unknown> }[];
  payments: { id: string; channel: string; amountCents: number; reference: string | null; receivedAt: string }[];
}

export function clock(minute: number): string {
  const h = Math.floor(minute / 60) % 24;
  return `${String(h).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

export function parseClock(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const total = Number(match[1]) * 60 + Number(match[2]);
  return total >= 0 && total <= 1440 ? total : null;
}

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
