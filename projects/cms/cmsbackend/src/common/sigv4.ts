/**
 * Minimal AWS Signature Version 4 for S3, enough for PUT/GET/DELETE of one object and for
 * pre-signed GET URLs. Written in-repo so the API carries no cloud SDK; the signing example from
 * the AWS documentation is a unit test, so a regression is caught without a bucket.
 */
import { createHash, createHmac } from 'node:crypto';

const sha256Hex = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const hmac = (key: string | Buffer, data: string) => createHmac('sha256', key).update(data).digest();

/** RFC 3986 encoding as SigV4 demands (encodeURIComponent leaves !'()* alone). */
export const encodeRfc3986 = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const encodePath = (path: string) => path.split('/').map(encodeRfc3986).join('/');

export interface SigV4Credentials {
  accessKey: string;
  secretKey: string;
  region: string;
  service?: string;
}

export const amzDate = (now: Date) => now.toISOString().replace(/[:-]|\.\d{3}/g, '');

function signingKey(secret: string, day: string, region: string, service: string) {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, day), region), service), 'aws4_request');
}

function canonicalQuery(query: Record<string, string>) {
  return Object.keys(query)
    .sort()
    .map((k) => `${encodeRfc3986(k)}=${encodeRfc3986(query[k])}`)
    .join('&');
}

/** A pre-signed URL: the signature travels in the query string, so a browser can follow it with no headers. */
export function presignUrl(opts: { method: string; url: URL; creds: SigV4Credentials; expiresSeconds: number; now?: Date; extraQuery?: Record<string, string> }): string {
  const { method, url, creds, expiresSeconds } = opts;
  const service = creds.service ?? 's3';
  const stamp = amzDate(opts.now ?? new Date());
  const day = stamp.slice(0, 8);
  const scope = `${day}/${creds.region}/${service}/aws4_request`;
  const query: Record<string, string> = {
    ...opts.extraQuery,
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${creds.accessKey}/${scope}`,
    'X-Amz-Date': stamp,
    'X-Amz-Expires': String(expiresSeconds),
    'X-Amz-SignedHeaders': 'host'
  };
  const canonical = [method, encodePath(decodeURI(url.pathname)), canonicalQuery(query), `host:${url.host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', stamp, scope, sha256Hex(canonical)].join('\n');
  const signature = createHmac('sha256', signingKey(creds.secretKey, day, creds.region, service)).update(toSign).digest('hex');
  return `${url.origin}${url.pathname}?${canonicalQuery(query)}&X-Amz-Signature=${signature}`;
}

/** Headers for an ordinary signed request (PUT/GET/DELETE of one object). */
export function signHeaders(opts: { method: string; url: URL; creds: SigV4Credentials; body?: Buffer; headers?: Record<string, string>; now?: Date }): Record<string, string> {
  const { method, url, creds } = opts;
  const service = creds.service ?? 's3';
  const stamp = amzDate(opts.now ?? new Date());
  const day = stamp.slice(0, 8);
  const scope = `${day}/${creds.region}/${service}/aws4_request`;
  const payloadHash = sha256Hex(opts.body ?? '');
  const headers: Record<string, string> = { ...opts.headers, host: url.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': stamp };
  const names = Object.keys(headers).map((h) => h.toLowerCase()).sort();
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v.trim()]));
  const canonicalHeaders = names.map((n) => `${n}:${lower[n]}\n`).join('');
  const query: Record<string, string> = {};
  url.searchParams.forEach((v, k) => { query[k] = v; });
  const canonical = [method, encodePath(decodeURI(url.pathname)), canonicalQuery(query), canonicalHeaders, names.join(';'), payloadHash].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', stamp, scope, sha256Hex(canonical)].join('\n');
  const signature = createHmac('sha256', signingKey(creds.secretKey, day, creds.region, service)).update(toSign).digest('hex');
  const { host: _host, ...rest } = headers;
  return { ...rest, authorization: `AWS4-HMAC-SHA256 Credential=${creds.accessKey}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}` };
}
