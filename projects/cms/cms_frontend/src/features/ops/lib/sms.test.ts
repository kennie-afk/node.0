import { describe, expect, it } from 'vitest';
import { renderPreview, smsSegments } from './sms';

describe('smsSegments', () => {
  it('counts a short GSM message as one part', () => {
    expect(smsSegments('Hello Amina, see you Sunday').segments).toBe(1);
  });
  it('switches to 153 per part past 160', () => {
    const r = smsSegments('a'.repeat(161));
    expect(r).toMatchObject({ segments: 2, perSegment: 153, encoding: 'GSM-7' });
    expect(smsSegments('a'.repeat(306)).segments).toBe(2);
    expect(smsSegments('a'.repeat(307)).segments).toBe(3);
  });
  it('charges extension characters twice', () => {
    expect(smsSegments('€'.repeat(80)).units).toBe(160);
    expect(smsSegments('€'.repeat(81)).segments).toBe(2);
  });
  it('drops to UCS-2 (70 per part) for any non-GSM character', () => {
    expect(smsSegments('Karibu 🙏')).toMatchObject({ encoding: 'UCS-2', segments: 1 });
    expect(smsSegments('🙏'.repeat(36)).segments).toBe(2);
  });
  it('is zero parts for an empty message', () => {
    expect(smsSegments('').segments).toBe(0);
  });
  it('renders placeholders like the server', () => {
    expect(renderPreview('Hi {{firstName}} {{ lastName }}!', { firstName: 'Amina', lastName: 'Wanjiru' })).toBe('Hi Amina Wanjiru!');
  });
});
