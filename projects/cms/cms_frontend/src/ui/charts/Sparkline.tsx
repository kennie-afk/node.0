import { colorAt } from './palette';

interface Props {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  /** Spoken description, e.g. "Weekly giving, last 12 weeks". */
  label: string;
}

/** A tiny trend line for inside tiles and table rows. */
export function Sparkline({ values, width = 100, height = 24, color = colorAt(0), label }: Props) {
  if (values.length < 2) return <svg width={width} height={height} role="img" aria-label={`${label}: not enough data`} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 2;
  const points = values.map((v, i) => `${pad + (i * (width - pad * 2)) / (values.length - 1)},${height - pad - ((v - min) / span) * (height - pad * 2)}`);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label}: from ${values[0]} to ${values[values.length - 1]}`}>
      <title>{label}</title>
      <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
