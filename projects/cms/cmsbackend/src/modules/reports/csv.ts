import { NextFunction, Request, RequestHandler, Response } from 'express';

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

/**
 * RFC 4180 quoting, plus a guard against spreadsheet formula injection: a text cell that starts
 * with = + - @ or a control character would be executed by Excel, so it is prefixed with a quote.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) {
    text = `'${text}`;
  }
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const lines = [columns.map((c) => csvCell(c.header)).join(',')];
  for (const row of rows) lines.push(columns.map((c) => csvCell(c.value(row))).join(','));
  return `${lines.join('\r\n')}\r\n`;
}

/** A route that answers with a downloadable CSV file. */
export function csvRoute(handler: (req: Request) => Promise<{ filename: string; body: string }>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req)
      .then(({ filename, body }) => {
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, '_')}"`);
        res.status(200).send(body);
      })
      .catch(next);
  };
}
