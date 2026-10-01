/** Categorical colours, chosen to stay distinct on the dark surface. Sequence matters: first is the brand accent. */
export const CHART_COLORS = ['var(--c-accent)', 'var(--c-info)', '#f472b6', 'var(--c-warn)', 'var(--c-ok)', 'var(--c-bad)', '#60a5fa', '#2dd4bf'] as const;

export const colorAt = (index: number): string => CHART_COLORS[index % CHART_COLORS.length];

/** Nice round upper bound for an axis so gridlines land on tidy numbers. */
export function niceMax(max: number): number {
  if (max <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(max)));
  const f = max / exp;
  const step = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return step * exp;
}

/** Compact axis label: 1.2M, 340k. Display only; never feed it back into arithmetic. */
export function compact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${+(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}
