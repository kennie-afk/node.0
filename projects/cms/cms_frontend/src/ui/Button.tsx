import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cx } from './classes';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerSolid';

interface CommonProps {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  loading?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
}

type ButtonProps = CommonProps & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className'> & { to?: undefined };
type LinkProps = CommonProps & { to: string; disabled?: boolean; title?: string };

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'is-primary',
  secondary: 'is-secondary',
  ghost: 'is-ghost',
  danger: 'is-danger',
  dangerSolid: 'is-danger-solid'
};

/** A button, or a router link that looks like one when `to` is given. Colour changes on hover; nothing moves. */
export function Button(props: ButtonProps | LinkProps) {
  if (props.to !== undefined) {
    const { to, variant = 'secondary', size = 'md', loading, icon, children, className, disabled, title } = props;
    return (
      <Link to={to} title={title} aria-disabled={disabled || undefined} className={cx('ui-btn', VARIANT_CLASS[variant], size === 'sm' && 'is-sm', className)}>
        {loading ? <span className="ui-spin" aria-hidden="true" /> : icon}
        {children}
      </Link>
    );
  }
  const { variant = 'secondary', size = 'md', loading, icon, children, className, type, disabled, ...rest } = props;
  return (
    <button
      type={type ?? 'button'}
      className={cx('ui-btn', VARIANT_CLASS[variant], size === 'sm' && 'is-sm', className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="ui-spin" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
}
