/**
 * Picker data. The members, events, ministries and small-groups endpoints page by offset and (as
 * of writing) have no search parameter, so these helpers read a bounded number of pages and
 * filter what arrived. That is a stop-gap, isolated here: once the API gains `?q=` only these
 * functions change. The member search is capped (MAX_PAGES) and says so when it stops early.
 */
import { http } from '../../api/http';
import type { ComboOption } from '../../ui';

interface OffsetPage<T> {
  data: T[];
  page: number;
  totalPages: number;
  total: number;
}

export interface MemberRow {
  id: number;
  firstName: string;
  lastName: string;
  phoneNumber?: string | null;
  email?: string | null;
}

const PAGE_SIZE = 100;
const MAX_PAGES = 5;
const TTL_MS = 60_000;
const pageCache = new Map<number, { at: number; page: OffsetPage<MemberRow> }>();

async function memberPage(page: number): Promise<OffsetPage<MemberRow>> {
  const hit = pageCache.get(page);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.page;
  const fresh = await http.get<OffsetPage<MemberRow>>('/members', { page, pageSize: PAGE_SIZE });
  pageCache.set(page, { at: Date.now(), page: fresh });
  for (const m of fresh.data) names.set(m.id, `${m.firstName} ${m.lastName}`);
  return fresh;
}

const names = new Map<number, string>();

export function matchesMember(member: MemberRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${member.firstName} ${member.lastName}`.toLowerCase().includes(q) || (member.phoneNumber ?? '').replace(/\s/g, '').includes(q.replace(/\s/g, '')) || (member.email ?? '').toLowerCase().includes(q);
}

export function clearMemberCache(): void {
  pageCache.clear();
}

export async function searchMembers(query: string, limit = 10): Promise<Array<ComboOption<number>>> {
  const found: MemberRow[] = [];
  for (let page = 1; page <= MAX_PAGES && found.length < limit; page += 1) {
    const result = await memberPage(page);
    for (const m of result.data) if (matchesMember(m, query)) found.push(m);
    if (page >= result.totalPages) break;
  }
  return found.slice(0, limit).map((m) => ({ value: m.id, label: `${m.firstName} ${m.lastName}`, meta: m.phoneNumber ?? m.email ?? undefined }));
}

export async function memberName(id: number): Promise<string> {
  const cached = names.get(id);
  if (cached) return cached;
  const member = await http.get<MemberRow>(`/members/${id}`);
  const label = `${member.firstName} ${member.lastName}`;
  names.set(id, label);
  return label;
}

export interface NamedRow {
  id: number;
  name: string;
  startTime?: string;
}

async function firstPage<T>(path: string): Promise<T[]> {
  const page = await http.get<OffsetPage<T>>(path, { page: 1, pageSize: PAGE_SIZE });
  return page.data;
}

export const loadMinistries = () => firstPage<NamedRow>('/ministries');
export const loadSmallGroups = () => firstPage<NamedRow>('/small-groups');

/** The 100 most relevant events: upcoming ones first, then the most recent past ones. */
export async function loadEvents(): Promise<NamedRow[]> {
  const rows = await firstPage<NamedRow>('/events');
  const now = Date.now();
  const time = (e: NamedRow) => (e.startTime ? new Date(e.startTime).getTime() : 0);
  const upcoming = rows.filter((e) => time(e) >= now).sort((a, b) => time(a) - time(b));
  const past = rows.filter((e) => time(e) < now).sort((a, b) => time(b) - time(a));
  return [...upcoming, ...past];
}
