import Link from 'next/link';
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from 'react';
import { cx } from './cx';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface StyleProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

export function buttonClassName({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
}: StyleProps = {}): string {
  return cx(styles.button, styles[variant], styles[size], fullWidth && styles.fullWidth);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, StyleProps {
  /** Shows a spinner, announces busy state and blocks clicks. */
  loading?: boolean;
  /** Replaces the label while loading, e.g. "Signing in…". */
  loadingText?: ReactNode;
}

export function Button({
  variant,
  size,
  fullWidth,
  loading = false,
  loadingText,
  disabled,
  type = 'button',
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={cx(buttonClassName({ variant, size, fullWidth }), className)}
      // Not the `disabled` attribute while loading: it would drop keyboard focus mid-submit.
      disabled={disabled}
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      onClick={loading ? (event) => event.preventDefault() : rest.onClick}
    >
      {loading && <span className={styles.spinner} aria-hidden="true" />}
      <span>{loading && loadingText ? loadingText : children}</span>
    </button>
  );
}

export type ButtonLinkProps = ComponentProps<typeof Link> & StyleProps;

/** A link that looks like a button (navigation is a link, actions are buttons). */
export function ButtonLink({ variant, size, fullWidth, className, ...rest }: ButtonLinkProps) {
  return (
    <Link {...rest} className={cx(buttonClassName({ variant, size, fullWidth }), className)} />
  );
}
