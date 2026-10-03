/**
 * The daily close: every site's finished day is reconciled once, without anyone pressing a button.
 * Pure date logic is separated from the database walk so the part that is easy to get wrong - which
 * calendar day it is *at the site* - is tested on its own.
 */
import { withOrg, withoutTenant } from '../persistence/pool';
import { closeDay } from './service';
import { logger } from '../common/logger';

/** The calendar day before "now" as a clock on the wall of `timeZone` would show it, as YYYY-MM-DD. */
export function localYesterday(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const pick = (type: string) => Number(parts.find((part) => part.type === type)!.value);
  const today = Date.UTC(pick('year'), pick('month') - 1, pick('day'));
  return new Date(today - 86_400_000).toISOString().slice(0, 10);
}

export interface DailyCloseResult {
  sites: number;
  closed: number;
  alreadyClosed: number;
  failed: number;
}

export async function runDailyCloses(now: Date = new Date()): Promise<DailyCloseResult> {
  const directory = await withoutTenant(async (client) => (await client.query('SELECT org_id, site_id, timezone FROM site_directory()')).rows);
  const result: DailyCloseResult = { sites: directory.length, closed: 0, alreadyClosed: 0, failed: 0 };

  for (const entry of directory) {
    let zone = entry.timezone as string;
    try {
      localYesterday(now, zone);
    } catch {
      zone = 'Africa/Nairobi';
    }
    const day = localYesterday(now, zone);
    try {
      const done = await withOrg(entry.org_id, async (client) =>
        (await client.query('SELECT 1 FROM day_closes WHERE site_id = $1 AND business_day = $2', [entry.site_id, day])).rows.length > 0
      );
      if (done) {
        result.alreadyClosed += 1;
        continue;
      }
      await closeDay(entry.org_id, entry.site_id, day);
      result.closed += 1;
    } catch (error) {
      result.failed += 1;
      logger.error('daily close failed for a site', { orgId: entry.org_id, siteId: entry.site_id, day, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return result;
}
