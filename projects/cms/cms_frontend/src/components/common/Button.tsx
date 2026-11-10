import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'danger' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
}

/** Legacy wrapper: the kit's button classes, so it matches every other button. */
export const Button: React.FC<ButtonProps> = ({ children, variant = 'primary', size = 'md', className = '', ...props }) => (
  <button className={`ui-btn is-${variant}${size === 'sm' ? ' is-sm' : ''} ${className}`.trim()} {...props}>
    {children}
  </button>
);
