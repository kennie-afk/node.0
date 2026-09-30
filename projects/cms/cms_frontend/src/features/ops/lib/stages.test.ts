import { describe, expect, it } from 'vitest';
import { conversionPercent, nextStage, STAGE_ORDER } from './stages';

describe('visitor stages', () => {
  it('walks the pipeline in order and stops at the ends', () => {
    expect(nextStage('NEW')).toBe('CONTACTED');
    expect(nextStage('CLASS')).toBe('JOINED');
    expect(nextStage('JOINED')).toBeNull();
    expect(nextStage('LOST')).toBeNull();
    expect(STAGE_ORDER).toHaveLength(6);
  });
  it('formats the conversion fraction', () => {
    expect(conversionPercent(0)).toBe('0%');
    expect(conversionPercent(0.3333)).toBe('33.3%');
  });
});
