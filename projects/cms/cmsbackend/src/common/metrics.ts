/**
 * Prometheus metrics. Served on a separate internal port (METRICS_PORT) so /metrics is never
 * reachable through the public listener or the ingress; a NetworkPolicy lets only Prometheus in.
 */
import http from 'node:http';
import { NextFunction, Request, Response } from 'express';
import client from 'prom-client';
import { env } from '../config/env';
import { logger } from './logger';

export const registry = new client.Registry();
registry.setDefaultLabels({ app: 'cms' });
client.collectDefaultMetrics({ register: registry });

const httpDuration = new client.Histogram({
  name: 'cms_http_request_duration_seconds',
  help: 'HTTP request duration by route template and status class',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry]
});

const ledgerPostings = new client.Counter({
  name: 'cms_ledger_postings_total',
  help: 'Journal entries posted, by source type',
  labelNames: ['source_type'],
  registers: [registry]
});

const jobsProcessed = new client.Counter({
  name: 'cms_jobs_processed_total',
  help: 'Jobs finished by outcome',
  labelNames: ['type', 'outcome'],
  registers: [registry]
});

const queueGauge = new client.Gauge({ name: 'cms_jobs_queue_depth', help: 'Jobs by status', labelNames: ['status'], registers: [registry] });
const queueAge = new client.Gauge({ name: 'cms_jobs_oldest_queued_age_seconds', help: 'Age of the oldest job waiting to run', registers: [registry] });
const dbPool = new client.Gauge({ name: 'cms_db_pool_connections', help: 'Sequelize pool connections by state', labelNames: ['state'], registers: [registry] });

/** Call after a successful ledger posting. */
export function recordLedgerPosting(sourceType: string): void {
  ledgerPostings.inc({ source_type: sourceType });
}

export function recordJob(type: string, outcome: 'done' | 'retry' | 'dead' | 'unhandled'): void {
  jobsProcessed.inc({ type, outcome });
}

export function setQueueStats(stats: { queued: number; running: number; dead: number; oldestQueuedAgeSeconds: number }): void {
  queueGauge.set({ status: 'queued' }, stats.queued);
  queueGauge.set({ status: 'running' }, stats.running);
  queueGauge.set({ status: 'dead' }, stats.dead);
  queueAge.set(stats.oldestQueuedAgeSeconds);
}

/** Sequelize keeps its pool on the connection manager; read the counts the pool exposes. */
export function observePool(sequelize: any): void {
  const pool = sequelize?.connectionManager?.pool;
  if (!pool) return;
  dbPool.set({ state: 'size' }, Number(pool.size ?? 0));
  dbPool.set({ state: 'available' }, Number(pool.available ?? 0));
  dbPool.set({ state: 'using' }, Number(pool.using ?? 0));
  dbPool.set({ state: 'waiting' }, Number(pool.waiting ?? 0));
}

/** Times every request; uses the matched route template so cardinality stays bounded. */
export const metricsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const end = httpDuration.startTimer();
  res.on('finish', () => {
    const template = req.route?.path ? `${req.baseUrl}${req.route.path}` : req.baseUrl || 'unmatched';
    end({ method: req.method, route: template, status: `${Math.floor(res.statusCode / 100)}xx` });
  });
  next();
};

let server: http.Server | null = null;

/**
 * Starts the metrics listener. `collect` lets the caller refresh gauges (pool, queue) on scrape.
 * Port 0 disables it. If METRICS_TOKEN is set the endpoint requires that bearer token.
 */
export function startMetricsServer(collect?: () => Promise<void> | void): void {
  if (!env.METRICS_PORT || server) return;
  server = http.createServer(async (req, res) => {
    if (req.url !== '/metrics') {
      res.writeHead(404).end();
      return;
    }
    const token = process.env.METRICS_TOKEN;
    if (token && req.headers.authorization !== `Bearer ${token}`) {
      res.writeHead(401).end();
      return;
    }
    try {
      await collect?.();
      res.writeHead(200, { 'Content-Type': registry.contentType });
      res.end(await registry.metrics());
    } catch (error) {
      logger.error('metrics scrape failed', { error: error instanceof Error ? error.message : String(error) });
      res.writeHead(500).end();
    }
  });
  server.listen(env.METRICS_PORT, () => logger.info('metrics listening', { port: env.METRICS_PORT }));
}

export async function stopMetricsServer(): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = null;
}
