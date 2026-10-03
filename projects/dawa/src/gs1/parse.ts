/**
 * Parser for what a pharmacy scanner produces: a GS1 element string (the content of a GS1 DataMatrix, as
 * printed on packs that carry a unique identifier) or a plain retail barcode (EAN-8, UPC-A, EAN-13, GTIN-14).
 *
 * Source: the public GS1 General Specifications (application identifiers, the GS1 check digit, the rule that a
 * date with day 00 means the last day of the month). Only the identifiers a medicine pack realistically carries
 * are known to the parser; anything else is refused loudly rather than guessed at.
 *
 * A keyboard-wedge scanner sends the FNC1 separator that ends a variable-length field as the control character
 * GS (0x1D), which many text inputs silently swallow. Three spellings are therefore accepted as the separator:
 * the real control character, the text "<GS>", and "|" (a character GS1 data can never contain). If a scanner
 * drops it entirely, two variable-length fields in a row cannot be told apart and the parser says so instead of
 * returning a wrong batch number.
 */

export class Gs1Error extends Error {}

interface AiSpec {
  /** fixed length of the data, or null for variable */
  fixed: number | null;
  max: number;
  /** the GS1 character set the data may use */
  kind: 'numeric' | 'alnum';
}

const AIS: Record<string, AiSpec> = {
  '00': { fixed: 18, max: 18, kind: 'numeric' }, // SSCC
  '01': { fixed: 14, max: 14, kind: 'numeric' }, // GTIN
  '02': { fixed: 14, max: 14, kind: 'numeric' }, // GTIN of contained items
  '10': { fixed: null, max: 20, kind: 'alnum' }, // batch or lot number
  '11': { fixed: 6, max: 6, kind: 'numeric' }, // production date
  '12': { fixed: 6, max: 6, kind: 'numeric' }, // due date
  '13': { fixed: 6, max: 6, kind: 'numeric' }, // packaging date
  '15': { fixed: 6, max: 6, kind: 'numeric' }, // best before date
  '16': { fixed: 6, max: 6, kind: 'numeric' }, // sell by date
  '17': { fixed: 6, max: 6, kind: 'numeric' }, // expiration date
  '20': { fixed: 2, max: 2, kind: 'numeric' }, // internal variant
  '21': { fixed: null, max: 20, kind: 'alnum' }, // serial number
  '22': { fixed: null, max: 20, kind: 'alnum' }, // consumer product variant
  '30': { fixed: null, max: 8, kind: 'numeric' }, // variable count
  '37': { fixed: null, max: 8, kind: 'numeric' }, // count of contained items
  '240': { fixed: null, max: 30, kind: 'alnum' }, // additional product identification
  '241': { fixed: null, max: 30, kind: 'alnum' }, // customer part number
  '710': { fixed: null, max: 20, kind: 'alnum' }, // national healthcare reimbursement number
  '711': { fixed: null, max: 20, kind: 'alnum' },
  '712': { fixed: null, max: 20, kind: 'alnum' },
  '713': { fixed: null, max: 20, kind: 'alnum' },
  '714': { fixed: null, max: 20, kind: 'alnum' }
};

// GS1 character set 82: digits, upper and lower case letters and ! " % & ' ( ) * + , - . / : ; < = > ? _
const SET82 = /^[0-9A-Za-z!"%&'()*+,\-./:;<=>?_]+$/;
const SEPARATORS = ['\u001d', '<GS>', '|'];

export interface GsElement {
  ai: string;
  value: string;
}

export interface Scan {
  /** 'gs1' for an element string, 'retail' for a plain EAN/UPC/GTIN barcode */
  format: 'gs1' | 'retail';
  gtin: string | null;
  batchNo: string | null;
  /** ISO date (yyyy-mm-dd) */
  expiryDate: string | null;
  serial: string | null;
  elements: GsElement[];
}

/** GS1 mod-10 check digit over everything but the last digit. */
export function gs1CheckDigit(body: string): number {
  let sum = 0;
  for (let i = body.length - 1, weight = 3; i >= 0; i -= 1, weight = weight === 3 ? 1 : 3) {
    sum += Number(body[i]) * weight;
  }
  return (10 - (sum % 10)) % 10;
}

/** Validates a GTIN-8/12/13/14 and returns it left-padded to 14 digits. */
export function normaliseGtin(raw: string): string {
  const digits = raw.trim();
  if (!/^\d+$/.test(digits) || ![8, 12, 13, 14].includes(digits.length)) {
    throw new Gs1Error(`"${raw}" is not a GTIN: it must be 8, 12, 13 or 14 digits`);
  }
  const padded = digits.padStart(14, '0');
  if (gs1CheckDigit(padded.slice(0, 13)) !== Number(padded[13])) {
    throw new Gs1Error(`"${raw}" has a wrong check digit, so it was misread or mistyped`);
  }
  return padded;
}

/** YYMMDD to an ISO date. Day 00 means the last day of that month (GS1 rule). The century is 2000. */
export function gs1Date(yymmdd: string): string {
  if (!/^\d{6}$/.test(yymmdd)) throw new Gs1Error(`"${yymmdd}" is not a YYMMDD date`);
  const year = 2000 + Number(yymmdd.slice(0, 2));
  const month = Number(yymmdd.slice(2, 4));
  let day = Number(yymmdd.slice(4, 6));
  if (month < 1 || month > 12) throw new Gs1Error(`"${yymmdd}" has an impossible month`);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day === 0) day = lastDay;
  if (day > lastDay) throw new Gs1Error(`"${yymmdd}" has an impossible day`);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function specFor(text: string, at: number): { ai: string; spec: AiSpec } | null {
  for (const length of [4, 3, 2]) {
    const ai = text.slice(at, at + length);
    const spec = AIS[ai];
    if (spec && ai.length === length) return { ai, spec };
  }
  return null;
}

function stripSymbologyIdentifier(text: string): string {
  // ]d2 = GS1 DataMatrix, ]C1 = GS1-128, ]Q3 = GS1 QR, ]e0 = GS1 DataBar
  return text.replace(/^\](d2|C1|Q3|e0)/, '');
}

function parseBracketed(text: string): GsElement[] {
  const elements: GsElement[] = [];
  const pattern = /\((\d{2,4})\)([^(]*)/g;
  let consumed = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index !== consumed) throw new Gs1Error('unexpected text between application identifiers');
    consumed = match.index + match[0].length;
    elements.push({ ai: match[1]!, value: match[2]! });
  }
  if (consumed !== text.length || elements.length === 0) throw new Gs1Error('could not read the application identifiers');
  return elements;
}

function parseRaw(text: string): GsElement[] {
  let normalised = text;
  for (const separator of SEPARATORS) normalised = normalised.split(separator).join('\u001d');

  const elements: GsElement[] = [];
  let at = 0;
  while (at < normalised.length) {
    if (normalised[at] === '\u001d') {
      at += 1;
      continue;
    }
    const found = specFor(normalised, at);
    if (!found) throw new Gs1Error(`unknown application identifier at "${normalised.slice(at, at + 4)}"`);
    const { ai, spec } = found;
    at += ai.length;

    if (spec.fixed !== null) {
      const value = normalised.slice(at, at + spec.fixed);
      if (value.length < spec.fixed) throw new Gs1Error(`(${ai}) is cut short`);
      elements.push({ ai, value });
      at += spec.fixed;
      continue;
    }

    const end = normalised.indexOf('\u001d', at);
    let value: string;
    if (end === -1) {
      value = normalised.slice(at);
      at = normalised.length;
    } else {
      value = normalised.slice(at, end);
      at = end + 1;
    }
    if (value.length > spec.max) {
      throw new Gs1Error(
        `(${ai}) is longer than the ${spec.max} characters GS1 allows. Either the scanner dropped the separator between ` +
          `two fields (set it to send GS as "|") or the code is damaged`
      );
    }
    elements.push({ ai, value });
  }
  return elements;
}

function validate(elements: GsElement[]): void {
  const seen = new Set<string>();
  for (const { ai, value } of elements) {
    const spec = AIS[ai];
    if (!spec) throw new Gs1Error(`unknown application identifier (${ai})`);
    if (seen.has(ai)) throw new Gs1Error(`(${ai}) appears twice`);
    seen.add(ai);
    if (value.length === 0) throw new Gs1Error(`(${ai}) is empty`);
    if (spec.fixed !== null && value.length !== spec.fixed) throw new Gs1Error(`(${ai}) must be ${spec.fixed} characters`);
    if (value.length > spec.max) throw new Gs1Error(`(${ai}) is longer than ${spec.max} characters`);
    if (spec.kind === 'numeric' ? !/^\d+$/.test(value) : !SET82.test(value)) {
      throw new Gs1Error(`(${ai}) contains characters GS1 does not allow there`);
    }
  }
}

/** Reads one scan. Throws Gs1Error with a message a pharmacist can act on. */
export function parseScan(input: string): Scan {
  const text = stripSymbologyIdentifier(input.replace(/[\r\n]+$/g, '')).trim();
  if (text === '') throw new Gs1Error('nothing was scanned');

  if (/^\d{8,14}$/.test(text) && text.length !== 18) {
    return { format: 'retail', gtin: normaliseGtin(text), batchNo: null, expiryDate: null, serial: null, elements: [] };
  }

  const elements = text.includes('(') && /^\(\d/.test(text) ? parseBracketed(text) : parseRaw(text);
  validate(elements);

  const get = (ai: string) => elements.find((element) => element.ai === ai)?.value ?? null;
  const gtinRaw = get('01');
  const expiryRaw = get('17');
  return {
    format: 'gs1',
    gtin: gtinRaw === null ? null : normaliseGtin(gtinRaw),
    batchNo: get('10'),
    expiryDate: expiryRaw === null ? null : gs1Date(expiryRaw),
    serial: get('21'),
    elements
  };
}
