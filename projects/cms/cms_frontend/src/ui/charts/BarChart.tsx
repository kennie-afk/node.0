import { useWidth } from './useWidth';
import { colorAt, compact, niceMax } from './palette';

interface Datum {
  label: string;
  value: number;
  color?: string;
}

interface Props {
  data: Datum[];
  height?: number;
  label: string;
  /** Formats the spoken and tooltip value, e.g. (n) => `KES ${n}`. */
  format?: (n: number) => string;
  color?: string;
}

/** Vertical bars with a labelled axis and gridlines. Each bar carries a <title> for hover and screen readers. */
export function BarChart({ data, height = 210, label, format = String, color = colorAt(0) }: Props) {
  const [ref, W] = useWidth();
  const left = 48;
  const bottom = 28;
  const top = 10;
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const plotH = height - bottom - top;
  const slot = (W - left) / Math.max(data.length, 1);
  const bar = Math.min(slot * 0.62, 44);
  const ticks = [0, 0.5, 1];
  return (
    <div ref={ref}>
    <svg className="ui-chart" width={W} height={height} viewBox={`0 0 ${W} ${height}`} role="img" aria-label={`${label}. ${data.map((d) => `${d.label} ${format(d.value)}`).join(', ')}`}>
      <title>{label}</title>
      {ticks.map((t) => {
        const y = top + plotH - t * plotH;
        return (
          <g key={t}>
            <line className="grid" x1={left} x2={W} y1={y} y2={y} />
            <text x={left - 8} y={y + 4} textAnchor="end">
              {compact(max * t)}
            </text>
          </g>
        );
      })}
      {data.map((d, i) => {
        const h = (d.value / max) * plotH;
        const x = left + i * slot + (slot - bar) / 2;
        return (
          <g key={`${d.label}-${i}`}>
            <rect x={x} y={top + plotH - h} width={bar} height={Math.max(h, 0)} rx={3} fill={d.color ?? color}>
              <title>{`${d.label}: ${format(d.value)}`}</title>
            </rect>
            <text x={x + bar / 2} y={height - 6} textAnchor="middle">
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
    </div>
  );
}
