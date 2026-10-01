import type { ComboOption } from '../ui';
import { http } from './http';
import type { PageOf } from '../features/resource/types';

/** Member picker search: asks the server for a handful of matches, never the whole directory. */
export const searchMembers = async (q: string): Promise<Array<ComboOption<number>>> =>
  (await http.get<PageOf<{ id: number; firstName: string; lastName: string; email?: string | null }>>('/members', { q: q || undefined, pageSize: 10 })).data.map((m) => ({
    value: m.id,
    label: `${m.firstName} ${m.lastName}`,
    meta: m.email ?? undefined
  }));

/** A person as the form's lookup field wants to start with, from the row's embedded leader. */
export const leaderOption = (id: number | null | undefined, leader?: { firstName: string; lastName: string } | null) =>
  id ? { value: id, label: leader ? `${leader.firstName} ${leader.lastName}` : `Member ${id}` } : null;
