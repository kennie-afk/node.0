import { readdir } from 'node:fs/promises';
import path from 'node:path';

/** The migration files this build ships, in order. Empty when the directory is not present (then readiness cannot compare). */
export async function shippedMigrations(): Promise<string[]> {
  try {
    return (await readdir(path.resolve(process.cwd(), 'migrations'))).filter((name) => name.endsWith('.sql')).sort();
  } catch {
    return [];
  }
}
