import type { ReactNode } from 'react';
import { colorAt } from './palette';

interface Slice {
  label: string;
  value: number;
  color?: string;
}

interface Props {
  slices: Slice[];
  size?: number;
  label: string;
  /** Shown in the hole, e.g. the total. */
  center?: ReactNode;
  format?: (n: number) => string;
}

/** Share-of-total ring with a legend that carries the numbers, so colour is never the only signal. */
export function Donut({ slices, size = 120, label, center, format = String }: Props) {
  const total = slices.reduce((s, x) => s + Math.max(x.value, 0), 0);
  const r = size / 2 - 8;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label}. ${slices.map((s) => `${s.label} ${format(s.value)}`).join(', ')}`}>
        <title>{label}</title>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ui-border)" strokeWidth={12} />
        {total > 0 &&
          slices.map((s, i) => {
            const len = (Math.max(s.value, 0) / total) * c;
            const el = (
              <circle
                key={`${s.label}-${i}`}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color ?? colorAt(i)}
                strokeWidth={12}
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              >
                <title>{`${s.label}: ${format(s.value)}`}</title>
              </circle>
            );
            offset += len;
            return el;
          })}
        {center && (
          <foreignObject x={size / 2 - 30} y={size / 2 - 12} width={60} height={24}>
            <div style={{ textAlign: 'center', fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--ui-text)', lineHeight: '24px' }}>{center}</div>
          </foreignObject>
        )}
      </svg>
      <ul className="ui-legend" style={{ flexDirection: 'column', listStyle: 'none', margin: 0, padding: 0 }}>
        {slices.map((s, i) => (
          <li key={`${s.label}-${i}`}>
            <i style={{ background: s.color ?? colorAt(i) }} />
            {s.label} <span className="ui-num" style={{ color: 'var(--ui-muted)' }}>{format(s.value)}{total > 0 ? ` (${Math.round((s.value / total) * 100)}%)` : ''}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
