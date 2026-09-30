import { describe, expect, it } from 'vitest';
import { buildDefinition, describeSegment, parseStatuses } from './segments';

const blank = { type: 'ALL' as const, ministryId: '' as const, smallGroupId: '' as const, gender: '' as const, city: '', county: '', statuses: '' };

describe('audience definitions', () => {
  it('drops empty status text', () => {
    expect(parseStatuses(' , ')).toBeUndefined();
    expect(parseStatuses('Active, Inactive')).toEqual(['Active', 'Inactive']);
  });
  it('requires a target for ministry and small-group audiences', () => {
    expect(buildDefinition({ ...blank, type: 'MINISTRY' })).toBeNull();
    expect(buildDefinition({ ...blank, type: 'MINISTRY', ministryId: 4 })).toEqual({ type: 'MINISTRY', ministryId: 4, statuses: undefined });
    expect(buildDefinition({ ...blank, type: 'SMALL_GROUP' })).toBeNull();
  });
  it('builds filters with only what was filled in', () => {
    expect(buildDefinition({ ...blank, type: 'FILTER', gender: 'Female', city: ' Nairobi ' })).toEqual({ type: 'FILTER', statuses: undefined, gender: 'Female', city: 'Nairobi', county: undefined });
  });
  it('describes each kind in plain words', () => {
    expect(describeSegment({ type: 'ALL' })).toBe('Every member');
    expect(describeSegment({ type: 'MINISTRY', ministryId: 2 }, { ministry: 'Worship' })).toBe('Ministry: Worship');
    expect(describeSegment({ type: 'FILTER', city: 'Nairobi', statuses: ['Active'] })).toBe('Members where city Nairobi (status: Active)');
  });
});
