import { http, type KeysetPage } from '../../../api/http';
import type { OutboxMessage } from '../../../api/commsApi';

/** How many messages failed, cheaply: one page of failures, capped at 100 and reported as such. */
export async function listOutboxFailed(): Promise<number> {
  const page = await http.get<KeysetPage<OutboxMessage>>('/comms/outbox', { status: 'FAILED', limit: 100 });
  return page.data.length;
}
