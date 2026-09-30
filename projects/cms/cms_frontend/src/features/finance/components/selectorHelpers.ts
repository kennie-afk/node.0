import type { ComboOption } from '../../../ui';
import { getMember, type MemberRef } from '../../../api/givingApi';

export const memberName = (m: Pick<MemberRef, 'firstName' | 'lastName'>) => `${m.firstName} ${m.lastName}`;


/** Resolves a member id from the URL into a picker option. */
export async function memberOption(id: number): Promise<ComboOption<number>> {
  const member = await getMember(id);
  return { value: member.id, label: memberName(member), meta: member.phoneNumber ?? undefined };
}
