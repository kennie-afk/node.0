import type { Consent, ConsentChannel, ConsentPurpose } from '../../../api/dataopsApi';

export const PURPOSE_LABEL: Record<ConsentPurpose, string> = {
  COMMUNICATIONS: 'Messages from the church (SMS and email)',
  DATA_PROCESSING: 'Keeping my details on the church records',
  PHOTOS: 'Photographs of me or my children',
  GIVING_RECORDS: 'Keeping records of my giving',
  CHILD_CHECKIN: 'Children check-in and safety records'
};

export const CHANNEL_LABEL: Record<ConsentChannel, string> = { ANY: 'Any way', SMS: 'SMS', EMAIL: 'Email' };

/** The most recent record for each purpose+channel, which is the person's current choice. */
export function latestConsents(records: Consent[]): Map<string, Consent> {
  const latest = new Map<string, Consent>();
  for (const r of records) {
    const key = `${r.purpose}:${r.channel}`;
    const current = latest.get(key);
    if (!current || new Date(r.recordedAt).getTime() > new Date(current.recordedAt).getTime() || (r.recordedAt === current.recordedAt && r.id > current.id)) {
      latest.set(key, r);
    }
  }
  return latest;
}

export function consentKey(purpose: ConsentPurpose, channel: ConsentChannel): string {
  return `${purpose}:${channel}`;
}
