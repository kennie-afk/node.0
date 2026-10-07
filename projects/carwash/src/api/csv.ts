import { Response } from 'express';
import { logger } from '../common/logger';

/**
 * One CSV cell. Quotes are doubled and the value is quoted when it needs it. A cell that starts with =, +, -
 * or @ is prefixed with an apostrophe, because spreadsheets run those as formulas and a plate or a note
 * typed by an attendant would otherwise be able to execute in the owner's Excel.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = value instanceof Date ? value.toISOString() : typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function csvLine(values: unknown[]): string {
  return `${values.map(csvCell).join(',')}\r\n`;
}

/** Integer cents as a decimal string (12345 -> "123.45") without ever touching floating point. */
export function kes(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/**
 * Streams every row of a listing, one keyset page at a time, so a year of data neither sits in memory nor
 * is silently cut off at some LIMIT. If a page fails half way the connection is destroyed instead of
 * ended: the downloader sees an aborted transfer, never a file that looks complete and is not.
 */
export async function streamCsv<T>(
  res: Response,
  filename: string,
  header: string[],
  fetchPage: (after: string | null) => Promise<{ items: T[]; next: string | null }>,
  toRow: (item: T) => unknown[]
): Promise<void> {
  // The first page is fetched before any header is sent, so a bad filter is an ordinary 400 and not a dead download.
  let page = await fetchPage(null);

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  let closed = false;
  res.on('close', () => {
    closed = true;
  });

  const write = (chunk: string) =>
    new Promise<void>((resolve) => {
      if (res.write(chunk)) resolve();
      else res.once('drain', () => resolve());
    });

  try {
    await write(csvLine(header));
    for (;;) {
      await write(page.items.map((item) => csvLine(toRow(item))).join(''));
      if (!page.next || closed) break;
      page = await fetchPage(page.next);
    }
    res.end();
  } catch (error) {
    logger.error('csv export failed part way, closing the connection', { error: error instanceof Error ? error.message : String(error) });
    res.destroy();
  }
}
