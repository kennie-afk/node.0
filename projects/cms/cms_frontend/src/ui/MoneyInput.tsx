import { useState, type InputHTMLAttributes } from 'react';
import { cx } from './classes';
import { normalizeMoneyInput, sanitizeMoneyInput } from './format';

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  /** Decimal string such as "1500.50", or "" when empty. Never a number. */
  value: string;
  onChange: (value: string) => void;
  currency?: string;
}

/**
 * Takes and gives a decimal STRING. Typing is filtered to digits and two decimals; on blur it
 * pads to "12.00". Nothing is ever parsed as a float, so what the treasurer types is exactly
 * what is sent.
 */
export function MoneyInput({ value, onChange, currency = 'KES', className, onBlur, ...rest }: Props) {
  const [focused, setFocused] = useState(false);
  return (
    <div className="ui-money-wrap">
      <span className="ui-money-cur" aria-hidden="true">
        {currency}
      </span>
      <input
        {...rest}
        inputMode="decimal"
        autoComplete="off"
        className={cx('ui-input', 'ui-money', className)}
        value={value}
        placeholder={rest.placeholder ?? '0.00'}
        onFocus={() => setFocused(true)}
        onChange={(event) => onChange(sanitizeMoneyInput(event.target.value))}
        onBlur={(event) => {
          setFocused(false);
          onChange(normalizeMoneyInput(event.target.value));
          onBlur?.(event);
        }}
        data-focused={focused || undefined}
      />
    </div>
  );
}
