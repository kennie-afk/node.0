import type { CSSProperties } from 'react';

export function Skeleton({ width = '100%', height = 10, style }: { width?: number | string; height?: number | string; style?: CSSProperties }) {
  return <span className="ui-skel" style={{ width, height, ...style }} aria-hidden="true" />;
}

/** Reserves the space a list will fill, so the page does not jump when data arrives. */
export function SkeletonRows({ rows = 6, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }} role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 12 }}>
          {Array.from({ length: columns }, (_, col) => (
            <Skeleton key={col} height={14} width={`${60 + ((row * 7 + col * 13) % 40)}%`} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Page-level loader; reserves 40vh, not 60. */
export function PageLoader() {
  return (
    <div style={{ minHeight: '40vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ui-muted)' }} role="status">
      <span className="ui-spin" aria-hidden="true" />
      <span style={{ marginLeft: 10, fontSize: 'var(--fs-sm)' }}>Loading</span>
    </div>
  );
}
