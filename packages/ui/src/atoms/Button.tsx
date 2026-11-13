import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Controls.module.css';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: ReactNode;
};

export function Button({ variant = 'secondary', icon, children, className = '', ...props }: Props) {
  return (
    <button
      className={[styles.button, styles[variant], className].join(' ')}
      type="button"
      {...props}
    >
      {icon && (
        <span aria-hidden="true" className={styles.icon}>
          {icon}
        </span>
      )}
      {children}
    </button>
  );
}
