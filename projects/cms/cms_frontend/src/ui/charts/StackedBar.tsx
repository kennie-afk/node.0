import { colorAt } from './palette';

interface Segment {
  name: string;
  value: number;
  color?: string;
}

interface Row {
  label: string;
  segments: Segment[];
}

interface Props {
  rows: Row[];
  label: string;
  format?: (n: number) => string;
}

/** Horizontal stacked bars, one row per category (e.g. income by fund split by giving type). Bars share one scale. */
export function StackedBar({ rows, label, format = String }: Props) {
  const max = Math.max(1, ...rows.map((r) => r.segments.reduce((s, x) => s + Math.max(x.value, 0), 0)));
  const names = [...new Set(rows.flatMap((r) => r.segments.map((s) => s.name)))];
  return (
    <div role="img" aria-label={`${label}. ${rows.map((r) => `${r.label}: ${r.segments.map((s) => `${s.name} ${format(s.value)}`).join(', ')}`).join('. ')}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map((row) => {
          const total = row.segments.reduce((s, x) => s + Math.max(x.value, 0), 0);
          return (
            <div key={row.label} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 80px', gap: 8, alignItems: 'center', fontSize: 'var(--fs-xs)' }}>
              <span style={{ color: 'var(--ui-text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.label}</span>
              <div style={{ display: 'flex', height: 12, background: 'var(--ui-raised)', borderRadius: 3, overflow: 'hidden' }} aria-hidden="true">
                {row.segments.map((s) => (
                  <div key={s.name} style={{ width: `${(Math.max(s.value, 0) / max) * 100}%`, background: s.color ?? colorAt(names.indexOf(s.name)) }} title={`${s.name}: ${format(s.value)}`} />
                ))}
              </div>
              <span className="ui-num" style={{ textAlign: 'right', color: 'var(--ui-muted)' }}>{format(total)}</span>
            </div>
          );
        })}
      </div>
      <div className="ui-legend">
        {names.map((name, i) => (
          <span key={name}>
            <i style={{ background: colorAt(i) }} />
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}
