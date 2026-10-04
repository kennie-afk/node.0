import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface Props {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  crumbs?: Array<{ label: string; to?: string }>;
  /** Sparingly: draws the title in the brand gradient (the dashboard greeting only). */
  gradient?: boolean;
}

/** Page titles are Space Grotesk 700 at 20px (18px on phones). */
export function PageHeader({ title, subtitle, actions, crumbs, gradient }: Props) {
  return (
    <header>
      {crumbs && crumbs.length > 0 && (
        <nav className="ui-crumbs" aria-label="Breadcrumb">
          {crumbs.map((crumb, index) => (
            <span key={`${crumb.label}-${index}`}>
              {index > 0 && ' / '}
              {crumb.to ? <Link to={crumb.to}>{crumb.label}</Link> : crumb.label}
            </span>
          ))}
        </nav>
      )}
      <div className="ui-page-header">
        <div>
          <h1 className={`ui-page-title${gradient ? ' ui-gradient-text' : ''}`}>{title}</h1>
          {subtitle && <p className="ui-page-sub">{subtitle}</p>}
        </div>
        {actions && <div className="ui-actions">{actions}</div>}
      </div>
    </header>
  );
}
