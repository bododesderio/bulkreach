/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
import React from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'outline' | 'ghost' | 'danger' | 'subtle';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Shows a spinner and disables the button. */
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  /** Stretch to the container width. */
  block?: boolean;
}

const VARIANT: Record<Variant, string> = {
  primary: 'bg-brand text-brand-fg hover:bg-brand-600',
  outline: 'border border-line text-fg bg-transparent hover:border-brand hover:text-brand',
  ghost: 'text-fg-muted bg-transparent hover:bg-surface-2 hover:text-fg',
  danger: 'bg-danger text-white hover:opacity-90',
  subtle: 'bg-surface-2 text-fg hover:brightness-95',
};

const SIZE: Record<Size, string> = {
  sm: 'h-8 px-3 text-[12px] gap-1.5',
  md: 'h-9 px-4 text-[13px] gap-2',
  lg: 'h-11 px-5 text-sm gap-2',
};

/**
 * The one button. Token-backed variants (dark-ready), pill shape to match the
 * BulkReach brand, built-in loading state and visible focus ring. Anything
 * that was an ad-hoc `<button className="btn-primary">` should become this.
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, leftIcon, rightIcon, block, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center rounded-full font-semibold font-display whitespace-nowrap',
        'transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
        'disabled:cursor-not-allowed disabled:opacity-60',
        VARIANT[variant],
        SIZE[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading && (
        <span
          role="status"
          aria-label="Loading"
          className="inline-block animate-spin rounded-full border-2 border-current border-t-transparent"
          style={{ width: 14, height: 14 }}
        />
      )}
      {!loading && leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  );
});
