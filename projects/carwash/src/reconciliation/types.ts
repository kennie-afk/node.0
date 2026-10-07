import { Cents } from '../domain/money';

export type DiscrepancyType =
  | 'ghost_wash'
  | 'underquoting'
  | 'off_book_upsell'
  | 'supply_pilferage'
  | 'after_hours_operation'
  | 'commission_padding'
  | 'payment_without_job'
  | 'job_without_payment'
  | 'abandoned_job_pattern'
  | 'cash_ratio_spike'
  | 'cash_amount_mismatch'
  | 'device_silent'
  | 'device_tamper';

export type Severity = 'low' | 'medium' | 'high' | 'critical';

export interface JobRecord {
  id: string;
  siteId: string;
  bayId: string | null;
  workerId: string;
  state: string;
  quotedTotal: Cents;
  listTotal: Cents;
  createdAt: Date;
  closedAt: Date | null;
  serviceIds: string[];
  discountAuthorisedBy: string | null;
}

export interface PaymentRecord {
  id: string;
  siteId: string;
  channel: 'mpesa' | 'card' | 'bank' | 'cash';
  amount: Cents;
  externalRef: string | null;
  jobId: string | null;
  receivedAt: Date;
  /** set when a supervisor, manager or owner recorded an amount different from the quote */
  varianceAuthorisedBy?: string | null;
}

export interface TelemetryWindow {
  siteId: string;
  bayId: string;
  from: Date;
  to: Date;
  litres: number;
  pumpRuntimeSeconds: number;
  machineCycles: number;
}

export interface VehicleObservation {
  siteId: string;
  observedAt: Date;
  plateNormalised: string | null;
  direction: 'entry' | 'exit';
}

export interface ConsumableDraw {
  siteId: string;
  itemId: string;
  itemName: string;
  quantity: number;
  unit: string;
}

/** What a measuring device reported on the day, for the device_silent rule. */
export interface DeviceActivity {
  deviceId: string;
  type: string;
  bayId: string | null;
  /** when it was registered; it is not blamed for any time before that */
  registeredAt: Date;
  /** distinct minutes in which it sent at least one reading, a little beyond the day on both sides */
  readingMinutes: Date[];
}

export interface OperatingHours {
  opensMinute: number;
  closesMinute: number;
  daysOpen: number[];
}

export interface SiteBaseline {
  siteId: string;
  litresPerWash: number;
  litresPerWashTolerance: number;
  cashRatio: number;
  discountRateByWorker: Record<string, number>;
  consumablePerWash: Record<string, number>;
  /** how long a measuring device may be quiet while a job runs before it is flagged (default 120) */
  deviceSilentMinutes?: number;
}

export interface ReconciliationInput {
  siteId: string;
  siteName: string;
  day: Date;
  timezone: string;
  operatingHours: OperatingHours;
  baseline: SiteBaseline;
  jobs: JobRecord[];
  payments: PaymentRecord[];
  telemetry: TelemetryWindow[];
  observations: VehicleObservation[];
  consumables: ConsumableDraw[];
  devices?: DeviceActivity[];
}

export interface Discrepancy {
  type: DiscrepancyType;
  severity: Severity;
  estimatedValue: Cents;
  summary: string;
  evidence: Record<string, unknown>;
}

export interface ReconciliationResult {
  siteId: string;
  siteName: string;
  day: Date;
  vehiclesDetected: number;
  jobsRecorded: number;
  expectedRevenue: Cents;
  receivedRevenue: Cents;
  gap: Cents;
  discrepancies: Discrepancy[];
}
