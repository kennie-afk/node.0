import type { ApiError } from '../../../api/http';

/** A form-level failure that is not about a single field (conflicts, permissions, rules). */
export function FormBanner({ error }: { error: ApiError | null }) {
  if (!error || error.fields.length > 0) return null;
  return (
    <div className="ops-banner is-bad" role="alert">
      <strong>{error.status === 409 ? 'Not allowed' : 'Could not save'}.</strong> {error.message}
      {error.requestId && <span className="ops-banner-id"> Reference {error.requestId}</span>}
    </div>
  );
}

export function Notice({ tone = 'info', title, children }: { tone?: 'info' | 'warn' | 'bad' | 'ok'; title?: string; children: React.ReactNode }) {
  return (
    <div className={`ops-banner is-${tone}`} role={tone === 'bad' || tone === 'warn' ? 'alert' : 'status'}>
      {title && <strong>{title}. </strong>}
      {children}
    </div>
  );
}
