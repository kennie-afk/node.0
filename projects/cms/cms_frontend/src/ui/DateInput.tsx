import type { InputHTMLAttributes } from 'react';
import { cx } from './classes';

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  /** YYYY-MM-DD or "". */
  value: string;
  onChange: (value: string) => void;
}

/** A plain ISO-date field: the value is the YYYY-MM-DD string the API wants, with no timezone maths. */
export function DateInput({ value, onChange, className, ...rest }: Props) {
  return <input {...rest} type="date" className={cx('ui-input', className)} value={value} onChange={(event) => onChange(event.target.value)} />;
}
