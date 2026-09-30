import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env';

/**
 * Daraja settings that are only meaningful in MPESA_MODE=daraja. They are read from the
 * environment here rather than the shared schema so the module stays self-contained; nothing is
 * read, and no outbound call can be made, unless that mode is selected.
 */
export interface DarajaConfig {
  baseUrl: string;
  consumerKey: string;
  consumerSecret: string;
  shortcode: string;
  passkey: string;
  /** Public base URL Safaricom can reach, e.g. https://api.church.example */
  callbackBaseUrl: string;
}

export function darajaConfig(): DarajaConfig {
  const read = (name: string) => {
    const value = process.env[name];
    if (!value) throw new Error(`${name} must be set when MPESA_MODE=daraja`);
    return value;
  };
  return {
    baseUrl: process.env.MPESA_BASE_URL ?? 'https://sandbox.safaricom.co.ke',
    consumerKey: read('MPESA_CONSUMER_KEY'),
    consumerSecret: read('MPESA_CONSUMER_SECRET'),
    shortcode: read('MPESA_SHORTCODE'),
    passkey: read('MPESA_PASSKEY'),
    callbackBaseUrl: read('MPESA_CALLBACK_BASE_URL')
  };
}

/**
 * Each church's callback URLs carry a secret derived from the platform secret and the church
 * slug (HMAC), so there is nothing per-church to store or leak, and one church's URL cannot be
 * used to post into another church.
 */
export function callbackSecretFor(slug: string): string | null {
  if (!env.MPESA_CALLBACK_SECRET) return null;
  return createHmac('sha256', env.MPESA_CALLBACK_SECRET).update(`mpesa:${slug}`).digest('hex').slice(0, 40);
}

export function secretMatches(slug: string, presented: string): boolean {
  const expected = callbackSecretFor(slug);
  if (!expected) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(presented);
  return a.length === b.length && timingSafeEqual(a, b);
}
