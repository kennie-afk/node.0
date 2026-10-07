/**
 * Object storage behind one small interface. Two drivers:
 *  - local: files under OBJECT_STORE_DIR (one VM with a persistent disk, tests, development).
 *  - s3:    any S3-compatible service (AWS S3, MinIO) over fetch with in-repo SigV4.
 *
 * Keys are always tenant-prefixed by the caller (`tenants/<churchId>/...`); every driver rejects
 * keys that could escape their root. Downloads go through short-lived URLs: S3 gets a real
 * pre-signed URL, the local driver gets an HMAC-signed API URL served by modules/files.
 */
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { env } from '../config/env';
import { presignUrl, signHeaders, type SigV4Credentials } from './sigv4';

export interface StoredObject {
  body: Buffer;
  contentType: string;
}

export interface ObjectStore {
  readonly driver: 'local' | 's3';
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
  /** A URL the browser can follow for `ttlSeconds`, with no credentials of its own. */
  downloadUrl(key: string, opts: { fileName: string; contentType: string; ttlSeconds: number }): Promise<string>;
}

export const sha256 = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');

/** Keys are `a/b/c.ext` made of safe characters only; anything else is a bug or an attack. */
export function assertSafeKey(key: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._\-/]{0,400}$/.test(key) || key.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    throw new Error(`unsafe object key: ${key}`);
  }
}

/** A filename made safe for use inside a key and a header. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file';
  const cleaned = base.normalize('NFKD').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '').slice(-100);
  return cleaned || 'file';
}

export function tenantKey(churchId: number, ...parts: string[]): string {
  return ['tenants', String(churchId), ...parts].join('/');
}

export class LocalObjectStore implements ObjectStore {
  readonly driver = 'local' as const;
  private readonly root: string;
  constructor(root: string, private readonly secret: string = env.JWT_SECRET) {
    this.root = path.resolve(root);
  }

  private file(key: string): string {
    assertSafeKey(key);
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error(`unsafe object key: ${key}`);
    return full;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    const target = this.file(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temp = `${target}.${randomUUID()}.tmp`;
    await fs.writeFile(temp, body, { mode: 0o600 });
    await fs.writeFile(`${target}.type`, contentType, { mode: 0o600 });
    await fs.rename(temp, target);
  }

  async get(key: string): Promise<StoredObject | null> {
    const target = this.file(key);
    try {
      const [body, type] = await Promise.all([fs.readFile(target), fs.readFile(`${target}.type`, 'utf8').catch(() => 'application/octet-stream')]);
      return { body, contentType: type };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    const target = this.file(key);
    await Promise.all([fs.rm(target, { force: true }), fs.rm(`${target}.type`, { force: true })]);
  }

  async downloadUrl(key: string, opts: { fileName: string; contentType: string; ttlSeconds: number }): Promise<string> {
    assertSafeKey(key);
    const payload = Buffer.from(JSON.stringify({ k: key, n: opts.fileName, t: opts.contentType, e: Math.floor(Date.now() / 1000) + opts.ttlSeconds })).toString('base64url');
    return `/files/download?token=${payload}.${this.sign(payload)}`;
  }

  private sign(payload: string): string {
    return createHmac('sha256', `object-store:${this.secret}`).update(payload).digest('base64url');
  }

  /** Verifies a token from downloadUrl; returns what it grants, or null when forged or expired. */
  verifyToken(token: string): { key: string; fileName: string; contentType: string } | null {
    const [payload, signature] = token.split('.');
    if (!payload || !signature) return null;
    const expected = Buffer.from(this.sign(payload));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    try {
      const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { k: string; n: string; t: string; e: number };
      if (!claims.k || claims.e < Date.now() / 1000) return null;
      return { key: claims.k, fileName: claims.n, contentType: claims.t };
    } catch {
      return null;
    }
  }
}

export interface S3Config {
  endpoint: string;
  bucket: string;
  region: string;
  accessKey: string;
  secretKey: string;
  pathStyle: boolean;
}

export class S3ObjectStore implements ObjectStore {
  readonly driver = 's3' as const;
  private readonly creds: SigV4Credentials;
  constructor(private readonly cfg: S3Config, private readonly fetchImpl: typeof fetch = fetch) {
    this.creds = { accessKey: cfg.accessKey, secretKey: cfg.secretKey, region: cfg.region };
  }

  private url(key: string): URL {
    assertSafeKey(key);
    const base = new URL(this.cfg.endpoint);
    if (this.cfg.pathStyle) return new URL(`${base.origin}/${this.cfg.bucket}/${key}`);
    return new URL(`${base.protocol}//${this.cfg.bucket}.${base.host}/${key}`);
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    const url = this.url(key);
    const headers = signHeaders({ method: 'PUT', url, creds: this.creds, body, headers: { 'content-type': contentType } });
    const res = await this.fetchImpl(url, { method: 'PUT', headers, body });
    if (!res.ok) throw new Error(`object store PUT failed: ${res.status}`);
  }

  async get(key: string): Promise<StoredObject | null> {
    const url = this.url(key);
    const res = await this.fetchImpl(url, { method: 'GET', headers: signHeaders({ method: 'GET', url, creds: this.creds }) });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`object store GET failed: ${res.status}`);
    return { body: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get('content-type') ?? 'application/octet-stream' };
  }

  async delete(key: string): Promise<void> {
    const url = this.url(key);
    const res = await this.fetchImpl(url, { method: 'DELETE', headers: signHeaders({ method: 'DELETE', url, creds: this.creds }) });
    if (!res.ok && res.status !== 404) throw new Error(`object store DELETE failed: ${res.status}`);
  }

  async downloadUrl(key: string, opts: { fileName: string; contentType: string; ttlSeconds: number }): Promise<string> {
    return presignUrl({
      method: 'GET',
      url: this.url(key),
      creds: this.creds,
      expiresSeconds: opts.ttlSeconds,
      extraQuery: {
        'response-content-disposition': `attachment; filename="${safeFileName(opts.fileName)}"`,
        'response-content-type': opts.contentType
      }
    });
  }
}

let current: ObjectStore | null = null;

export function objectStore(): ObjectStore {
  if (current) return current;
  if (env.OBJECT_STORE_DRIVER === 's3') {
    if (!env.S3_ENDPOINT || !env.S3_BUCKET || !env.S3_ACCESS_KEY || !env.S3_SECRET_KEY) {
      throw new Error('OBJECT_STORE_DRIVER=s3 needs S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY and S3_SECRET_KEY');
    }
    current = new S3ObjectStore({ endpoint: env.S3_ENDPOINT, bucket: env.S3_BUCKET, region: env.S3_REGION, accessKey: env.S3_ACCESS_KEY, secretKey: env.S3_SECRET_KEY, pathStyle: env.S3_FORCE_PATH_STYLE });
  } else {
    current = new LocalObjectStore(env.OBJECT_STORE_DIR);
  }
  return current;
}

/** Tests swap the store (a temp directory, or an S3 driver over a fake fetch). */
export function setObjectStore(store: ObjectStore | null): void {
  current = store;
}
