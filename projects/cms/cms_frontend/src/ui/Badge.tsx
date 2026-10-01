import type { ReactNode } from 'react';
import { cx } from './classes';
import { toneFor, type Tone } from './tones';

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cx('ui-badge', tone !== 'neutral' && `tone-${tone}`)}>
      {children}
    </span>
  );
}

/** A status word as a coloured badge: `<StatusPill status="PARTIALLY_PAID" />` reads "Partially paid". */
export function StatusPill({ status, tone }: { status: string | null | undefined; tone?: Tone }) {
  if (!status) return <span className="ui-card-sub">-</span>;
  const label = status.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
  return <Badge tone={tone ?? toneFor(status)}>{label}</Badge>;
}
