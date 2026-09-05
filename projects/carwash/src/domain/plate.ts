const CONFUSABLE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['O', '0'],
  ['I', '1'],
  ['L', '1'],
  ['S', '5'],
  ['B', '8'],
  ['Z', '2'],
  ['G', '6'],
  ['Q', '0']
];

const CONFUSABLE = new Set(
  CONFUSABLE_PAIRS.flatMap(([left, right]) => [`${left}${right}`, `${right}${left}`])
);

const SUBSTITUTION_COST = 1;
const CONFUSABLE_COST = 0.4;
const MATCH_THRESHOLD = 1;

export function normalisePlate(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function substitutionCost(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return CONFUSABLE.has(`${left}${right}`) ? CONFUSABLE_COST : SUBSTITUTION_COST;
}

export function plateDistance(left: string, right: string): number {
  const a = normalisePlate(left);
  const b = normalisePlate(right);
  if (a === b) {
    return 0;
  }

  const rows = a.length + 1;
  const columns = b.length + 1;
  const grid: number[][] = Array.from({ length: rows }, () => new Array<number>(columns).fill(0));

  for (let row = 0; row < rows; row += 1) {
    grid[row]![0] = row;
  }
  for (let column = 0; column < columns; column += 1) {
    grid[0]![column] = column;
  }

  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      grid[row]![column] = Math.min(
        grid[row - 1]![column]! + 1,
        grid[row]![column - 1]! + 1,
        grid[row - 1]![column - 1]! + substitutionCost(a[row - 1]!, b[column - 1]!)
      );
    }
  }

  return Math.round(grid[rows - 1]![columns - 1]! * 100) / 100;
}

export function platesMatch(left: string, right: string): boolean {
  return plateDistance(left, right) <= MATCH_THRESHOLD;
}

export function plateLooksLikeKenyanFormat(raw: string): boolean {
  return /^K[A-Z]{2}[0-9]{3}[A-Z]$/.test(normalisePlate(raw));
}
