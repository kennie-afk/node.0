import type { ReactNode } from 'react';
import { cx } from './classes';

interface Props {
  label: string;
  /** Already formatted; use formatMoney for amounts. */
  value: ReactNode;
  foot?: ReactNode;
  tone?: 'ok' | 'bad' | 'warn';
  /** Signed percentage change vs the comparison period, shown with an arrow. */
  delta?: number | null;
  /** When false a rise is bad news (expenses). */
  upIsGood?: boolean;
  spark?: ReactNode;
  /** Icon shown in a tinted chip at the top right. */
  icon?: ReactNode;
}

/** A headline figure: small uppercase label, large tabular value, quiet foot, coloured left edge, optional icon chip. */
export function StatTile({ label, value, foot, tone, delta, upIsGood = true, spark, icon }: Props) {
  const good = delta === undefined || delta === null ? undefined : upIsGood ? delta >= 0 : delta <= 0;
  return (
    <div className={cx('ui-tile', tone && `tone-${tone}`)}>
      {icon && <span className="ui-tile-icon" aria-hidden="true">{icon}</span>}
      <div className="ui-tile-label">{label}</div>
      <div className="ui-tile-value">{value}</div>
      {(foot || (delta !== undefined && delta !== null)) && (
        <div className="ui-tile-foot">
          {delta !== undefined && delta !== null && (
            <span className={good ? 'ui-delta-up' : 'ui-delta-down'} aria-label={`${delta >= 0 ? 'up' : 'down'} ${Math.abs(delta)} percent`}>
              {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}%
            </span>
          )}
          {foot}
        </div>
      )}
      {spark}
    </div>
  );
}
