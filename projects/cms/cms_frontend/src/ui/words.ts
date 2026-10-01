const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function below1000(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} hundred`);
    n %= 100;
    if (n) parts.push('and');
  }
  if (n >= 20) parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : ''));
  else if (n > 0) parts.push(ONES[n]);
  return parts.join(' ');
}

function wholeToWords(n: number): string {
  if (n === 0) return 'zero';
  const scales: Array<[number, string]> = [[1_000_000_000, 'billion'], [1_000_000, 'million'], [1000, 'thousand']];
  const parts: string[] = [];
  for (const [size, name] of scales) {
    if (n >= size) {
      parts.push(`${below1000(Math.floor(n / size))} ${name}`);
      n %= size;
    }
  }
  if (n > 0) parts.push(parts.length && n < 100 ? `and ${below1000(n)}` : below1000(n));
  return parts.join(' ');
}

/** "12500.50" -> "Twelve thousand, five hundred shillings and fifty cents only". Works from the decimal string, never a float. */
export function amountInWords(amount: string, currency = 'shillings', minor = 'cents'): string {
  const [whole, frac = ''] = amount.replace(/,/g, '').split('.');
  const cents = Number((frac + '00').slice(0, 2));
  const text = `${wholeToWords(Number(whole))} ${currency}${cents ? ` and ${wholeToWords(cents)} ${minor}` : ''} only`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}
