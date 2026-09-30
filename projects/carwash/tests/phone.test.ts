import { describe, expect, it } from 'vitest';
import { generatePin, normalisePhone } from '../src/admin/phone';

describe('phone numbers', () => {
  it.each([
    ['0712345678', '254712345678'],
    ['+254 712 345 678', '254712345678'],
    ['254712345678', '254712345678'],
    ['712345678', '254712345678'],
    ['0112345678', '254112345678']
  ])('normalises %s', (raw, expected) => {
    expect(normalisePhone(raw)).toBe(expected);
  });

  it('refuses numbers that are not Kenyan mobiles', () => {
    expect(() => normalisePhone('12345')).toThrow(/not a Kenyan mobile/);
    expect(() => normalisePhone('+44 7700 900123')).toThrow();
  });

  it('generates six-digit PINs that are not all the same', () => {
    const pins = new Set(Array.from({ length: 50 }, () => generatePin()));
    for (const pin of pins) expect(pin).toMatch(/^\d{6}$/);
    expect(pins.size).toBeGreaterThan(40);
  });
});
