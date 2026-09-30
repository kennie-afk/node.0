import type { SegmentDefinition } from '../../../api/commsApi';

export function describeSegment(def: SegmentDefinition, names: { ministry?: string; smallGroup?: string } = {}): string {
  const statuses = def.statuses && def.statuses.length > 0 ? ` (status: ${def.statuses.join(', ')})` : '';
  switch (def.type) {
    case 'ALL':
      return `Every member${statuses}`;
    case 'MINISTRY':
      return `Ministry: ${names.ministry ?? `#${def.ministryId}`}${statuses}`;
    case 'SMALL_GROUP':
      return `Small group: ${names.smallGroup ?? `#${def.smallGroupId}`}${statuses}`;
    case 'FILTER': {
      const parts = [def.gender && `gender ${def.gender}`, def.city && `city ${def.city}`, def.county && `county ${def.county}`].filter(Boolean);
      return `Members where ${parts.length > 0 ? parts.join(', ') : 'any'}${statuses}`;
    }
  }
}

/** Comma-separated status text to the array the API expects (empty -> undefined so the filter is absent). */
export function parseStatuses(text: string): string[] | undefined {
  const list = text.split(',').map((s) => s.trim()).filter(Boolean);
  return list.length > 0 ? list : undefined;
}

export function buildDefinition(form: {
  type: SegmentDefinition['type'];
  ministryId: number | '';
  smallGroupId: number | '';
  gender: '' | 'Male' | 'Female' | 'Other';
  city: string;
  county: string;
  statuses: string;
}): SegmentDefinition | null {
  const statuses = parseStatuses(form.statuses);
  switch (form.type) {
    case 'ALL':
      return { type: 'ALL', statuses };
    case 'MINISTRY':
      return form.ministryId === '' ? null : { type: 'MINISTRY', ministryId: form.ministryId, statuses };
    case 'SMALL_GROUP':
      return form.smallGroupId === '' ? null : { type: 'SMALL_GROUP', smallGroupId: form.smallGroupId, statuses };
    case 'FILTER':
      return { type: 'FILTER', statuses, gender: form.gender || undefined, city: form.city.trim() || undefined, county: form.county.trim() || undefined };
  }
}
