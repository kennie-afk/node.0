import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { pool } from './pool';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'migrations');

let filesCache: string[] | null = null;

async function migrationFiles(dir: string): Promise<string[]> {
  if (dir !== MIGRATIONS_DIR) return (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort();
  filesCache ??= (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort();
  return filesCache;
}

export interface Readiness {
  ready: boolean;
  reason?: string;
  pending?: string[];
  version?: string | null;
}

/** Pure comparison, so it is testable without a database. */
export function compareMigrations(files: string[], applied: string[]): { pending: string[]; ahead: string[] } {
  const have = new Set(applied);
  const known = new Set(files);
  return { pending: files.filter((name) => !have.has(name)), ahead: applied.filter((name) => !known.has(name)) };
}

/**
 * Ready means the database answers AND has every migration this build ships. A process that started
 * against a database that was never migrated (or migrated by an older release) answered SELECT 1 and
 * was routed traffic, then failed every real query. A database that is *ahead* of the build (a rolling
 * deploy) is still ready: migrations are additive.
 */
export async function checkReadiness(dir: string = MIGRATIONS_DIR): Promise<Readiness> {
  let applied: string[];
  try {
    const { rows } = await pool.query('SELECT name FROM schema_migrations ORDER BY name');
    applied = rows.map((row) => row.name as string);
  } catch (error) {
    const code = (error as { code?: string }).code;
    // 42P01: the table does not exist, i.e. migrations have never been run
    return { ready: false, reason: code === '42P01' ? 'database has not been migrated' : 'database unreachable' };
  }

  let files: string[];
  try {
    files = await migrationFiles(dir);
  } catch {
    // an image without its migrations folder cannot compare; reachability is all it can vouch for
    return { ready: true, version: applied[applied.length - 1] ?? null };
  }
  const { pending } = compareMigrations(files, applied);
  if (pending.length > 0) {
    return { ready: false, reason: 'migrations pending', pending, version: applied[applied.length - 1] ?? null };
  }
  return { ready: true, version: applied[applied.length - 1] ?? null };
}
