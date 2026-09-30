import { randomUUID } from 'node:crypto';
import { logger } from '../../common/logger';
import { runAsTenant } from '../../common/tenant-run';
import { recordJob, setQueueStats } from '../../common/metrics';
import './handlers';
import { claimJobs, completeJob, failJob, getJobHandler, JobRow, queueStats } from './queue';
import { runSchedulerTick } from './scheduler';

export interface WorkerOptions {
  concurrency: number;
  pollMs?: number;
  leaseSeconds?: number;
  schedulerEveryMs?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class Worker {
  readonly id = `worker-${process.pid}-${randomUUID().slice(0, 8)}`;
  private running = false;
  private inFlight = new Set<Promise<void>>();
  private loop: Promise<void> | null = null;
  private timers: NodeJS.Timeout[] = [];

  constructor(private readonly options: WorkerOptions) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.loop = this.poll();
    const every = this.options.schedulerEveryMs ?? 30_000;
    if (every > 0) {
      const tick = () => runSchedulerTick().catch((error) => logger.error('scheduler tick failed', { error: String(error) }));
      void tick();
      this.timers.push(setInterval(tick, every));
    }
    const stats = () => queueStats().then(setQueueStats).catch(() => undefined);
    void stats();
    this.timers.push(setInterval(stats, 10_000));
    logger.info('worker started', { id: this.id, concurrency: this.options.concurrency });
  }

  /** Stops claiming, then waits for running jobs to finish (bounded by the caller's grace period). */
  async stop(): Promise<void> {
    this.running = false;
    this.timers.forEach(clearInterval);
    this.timers = [];
    await this.loop;
    await Promise.allSettled([...this.inFlight]);
    logger.info('worker stopped', { id: this.id });
  }

  private async poll(): Promise<void> {
    const pollMs = this.options.pollMs ?? 1000;
    while (this.running) {
      const free = this.options.concurrency - this.inFlight.size;
      let claimed: JobRow[] = [];
      if (free > 0) {
        try {
          claimed = await claimJobs(this.id, free, this.options.leaseSeconds ?? 300);
        } catch (error) {
          logger.error('claiming jobs failed', { error: error instanceof Error ? error.message : String(error) });
        }
      }
      for (const job of claimed) {
        const promise = this.execute(job).finally(() => this.inFlight.delete(promise));
        this.inFlight.add(promise);
      }
      // Busy: loop again immediately. Idle or saturated: wait, with jitter so workers do not sync up.
      if (claimed.length === 0 || this.inFlight.size >= this.options.concurrency) {
        await sleep(pollMs * (0.75 + Math.random() * 0.5));
      }
    }
  }

  async execute(job: JobRow): Promise<void> {
    const handler = getJobHandler(job.type);
    if (!handler) {
      const status = await failJob(job.id, job.attempts, `no handler registered for ${job.type}`);
      recordJob(job.type, status === 'dead' ? 'dead' : 'unhandled');
      return;
    }
    try {
      const run = () => handler(job.payload, { job, churchId: job.churchId });
      if (job.churchId !== null) {
        await runAsTenant(job.churchId, run, { requestId: `job-${job.id}` });
      } else {
        await run();
      }
      await completeJob(job.id);
      recordJob(job.type, 'done');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = await failJob(job.id, job.attempts, message);
      recordJob(job.type, status === 'dead' ? 'dead' : 'retry');
      logger.warn('job failed', { id: job.id, type: job.type, attempts: job.attempts, outcome: status, error: message });
    }
  }

  /** For tests: claim and run whatever is due, once, and wait for it. */
  async drain(max = 100): Promise<number> {
    let processed = 0;
    for (let round = 0; round < max; round += 1) {
      const claimed = await claimJobs(this.id, this.options.concurrency, this.options.leaseSeconds ?? 300);
      if (claimed.length === 0) break;
      await Promise.all(claimed.map((job) => this.execute(job)));
      processed += claimed.length;
    }
    return processed;
  }
}
