import { useState, type ReactNode } from 'react';
import { Button, type ButtonVariant } from './Button';

interface Props {
  /** The button that starts the action, e.g. "Void". */
  label: ReactNode;
  /** The question, e.g. "Void this receipt?" */
  question: ReactNode;
  confirmLabel?: ReactNode;
  onConfirm: () => Promise<unknown> | void;
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  disabled?: boolean;
}

/**
 * Confirmation that lives where the action is. No window.confirm (it blocks the page and cannot
 * be dismissed by a headless browser) and no modal: the button is replaced by the question.
 */
export function InlineConfirm({ label, question, confirmLabel = 'Yes', onConfirm, variant = 'danger', size = 'sm', disabled }: Props) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!asking) {
    return (
      <Button variant={variant} size={size} disabled={disabled} onClick={() => setAsking(true)}>
        {label}
      </Button>
    );
  }
  return (
    <span className="ui-confirm" role="alertdialog" aria-label="Confirm" onKeyDown={(event) => event.key === 'Escape' && setAsking(false)}>
      <span>{question}</span>
      <Button
        size="sm"
        variant="dangerSolid"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onConfirm();
          } finally {
            setBusy(false);
            setAsking(false);
          }
        }}
      >
        {confirmLabel}
      </Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => setAsking(false)}>
        Cancel
      </Button>
    </span>
  );
}
