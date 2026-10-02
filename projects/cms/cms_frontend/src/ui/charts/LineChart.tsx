import { useWidth } from './useWidth';
import { colorAt, compact, niceMax } from './palette';

interface Series {
  name: string;
  values: number[];
  color?: string;
}

interface Props {
  labels: string[];
  series: Series[];
  height?: number;
  /** Fill the area under each line. */
  area?: boolean;
  label: string;
  format?: (n: number) => string;
}

/** Line (or area) chart for trends; several series share one axis and a legend. */
export function LineChart({ labels, series, height = 220, area, label, format = String }: Props) {
  const [ref, W] = useWidth();
  const left = 48;
  const bottom = 28;
  const top = 10;
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values)));
  const plotH = height - bottom - top;
  const n = Math.max(labels.length, 2);
  const x = (i: number) => left + (i * (W - left - 4)) / (n - 1);
  const y = (v: number) => top + plotH - (v / max) * plotH;
  const every = Math.ceil(labels.length / Math.max(2, Math.floor((W - left) / 64)));
  return (
    <div ref={ref}>
      <svg className="ui-chart" width={W} height={height} viewBox={`0 0 ${W} ${height}`} role="img" aria-label={`${label}. ${series.map((s) => `${s.name}: ${s.values.map((v, i) => `${labels[i]} ${format(v)}`).join(', ')}`).join('. ')}`}>
        <title>{label}</title>
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line className="grid" x1={left} x2={W} y1={top + plotH - t * plotH} y2={top + plotH - t * plotH} />
            <text x={left - 8} y={top + plotH - t * plotH + 4} textAnchor="end">
              {compact(max * t)}
            </text>
          </g>
        ))}
        {labels.map((l, i) =>
          i % every === 0 ? (
            <text key={`${l}-${i}`} x={x(i)} y={height - 6} textAnchor="middle">
              {l}
            </text>
          ) : null
        )}
        {series.map((s, si) => {
          const color = s.color ?? colorAt(si);
          const pts = s.values.map((v, i) => `${x(i)},${y(v)}`);
          return (
            <g key={s.name}>
              {area && s.values.length > 1 && <polygon points={`${x(0)},${top + plotH} ${pts.join(' ')} ${x(s.values.length - 1)},${top + plotH}`} fill={color} opacity={0.14} />}
              <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
              {s.values.map((v, i) => (
                <circle key={i} cx={x(i)} cy={y(v)} r={3.2} fill={color}>
                  <title>{`${s.name}, ${labels[i]}: ${format(v)}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      {series.length > 1 && (
        <div className="ui-legend">
          {series.map((s, si) => (
            <span key={s.name}>
              <i style={{ background: s.color ?? colorAt(si) }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
