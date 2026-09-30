import { describe, expect, it } from 'vitest';
import type { ImportResult } from '../../../api/dataopsApi';
import { canApply, errorsByRow, summarise } from './importing';

const base: ImportResult = { id: null, status: 'DRY_RUN', replayed: false, totalRows: 3, createdCount: 1, updatedCount: 0, skippedCount: 1, errorCount: 0, errors: [] };

describe('import wizard rules', () => {
  it('groups errors by row in row order', () => {
    const grouped = errorsByRow([
      { row: 5, field: 'email', message: 'bad' },
      { row: 3, field: 'lastName', message: 'required' },
      { row: 5, field: 'phone', message: 'short' }
    ]);
    expect(grouped).toEqual([
      { row: 3, problems: ['lastName: required'] },
      { row: 5, problems: ['email: bad', 'phone: short'] }
    ]);
  });
  it('offers Apply only when it would write something and errors are acceptable', () => {
    expect(canApply(base, false)).toBe(true);
    expect(canApply({ ...base, errorCount: 2 }, false)).toBe(false);
    expect(canApply({ ...base, errorCount: 2 }, true)).toBe(true);
    expect(canApply({ ...base, createdCount: 0 }, true)).toBe(false);
    expect(canApply({ ...base, status: 'APPLIED' }, true)).toBe(false);
  });
  it('summarises in plain words', () => {
    expect(summarise({ ...base, errorCount: 1 })).toBe('3 rows: 1 new, 0 updated, 1 skipped, 1 error');
  });
});
