/** GSM-7 basic set (plus the extension table, which costs two characters each). */
const GSM_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM_EXTENDED = '^{}\\[~]|€\f';

export interface SmsCount {
  characters: number;
  units: number;
  segments: number;
  encoding: 'GSM-7' | 'UCS-2';
  perSegment: number;
}

/** How many SMS parts a message will be billed as. Any non-GSM character forces UCS-2 (70 per part). */
export function smsSegments(text: string): SmsCount {
  let units = 0;
  let gsm = true;
  for (const ch of text) {
    if (GSM_BASIC.includes(ch)) units += 1;
    else if (GSM_EXTENDED.includes(ch)) units += 2;
    else {
      gsm = false;
      break;
    }
  }
  if (gsm) {
    const segments = units === 0 ? 0 : units <= 160 ? 1 : Math.ceil(units / 153);
    return { characters: [...text].length, units, segments, encoding: 'GSM-7', perSegment: segments > 1 ? 153 : 160 };
  }
  const ucs = text.length; // UTF-16 code units, which is what UCS-2 segmentation counts
  const segments = ucs === 0 ? 0 : ucs <= 70 ? 1 : Math.ceil(ucs / 67);
  return { characters: [...text].length, units: ucs, segments, encoding: 'UCS-2', perSegment: segments > 1 ? 67 : 70 };
}

/** Fills the same {{firstName}} / {{lastName}} placeholders the server substitutes, for the preview. */
export function renderPreview(template: string, sample: { firstName: string; lastName: string }): string {
  return template.replace(/\{\{\s*(firstName|lastName)\s*\}\}/g, (_m, key: 'firstName' | 'lastName') => sample[key]);
}
