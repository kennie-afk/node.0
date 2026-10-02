import type { ReactNode } from 'react';
import { AlertTriangle, Inbox } from 'lucide-react';
import { Button } from './Button';
import { cx } from './classes';

interface SignpostProps {
  title: string;
  message?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  error?: boolean;
  requestId?: string;
}

/** A signpost: a short heading, one sentence, and the way forward. Never a third of a screen. */
export function EmptyState({ title, message, action, icon }: Omit<SignpostProps, 'error' | 'requestId'>) {
  return (
    <div className="ui-signpost" role="status">
      <div className="ui-signpost-chip">{icon ?? <Inbox size={20} aria-hidden="true" />}</div>
      <h3 className="ui-signpost-title">{title}</h3>
      {message && <p className="ui-signpost-text">{message}</p>}
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  requestId
}: {
  title?: string;
  message?: ReactNode;
  onRetry?: () => void;
  requestId?: string;
}) {
  return (
    <div className={cx('ui-signpost', 'is-error')} role="alert">
      <div className="ui-signpost-chip">
        <AlertTriangle size={20} aria-hidden="true" />
      </div>
      <h3 className="ui-signpost-title">{title}</h3>
      {message && <p className="ui-signpost-text">{message}</p>}
      {onRetry && (
        <div style={{ marginTop: 12 }}>
          <Button size="sm" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}
      {requestId && <div className="ui-signpost-id">Reference {requestId}</div>}
    </div>
  );
}
