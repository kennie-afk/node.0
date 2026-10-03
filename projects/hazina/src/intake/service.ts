/**
 * Stores an uploaded statement and the figures derived from it. The file's SHA-256 is kept so the same file is not
 * analysed twice for one borrower. Failed uploads are recorded too (with the reason), so a person can see what was tried.
 */
import { PoolClient } from 'pg';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { z } from 'zod';
import { BadRequestError, ConflictError, NotFoundError } from '../domain/errors';
import { Ctx, audit, getSettings } from '../common/context';
import { getMemberRow } from '../members/service';
import {
  Flag,
  PdfTextExtractor,
  StatementFormatError,
  StatementTxn,
  consistencyFlags,
  parseStatementCsv,
  parseStatementPdfText,
  summarise
} from './statement';
import { checkNationalId, checkPayslip } from './documents';

export const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;

/** Uses poppler's pdftotext when the server has it. Without it a PDF is refused with a clear reason, never guessed at. */
export class PdftotextExtractor implements PdfTextExtractor {
  extract(pdf: Buffer): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn('pdftotext', ['-layout', '-', '-'], { stdio: ['pipe', 'pipe', 'pipe'] });
      let out = '';
      let err = '';
      child.stdout.on('data', (chunk) => (out += chunk));
      child.stderr.on('data', (chunk) => (err += chunk));
      child.on('error', () => reject(new StatementFormatError('PDF statements need the pdftotext program, which is not installed on this server. Upload the CSV, or ask your administrator to install poppler-utils.')));
      child.on('close', (code) => {
        if (code === 0) resolve(out);
        else if (/password/i.test(err)) reject(new StatementFormatError('The PDF is password protected. Remove the password, or upload the CSV.'));
        else reject(new StatementFormatError(`The PDF could not be read (${err.trim().slice(0, 120) || `exit ${code}`}).`));
      });
      child.stdin.on('error', () => undefined);
      child.stdin.end(pdf);
    });
  }
}

export const uploadSchema = z.object({
  memberId: z.string().uuid(),
  loanId: z.string().uuid().optional().nullable(),
  filename: z.string().trim().min(1).max(200),
  contentBase64: z.string().min(8)
});

function kindOf(filename: string, bytes: Buffer): 'csv' | 'pdf' | 'unknown' {
  if (bytes.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (/\.(csv|txt)$/i.test(filename) || !bytes.subarray(0, 512).includes(0)) return 'csv';
  return 'unknown';
}

export type UploadResult =
  | { ok: true; id: string; format: 'csv' | 'pdf' | 'unknown'; rows: number; summary: ReturnType<typeof summarise>['summary']; flags: Flag[] }
  | { ok: false; error: string };

/**
 * Returns `{ ok: false }` for a file that could not be read, instead of throwing: the failure is a record worth keeping
 * ("someone tried this file and it was refused, and why"), and a thrown error would roll the transaction back and lose it.
 * The route turns it into a 400 after the transaction has committed.
 */
export async function uploadStatement(client: PoolClient, ctx: Ctx, input: z.infer<typeof uploadSchema>, extractor: PdfTextExtractor = new PdftotextExtractor()): Promise<UploadResult> {
  const member = await getMemberRow(client, input.memberId);
  const bytes = Buffer.from(input.contentBase64, 'base64');
  if (bytes.length === 0) throw new BadRequestError('The file is empty.');
  if (bytes.length > MAX_UPLOAD_BYTES) throw new BadRequestError('The file is larger than 6 MB.');
  const sha = createHash('sha256').update(bytes).digest('hex');
  const format = kindOf(input.filename, bytes);

  const same = await client.query(`SELECT id FROM statement_uploads WHERE member_id = $1 AND sha256 = $2 AND status = 'parsed'`, [member.id, sha]);
  if (same.rows[0]) throw new ConflictError('This exact file was already analysed for this member.');

  const settings = await getSettings(client);
  let txns: StatementTxn[];
  try {
    if (format === 'pdf') txns = parseStatementPdfText(await extractor.extract(bytes));
    else if (format === 'csv') txns = parseStatementCsv(bytes.toString('utf8'));
    else throw new StatementFormatError('Format not recognised: upload a CSV or PDF statement.');
  } catch (error) {
    if (!(error instanceof StatementFormatError)) throw error;
    await client.query(
      `INSERT INTO statement_uploads (org_id, member_id, loan_id, filename, sha256, format, status, error, uploaded_by) VALUES ($1, $2, $3, $4, $5, $6, 'failed', $7, $8)`,
      [ctx.orgId, member.id, input.loanId ?? null, input.filename, sha, format, error.message, ctx.userId]
    );
    await audit(client, ctx, 'intake.statement_failed', 'member', member.id, { filename: input.filename, reason: error.message });
    return { ok: false, error: error.message };
  }

  const { summary, completed } = summarise(txns, settings.capacityShareBp);
  const flags = consistencyFlags(txns, summary);
  const upload = (await client.query(
    `INSERT INTO statement_uploads (org_id, member_id, loan_id, filename, sha256, format, status, period_start, period_end, txn_count, summary, flags, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, 'parsed', $7, $8, $9, $10::jsonb, $11::jsonb, $12) RETURNING id`,
    [ctx.orgId, member.id, input.loanId ?? null, input.filename, sha, format, summary.periodStart, summary.periodEnd, txns.length, JSON.stringify(summary), JSON.stringify(flags), ctx.userId]
  )).rows[0];

  for (let i = 0; i < txns.length; i += 200) {
    const chunk = txns.slice(i, i + 200);
    const params: unknown[] = [];
    const values = chunk.map((t, k) => {
      const o = k * 9;
      params.push(ctx.orgId, upload.id, t.receiptNo, t.completedAt, t.details, t.status, t.paidInCents, t.withdrawnCents, t.balanceCents);
      return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}, $${o + 7}, $${o + 8}, $${o + 9})`;
    });
    await client.query(
      `INSERT INTO statement_txns (org_id, upload_id, receipt_no, completed_at, details, txn_status, paid_in_cents, withdrawn_cents, balance_cents) VALUES ${values.join(', ')}`,
      params
    );
  }
  await audit(client, ctx, 'intake.statement', 'member', member.id, { uploadId: upload.id, rows: txns.length, flags: flags.map((f) => f.code) });
  void completed;
  return { ok: true, id: upload.id as string, format, rows: txns.length, summary, flags };
}

export async function listUploads(client: PoolClient, memberId: string) {
  const rows = (await client.query(
    `SELECT id, filename, format, status, error, period_start, period_end, txn_count, summary, flags, created_at FROM statement_uploads WHERE member_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [memberId]
  )).rows;
  return rows.map((r) => ({
    id: r.id, filename: r.filename, format: r.format, status: r.status, error: r.error, periodStart: r.period_start, periodEnd: r.period_end,
    rows: r.txn_count, summary: r.summary, flags: r.flags as Flag[], createdAt: r.created_at
  }));
}

export async function getUpload(client: PoolClient, id: string) {
  const r = (await client.query('SELECT * FROM statement_uploads WHERE id = $1', [id])).rows[0];
  if (!r) throw new NotFoundError('That upload was not found.');
  return { id: r.id, memberId: r.member_id, filename: r.filename, format: r.format, status: r.status, error: r.error, summary: r.summary, flags: r.flags as Flag[], createdAt: r.created_at };
}

/** Compares an instalment with the capacity figure in an upload: arithmetic, and said to be so. */
export async function capacityCheck(client: PoolClient, uploadId: string, instalmentCents: number) {
  const upload = await getUpload(client, uploadId);
  if (upload.status !== 'parsed') throw new ConflictError('That upload did not parse, so there are no figures to compare with.');
  const capacity = Number(upload.summary.indicativeCapacityCents ?? 0);
  return {
    instalmentCents,
    indicativeCapacityCents: capacity,
    capacityShareBp: Number(upload.summary.capacityShareBp ?? 0),
    fits: instalmentCents <= capacity,
    note: 'Arithmetic on one statement against a configured percentage of average monthly inflow. It is not a credit decision.'
  };
}

export const payslipSchema = z.object({
  memberId: z.string().uuid(),
  loanId: z.string().uuid().optional().nullable(),
  grossCents: z.number().int().min(0),
  deductions: z.array(z.object({ name: z.string().trim().min(1).max(60), amountCents: z.number().int() })).max(30),
  netCents: z.number().int().min(0),
  month: z.string().trim().max(10).optional().nullable()
});

export async function recordPayslipCheck(client: PoolClient, ctx: Ctx, input: z.infer<typeof payslipSchema>) {
  await getMemberRow(client, input.memberId);
  const flags = checkPayslip(input);
  const row = (await client.query(
    `INSERT INTO document_checks (org_id, member_id, loan_id, kind, input, flags, created_by) VALUES ($1, $2, $3, 'payslip', $4::jsonb, $5::jsonb, $6) RETURNING id`,
    [ctx.orgId, input.memberId, input.loanId ?? null, JSON.stringify(input), JSON.stringify(flags), ctx.userId]
  )).rows[0];
  await audit(client, ctx, 'intake.payslip', 'member', input.memberId, { flags: flags.map((f) => f.code) });
  return { id: row.id as string, flags };
}

export const idCheckSchema = z.object({ memberId: z.string().uuid(), idNumber: z.string().trim().min(1).max(30), loanId: z.string().uuid().optional().nullable() });

export async function recordIdCheck(client: PoolClient, ctx: Ctx, input: z.infer<typeof idCheckSchema>) {
  const member = await getMemberRow(client, input.memberId);
  const flags = checkNationalId(input.idNumber, member.id_number);
  const row = (await client.query(
    `INSERT INTO document_checks (org_id, member_id, loan_id, kind, input, flags, created_by) VALUES ($1, $2, $3, 'national_id', $4::jsonb, $5::jsonb, $6) RETURNING id`,
    [ctx.orgId, input.memberId, input.loanId ?? null, JSON.stringify({ idNumber: input.idNumber }), JSON.stringify(flags), ctx.userId]
  )).rows[0];
  await audit(client, ctx, 'intake.id_check', 'member', input.memberId, { flags: flags.map((f) => f.code) });
  return { id: row.id as string, flags };
}

export async function listChecks(client: PoolClient, memberId: string) {
  const rows = (await client.query(`SELECT id, kind, input, flags, created_at FROM document_checks WHERE member_id = $1 ORDER BY created_at DESC LIMIT 50`, [memberId])).rows;
  return rows.map((r) => ({ id: r.id, kind: r.kind, input: r.input, flags: r.flags as Flag[], createdAt: r.created_at }));
}
