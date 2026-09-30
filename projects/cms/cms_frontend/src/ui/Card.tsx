import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cx } from './classes';

interface CardProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  /** Remove padding, for a table that should touch the card edge. */
  flush?: boolean;
  /** Make the whole card a link. */
  to?: string;
  className?: string;
}

/** A boundary, not an object: 1px border, 6px radius, no shadow. */
export function Card({ title, subtitle, actions, children, flush, to, className }: CardProps) {
  const head = (title || actions) && (
    <div className="ui-card-head" style={flush ? { padding: '10px 12px 0', marginBottom: 0 } : undefined}>
      <div>
        {title && <h2 className="ui-card-title">{title}</h2>}
        {subtitle && <div className="ui-card-sub">{subtitle}</div>}
      </div>
      {actions && <div className="ui-actions">{actions}</div>}
    </div>
  );
  const classes = cx('ui-card', flush && 'is-flush', to && 'is-link', className);
  if (to) {
    return (
      <Link to={to} className={classes}>
        {head}
        {children}
      </Link>
    );
  }
  return (
    <section className={classes}>
      {head}
      {children}
    </section>
  );
}
