import { useState, type ReactNode } from 'react';
import { Button, formatMoney, StatusPill, useToast, cx } from '../../../ui';
import { ApiError, normalizeError } from '../../../api/http';
import { sourceLabel } from './helpers';
import { downloadCsv } from '../../../api/reportsApi';
import './finance.css';

/** An amount in a table cell or sentence; tabular digits, negatives marked. */
export function Money({ value, muted, strong, currency }: { value: string | number | null | undefined; muted?: boolean; strong?: boolean; currency?: boolean }) {
  const text = formatMoney(value ?? '0.00', { showCurrency: !!currency });
  const negative = typeof value === 'string' && value.startsWith('-');
  return <span className={cx('ui-num', negative && 'fin-neg', muted && 'fin-muted', strong && 'fin-strong')}>{text}</span>;
}

export function KeyValue({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <dl className="fin-kv">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value ?? '-'}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The server's message, plus per-field messages when it named fields. */
export function FormError({ error }: { error: ApiError | null }) {
  if (!error) return null;
  return (
    <div className="fin-form-error" role="alert">
      <strong>{error.message}</strong>
      {error.fields.length > 0 && (
        <ul>
          {error.fields.map((issue) => (
            <li key={`${issue.field}-${issue.message}`}>
              {issue.field}: {issue.message}
            </li>
          ))}
        </ul>
      )}
      {error.requestId && <span className="fin-muted"> Reference {error.requestId}</span>}
    </div>
  );
}

export function PrintButton() {
  return (
    <Button variant="secondary" size="sm" onClick={() => window.print()}>
      Print
    </Button>
  );
}

export function CsvButton({ path, query, name }: { path: string; query?: Record<string, string | number | boolean | undefined>; name?: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await downloadCsv(path, query, name);
        } catch (failure) {
          toast.error(normalizeError(failure).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      Export CSV
    </Button>
  );
}

export function SourcePill({ source }: { source: string }) {
  return <StatusPill status={sourceLabel(source)} tone="neutral" />;
}

/** The value of an entry that is unreversed vs reversed. */
export function ReversedFlag({ reversed }: { reversed: boolean }) {
  return reversed ? <StatusPill status="Reversed" tone="bad" /> : null;
}


/**
 * A destructive or audited action that needs a reason (void, reverse, reject, cancel). Replaces the
 * button with a reason box and Confirm/Cancel in place; never a modal or window.confirm.
 */
export function ReasonAction({
  label,
  question = 'Why? This is kept on the record.',
  confirmLabel = 'Confirm',
  onConfirm,
  variant = 'danger',
  minLength = 3,
  disabled
}: {
  label: string;
  question?: string;
  confirmLabel?: string;
  onConfirm: (reason: string) => Promise<unknown> | void;
  variant?: 'danger' | 'secondary';
  minLength?: number;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  if (!open) {
    return (
      <Button variant={variant} size="sm" disabled={disabled} onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  }
  return (
    <span className="ui-row" role="group" aria-label={label}>
      <input
        className="ui-input"
        style={{ minWidth: 220 }}
        autoFocus
        aria-label={question}
        placeholder={question}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <Button
        variant={variant === 'danger' ? 'dangerSolid' : 'primary'}
        size="sm"
        loading={busy}
        disabled={reason.trim().length < minLength}
        onClick={async () => {
          setBusy(true);
          try {
            await onConfirm(reason.trim());
            setOpen(false);
            setReason('');
          } finally {
            setBusy(false);
          }
        }}
      >
        {confirmLabel}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </span>
  );
}

/** A compact 0-100 bar; `basisPoints` is what the API reports (10000 = 100%). */
export function Progress({ basisPoints, tone }: { basisPoints: number; tone?: 'ok' | 'bad' }) {
  const pct = Math.max(0, Math.min(100, basisPoints / 100));
  return (
    <div className={cx('fin-progress', tone)} role="img" aria-label={`${(basisPoints / 100).toFixed(1)} percent`}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

