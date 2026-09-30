/**
 * STK push ("lipa na M-Pesa online") providers. The mock never contacts anything and moves no
 * money. The Daraja provider talks to Safaricom only when MPESA_MODE=daraja, through an injected
 * HTTP client so its request building and token handling are testable without a network.
 */
import { randomUUID } from 'node:crypto';
import { env } from '../../config/env';
import { DarajaConfig, darajaConfig } from './config';

export interface StkRequest {
  phone: string;
  amountMinor: number;
  accountRef: string;
  description: string;
  callbackUrl: string;
}

export interface StkResponse {
  checkoutRequestId: string;
  merchantRequestId: string;
  customerMessage: string;
}

export interface StkProvider {
  readonly name: 'mock' | 'daraja';
  initiate(request: StkRequest): Promise<StkResponse>;
}

export class MockStkProvider implements StkProvider {
  readonly name = 'mock' as const;
  async initiate(_request: StkRequest): Promise<StkResponse> {
    const id = randomUUID().replace(/-/g, '').slice(0, 16);
    return {
      checkoutRequestId: `ws_CO_MOCK_${id}`,
      merchantRequestId: `MOCK-${id.slice(0, 8)}`,
      customerMessage: 'Mock STK push created. No prompt was sent and no money will move.'
    };
  }
}

export interface HttpResponse {
  status: number;
  json: unknown;
}
export type HttpClient = (method: 'GET' | 'POST', url: string, headers: Record<string, string>, body?: unknown) => Promise<HttpResponse>;

export const fetchClient: HttpClient = async (method, url, headers, body) => {
  const response = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await response.json().catch(() => ({}));
  return { status: response.status, json };
};

export class DarajaStkProvider implements StkProvider {
  readonly name = 'daraja' as const;
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly http: HttpClient = fetchClient,
    private readonly config: DarajaConfig = darajaConfig(),
    private readonly now: () => number = Date.now
  ) {}

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > this.now() + 30_000) return this.token.value;
    const basic = Buffer.from(`${this.config.consumerKey}:${this.config.consumerSecret}`).toString('base64');
    const response = await this.http('GET', `${this.config.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, { Authorization: `Basic ${basic}` });
    const body = response.json as { access_token?: string; expires_in?: string | number };
    if (response.status !== 200 || !body.access_token) {
      throw new Error(`Daraja token request failed with status ${response.status}`);
    }
    this.token = { value: body.access_token, expiresAt: this.now() + Number(body.expires_in ?? 3599) * 1000 };
    return body.access_token;
  }

  /** Daraja wants yyyyMMddHHmmss in East Africa Time. */
  static timestamp(at: number): string {
    const eat = new Date(at + 3 * 3600 * 1000);
    return eat.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  }

  async initiate(request: StkRequest): Promise<StkResponse> {
    const token = await this.accessToken();
    const timestamp = DarajaStkProvider.timestamp(this.now());
    const password = Buffer.from(`${this.config.shortcode}${this.config.passkey}${timestamp}`).toString('base64');
    const amount = Math.ceil(request.amountMinor / 100); // STK takes whole shillings
    const response = await this.http(
      'POST',
      `${this.config.baseUrl}/mpesa/stkpush/v1/processrequest`,
      { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      {
        BusinessShortCode: this.config.shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: amount,
        PartyA: request.phone,
        PartyB: this.config.shortcode,
        PhoneNumber: request.phone,
        CallBackURL: request.callbackUrl,
        AccountReference: request.accountRef.slice(0, 12),
        TransactionDesc: request.description.slice(0, 13)
      }
    );
    const body = response.json as { ResponseCode?: string; CheckoutRequestID?: string; MerchantRequestID?: string; CustomerMessage?: string; errorMessage?: string };
    if (response.status !== 200 || body.ResponseCode !== '0' || !body.CheckoutRequestID) {
      throw new Error(`Daraja STK push rejected: ${body.errorMessage ?? `status ${response.status}`}`);
    }
    return {
      checkoutRequestId: body.CheckoutRequestID,
      merchantRequestId: body.MerchantRequestID ?? '',
      customerMessage: body.CustomerMessage ?? ''
    };
  }
}

let active: StkProvider | null = null;

export function stkProvider(): StkProvider {
  if (!active) active = env.MPESA_MODE === 'daraja' ? new DarajaStkProvider() : new MockStkProvider();
  return active;
}

/** Tests inject a provider here; production never calls it. */
export function setStkProviderForTests(provider: StkProvider | null): void {
  active = provider;
}
