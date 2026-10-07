/**
 * Sermon recordings and notes held in the object store. Same discipline as bill attachments: the
 * key is made here (tenant-prefixed, never taken from the caller), type and size are limited, the
 * leading bytes must match the declared type, and a SHA-256 is kept so a download can be checked.
 *
 * Limitation, stated plainly: an upload is buffered in memory (default cap 50 MB), so a long
 * sermon video belongs on a video host, linked through the sermon's videoUrl. Streaming multipart
 * upload to the bucket is not built.
 */
import { randomUUID } from 'node:crypto';
import { Transaction } from 'sequelize';
import { env } from '../config/env';
import { objectStore, safeFileName, sha256, tenantKey } from '../common/object-store';
import { toInt } from '../common/money';
import { exec, select, selectOne } from '../modules/finance/sql';
import { insertReturningId } from '../modules/giving/shared';
import { BadRequestError, ConflictError, NotFoundError } from '../utils/errors';

export type MediaKind = 'audio' | 'video' | 'notes';

const starts = (head: Buffer, ...sigs: string[]) => sigs.some((s) => head.subarray(0, s.length).toString('latin1') === s);
const MEDIA: Record<string, { kind: MediaKind; ok: (h: Buffer) => boolean }> = {
  'audio/mpeg': { kind: 'audio', ok: (h) => starts(h, 'ID3') || (h[0] === 0xff && (h[1] & 0xe0) === 0xe0) },
  'audio/mp4': { kind: 'audio', ok: (h) => h.subarray(4, 8).toString('latin1') === 'ftyp' },
  'audio/wav': { kind: 'audio', ok: (h) => starts(h, 'RIFF') },
  'audio/ogg': { kind: 'audio', ok: (h) => starts(h, 'OggS') },
  'video/mp4': { kind: 'video', ok: (h) => h.subarray(4, 8).toString('latin1') === 'ftyp' },
  'video/webm': { kind: 'video', ok: (h) => h[0] === 0x1a && h[1] === 0x45 && h[2] === 0xdf && h[3] === 0xa3 },
  'application/pdf': { kind: 'notes', ok: (h) => starts(h, '%PDF-') },
  'text/plain': { kind: 'notes', ok: () => true }
};

export const MEDIA_TYPES = Object.keys(MEDIA);

async function loadSermon(t: Transaction, churchId: number, id: number) {
  const row = await selectOne<any>(t, `SELECT id FROM sermons WHERE church_id = :churchId AND id = :id`, { churchId, id });
  if (!row) throw new NotFoundError(`Sermon ${id} was not found in this church`);
}

const dto = (r: any) => ({ id: toInt(r.id), sermonId: toInt(r.sermon_id), kind: r.kind as MediaKind, fileName: r.file_name, contentType: r.content_type, sizeBytes: toInt(r.size_bytes), sha256: String(r.sha256).trim(), createdAt: new Date(r.created_at).toISOString() });

export async function listMedia(t: Transaction, churchId: number, sermonId: number) {
  await loadSermon(t, churchId, sermonId);
  return (await select<any>(t, `SELECT id, sermon_id, kind, file_name, content_type, size_bytes, sha256, created_at FROM sermon_media WHERE church_id = :churchId AND sermon_id = :sermonId ORDER BY id`, { churchId, sermonId })).map(dto);
}

export async function addMedia(t: Transaction, churchId: number, actorId: number, sermonId: number, upload: { fileName: string; contentType: string; body: Buffer }) {
  await loadSermon(t, churchId, sermonId);
  const type = upload.contentType.toLowerCase();
  const spec = MEDIA[type];
  if (!spec) throw new BadRequestError(`${upload.contentType} is not accepted (audio: MP3, M4A, WAV, OGG; video: MP4, WebM; notes: PDF or plain text)`);
  if (upload.body.length === 0) throw new BadRequestError('the file is empty');
  if (upload.body.length > env.MEDIA_MAX_BYTES) throw new BadRequestError(`the file is larger than the ${Math.floor(env.MEDIA_MAX_BYTES / 1024 / 1024)} MB limit; link long recordings with the video URL instead`);
  if (!spec.ok(upload.body.subarray(0, 16))) throw new BadRequestError('the file content does not match its declared type');
  const count = await selectOne<any>(t, `SELECT COUNT(*) AS n FROM sermon_media WHERE church_id = :churchId AND sermon_id = :sermonId`, { churchId, sermonId });
  if (toInt(count?.n) >= 10) throw new ConflictError('a sermon holds at most 10 files');
  const fileName = safeFileName(upload.fileName);
  const digest = sha256(upload.body);
  const key = tenantKey(churchId, 'sermons', String(sermonId), `${randomUUID()}-${fileName}`);
  const store = objectStore();
  await store.put(key, upload.body, type);
  try {
    const id = await insertReturningId(
      t,
      `INSERT INTO sermon_media (church_id, sermon_id, kind, file_name, content_type, size_bytes, storage_key, sha256, uploaded_by, created_at)
       VALUES (:churchId, :sermonId, :kind, :fileName, :type, :size, :key, :digest, :actor, :now)`,
      { churchId, sermonId, kind: spec.kind, fileName, type, size: upload.body.length, key, digest, actor: actorId, now: new Date() }
    );
    const row = await selectOne<any>(t, `SELECT id, sermon_id, kind, file_name, content_type, size_bytes, sha256, created_at FROM sermon_media WHERE church_id = :churchId AND id = :id`, { churchId, id });
    return dto(row);
  } catch (error) {
    await store.delete(key).catch(() => undefined);
    throw error;
  }
}

async function findMedia(t: Transaction, churchId: number, sermonId: number, mediaId: number) {
  const row = await selectOne<any>(t, `SELECT * FROM sermon_media WHERE church_id = :churchId AND sermon_id = :sermonId AND id = :mediaId`, { churchId, sermonId, mediaId });
  if (!row || !String(row.storage_key).startsWith(`tenants/${churchId}/`)) throw new NotFoundError(`media ${mediaId} was not found on this sermon`);
  return row;
}

export async function mediaLink(t: Transaction, churchId: number, sermonId: number, mediaId: number) {
  const row = await findMedia(t, churchId, sermonId, mediaId);
  const ttlSeconds = 900;
  const url = await objectStore().downloadUrl(row.storage_key, { fileName: row.file_name, contentType: row.content_type, ttlSeconds });
  return { url, expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(), fileName: row.file_name };
}

export async function removeMedia(t: Transaction, churchId: number, sermonId: number, mediaId: number) {
  const row = await findMedia(t, churchId, sermonId, mediaId);
  await exec(t, `DELETE FROM sermon_media WHERE church_id = :churchId AND id = :mediaId`, { churchId, mediaId });
  await objectStore().delete(row.storage_key).catch(() => undefined);
}

/** Deleting a sermon cascades its rows in the database; the caller collects the keys first and removes the objects after. */
export async function sermonObjectKeys(t: Transaction, churchId: number, sermonId: number): Promise<string[]> {
  const rows = await select<any>(t, `SELECT storage_key FROM sermon_media WHERE church_id = :churchId AND sermon_id = :sermonId`, { churchId, sermonId });
  return rows.map((r) => String(r.storage_key)).filter((k) => k.startsWith(`tenants/${churchId}/`));
}

export async function deleteObjects(keys: string[]): Promise<void> {
  for (const key of keys) await objectStore().delete(key).catch(() => undefined);
}
