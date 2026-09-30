/**
 * Every authenticated request runs inside exactly one database transaction that is stamped with
 * the caller's church (`SET LOCAL app.church_id`). Postgres row-level security policies key off
 * that setting, so tenant isolation holds below the application: a forgotten WHERE clause, a
 * bad join or an injection still cannot read or write another church's rows.
 *
 * The transaction is begun lazily (requests that never touch the database never hold a
 * connection), committed before the response is flushed (so a client that gets a 201 can
 * immediately read its own write, and deferred constraints that fail at COMMIT become an error
 * response instead of a silent one), and rolled back for any 4xx/5xx (a half-applied request is
 * never persisted).
 */
import { NextFunction, Request, Response } from 'express';
import { Sequelize, Transaction } from 'sequelize';
import { currentTenantOrNull, TenantContext } from './tenant-context';
import { logger } from './logger';

export class TenantTx {
  private promise?: Promise<Transaction>;
  preferReplica = false;
  /**
   * Commit even when the response is a 4xx. For the rare request whose refusal must itself be
   * recorded (a denied child pickup, a failed credential), after which nothing else was written.
   */
  forceCommit = false;

  constructor(
    private readonly sequelize: Sequelize,
    private readonly begin: (options: object) => Promise<Transaction>,
    private readonly churchId: number
  ) {}

  acquire(): Promise<Transaction> {
    if (!this.promise) {
      this.promise = this.open();
    }
    return this.promise;
  }

  private async open(): Promise<Transaction> {
    const tx = await this.begin(this.preferReplica ? { readOnly: true } : {});
    try {
      await setTenantLocal(this.sequelize, tx, this.churchId);
    } catch (error) {
      await tx.rollback().catch(() => undefined);
      throw error;
    }
    return tx;
  }

  get started(): boolean {
    return this.promise !== undefined;
  }

  async finish(commit: boolean): Promise<void> {
    if (!this.promise) return;
    const tx = await this.promise.catch(() => null);
    if (!tx) return;
    // Sequelize marks a finished transaction; committing twice would throw.
    if ((tx as unknown as { finished?: string }).finished) return;
    if (commit) {
      await tx.commit();
    } else {
      await tx.rollback();
    }
  }
}

export function isPostgres(sequelize: Sequelize): boolean {
  return sequelize.getDialect() === 'postgres';
}

/** Stamps the open transaction with the church. A no-op on SQLite, which has no RLS. */
export async function setTenantLocal(
  sequelize: Sequelize,
  transaction: Transaction,
  churchId: number
): Promise<void> {
  if (!isPostgres(sequelize)) return;
  await rawQuery(sequelize)("SELECT set_config('app.church_id', :churchId, true)", {
    replacements: { churchId: String(churchId) },
    transaction
  });
}

type RawQuery = (sql: string, options?: Record<string, unknown>) => Promise<unknown>;
const rawQueries = new WeakMap<Sequelize, RawQuery>();

function rawQuery(sequelize: Sequelize): RawQuery {
  return rawQueries.get(sequelize) ?? ((sql, options) => (sequelize as any).query(sql, options));
}

/**
 * Makes `sequelize.query` and `sequelize.transaction` aware of the request transaction. Sequelize
 * would otherwise need cls-hooked (built on async_hooks, which slows every promise); this uses
 * the AsyncLocalStorage the tenant context already lives in.
 */
export function installTenantTransactions(sequelize: Sequelize): void {
  const anySequelize = sequelize as any;
  const originalQuery = anySequelize.query.bind(sequelize) as RawQuery;
  const originalTransaction = anySequelize.transaction.bind(sequelize) as (
    a?: unknown,
    b?: unknown
  ) => Promise<unknown>;
  rawQueries.set(sequelize, originalQuery);

  anySequelize.query = async (sql: unknown, options: Record<string, unknown> = {}) => {
    if (options.transaction === undefined) {
      const tenantTx = currentTenantOrNull()?.tenantTx;
      if (tenantTx) {
        options = { ...options, transaction: await tenantTx.acquire() };
      }
    }
    return originalQuery(sql as string, options);
  };

  anySequelize.transaction = async (first?: unknown, second?: unknown) => {
    const hasOptions = typeof first === 'object' && first !== null;
    const options = (hasOptions ? first : {}) as Record<string, unknown>;
    const callback = (typeof first === 'function' ? first : second) as unknown;
    const tenantTx = currentTenantOrNull()?.tenantTx;
    // A transaction opened inside a request becomes a savepoint of the request transaction.
    const nested =
      options.transaction === undefined && tenantTx
        ? { ...options, transaction: await tenantTx.acquire() }
        : options;
    return callback ? originalTransaction(nested, callback) : originalTransaction(nested);
  };
}

/** Builds the TenantTx for a request; the raw (unpatched) `transaction` opens the real one. */
export function createTenantTx(sequelize: Sequelize, churchId: number): TenantTx {
  const anySequelize = sequelize as any;
  const raw = anySequelize.__rawTransaction as (options: object) => Promise<Transaction>;
  return new TenantTx(sequelize, (options) => raw.call(sequelize, options), churchId);
}

export function captureRawTransaction(sequelize: Sequelize): void {
  const anySequelize = sequelize as any;
  anySequelize.__rawTransaction = anySequelize.transaction.bind(sequelize);
}

/**
 * Hooks the response so the request transaction is committed (2xx/3xx) or rolled back (4xx/5xx)
 * before any byte reaches the client.
 */
export function bindTransactionToResponse(res: Response, context: TenantContext): void {
  const originalEnd = res.end.bind(res) as (...args: unknown[]) => Response;
  let settled = false;

  (res as any).end = (...args: unknown[]) => {
    if (settled || !context.tenantTx?.started) {
      settled = true;
      return originalEnd(...args);
    }
    settled = true;
    const ok = res.statusCode < 400 || context.tenantTx.forceCommit;
    context.tenantTx
      .finish(ok)
      .then(() => originalEnd(...args))
      .catch((error: unknown) => {
        logger.error('request transaction failed to finish', {
          requestId: context.requestId,
          error: error instanceof Error ? error.message : String(error)
        });
        if (!res.headersSent) {
          res.removeHeader('Content-Length');
          res.removeHeader('ETag');
          res.status(ok ? 409 : res.statusCode);
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          originalEnd(
            JSON.stringify({
              message: ok
                ? 'The change was rejected by a database integrity rule and was not saved.'
                : 'Internal Server Error',
              requestId: context.requestId
            })
          );
        } else {
          res.destroy();
        }
      });
    return res;
  };

  // A client that hangs up mid-request must not leave the transaction (and its connection) open.
  res.on('close', () => {
    if (!settled && context.tenantTx?.started) {
      settled = true;
      context.tenantTx.finish(false).catch(() => undefined);
    }
  });
}

/** Routes whose reads may be served by a replica call this before their first query. */
export function preferReplica(_req: Request, _res: Response, next: NextFunction): void {
  const tenantTx = currentTenantOrNull()?.tenantTx;
  if (tenantTx && !tenantTx.started) {
    tenantTx.preferReplica = true;
  }
  next();
}
