import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'danger' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  ...props 
}) => {
  return (
    <button 
      className={`button ${variant}`} 
      style={{
        padding: size === 'sm' ? '6px 16px' : '11px 24px',
        fontSize: size === 'sm' ? '13px' : '14.5px',
        fontWeight: '600',
        borderRadius: '8px',
        cursor: 'pointer',
        transition: 'all 0.25s ease',
        border: '1px solid transparent',
      }}
      {...props}
    >
      {children}
    </button>
  );
};