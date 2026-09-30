import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cx } from './classes';

interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  /** Receives the generated id/aria props to spread on the control. */
  children: (control: { id: string; 'aria-invalid': boolean | undefined; 'aria-describedby': string | undefined }) => ReactNode;
  className?: string;
}

/** Label + control + hint + error, wired together for screen readers. */
export function Field({ label, hint, error, required, children, className }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cx('ui-field', className)}>
      <label className="ui-label" htmlFor={id}>
        {label}
        {required && <span className="ui-required" aria-hidden="true"> *</span>}
      </label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {error ? (
        <span className="ui-error-text" id={`${id}-err`} role="alert">
          {error}
        </span>
      ) : (
        hint && (
          <span className="ui-hint" id={`${id}-hint`}>
            {hint}
          </span>
        )
      )}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label?: undefined };

export function Input({ className, ...rest }: InputProps) {
  return <input className={cx('ui-input', className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx('ui-input', className)} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx('ui-input', className)} {...rest} />;
}
