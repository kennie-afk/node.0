import { describe, expect, it } from 'vitest';
import { presignUrl } from '../src/common/sigv4';
import { S3ObjectStore, LocalObjectStore, assertSafeKey, safeFileName } from '../src/common/object-store';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

describe('SigV4', () => {
  it('reproduces the pre-signed GET example published in the AWS S3 documentation', () => {
    const url = presignUrl({
      method: 'GET',
      url: new URL('https://examplebucket.s3.amazonaws.com/test.txt'),
      creds: { accessKey: 'AKIAIOSFODNN7EXAMPLE', secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', region: 'us-east-1' },
      expiresSeconds: 86400,
      now: new Date('2013-05-24T00:00:00Z')
    });
    expect(url).toContain('X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404');
  });
});

describe('object keys', () => {
  it('rejects traversal and odd characters, and cleans file names', () => {
    for (const bad of ['../x', 'a/../b', '/abs', 'a//b', 'a b', 'a\\b', '']) expect(() => assertSafeKey(bad)).toThrow();
    expect(() => assertSafeKey('tenants/1/bills/2/abc-receipt.pdf')).not.toThrow();
    expect(safeFileName('../../etc/pass wd.pdf')).toBe('pass_wd.pdf');
  });

  it('local driver round-trips, refuses forged or expired download tokens', async () => {
    const store = new LocalObjectStore(mkdtempSync(path.join(tmpdir(), 'cms-os-')), 'secret-secret-secret-secret-secret-1');
    await store.put('tenants/1/a.txt', Buffer.from('hello'), 'text/plain');
    expect((await store.get('tenants/1/a.txt'))?.body.toString()).toBe('hello');
    expect(await store.get('tenants/1/missing.txt')).toBeNull();
    const url = await store.downloadUrl('tenants/1/a.txt', { fileName: 'a.txt', contentType: 'text/plain', ttlSeconds: 60 });
    const token = decodeURIComponent(url.split('token=')[1]);
    expect(store.verifyToken(token)?.key).toBe('tenants/1/a.txt');
    expect(store.verifyToken(token.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')))).toBeNull();
    const expired = await store.downloadUrl('tenants/1/a.txt', { fileName: 'a.txt', contentType: 'text/plain', ttlSeconds: -10 });
    expect(store.verifyToken(decodeURIComponent(expired.split('token=')[1]))).toBeNull();
  });

  it('s3 driver signs PUT/GET/DELETE and builds a pre-signed URL', async () => {
    const seen: Array<{ method: string; url: string; auth: string }> = [];
    const fake = (async (url: URL, init: RequestInit) => {
      seen.push({ method: String(init.method), url: String(url), auth: String((init.headers as Record<string, string>).authorization) });
      return new Response(init.method === 'GET' ? 'body' : '', { status: 200, headers: { 'content-type': 'text/plain' } });
    }) as unknown as typeof fetch;
    const store = new S3ObjectStore({ endpoint: 'http://minio:9000', bucket: 'cms', region: 'us-east-1', accessKey: 'ak', secretKey: 'sk', pathStyle: true }, fake);
    await store.put('tenants/1/x.pdf', Buffer.from('x'), 'application/pdf');
    expect((await store.get('tenants/1/x.pdf'))?.body.toString()).toBe('body');
    await store.delete('tenants/1/x.pdf');
    expect(seen.map((s) => s.method)).toEqual(['PUT', 'GET', 'DELETE']);
    expect(seen[0].url).toBe('http://minio:9000/cms/tenants/1/x.pdf');
    expect(seen.every((s) => s.auth.startsWith('AWS4-HMAC-SHA256 Credential=ak/'))).toBe(true);
    const link = await store.downloadUrl('tenants/1/x.pdf', { fileName: 'x.pdf', contentType: 'application/pdf', ttlSeconds: 300 });
    expect(link).toMatch(/^http:\/\/minio:9000\/cms\/tenants\/1\/x\.pdf\?.*X-Amz-Signature=[0-9a-f]{64}$/);
    expect(link).toContain('X-Amz-Expires=300');
  });
});
