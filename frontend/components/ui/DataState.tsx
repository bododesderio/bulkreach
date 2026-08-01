/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
import React from 'react';
import { cn } from '@/lib/utils';

/** Small inline spinner using the brand teal. */
export function Spinner({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn('inline-block animate-spin rounded-full border-2 border-current border-t-transparent', className)}
      style={{ width: size, height: size, color: '#00D4AA' }}
    />
  );
}

interface DataStateProps {
  loading?: boolean;
  /** Any truthy error (string message or Error). */
  error?: unknown;
  /** True when the fetch succeeded but there's nothing to show. */
  empty?: boolean;
  loadingLabel?: string;
  emptyLabel?: string;
  /** Called when the user clicks "Try again" on the error state. */
  onRetry?: () => void;
  /** Rendered when not loading / errored / empty. */
  children?: React.ReactNode;
  className?: string;
}

function errorMessage(error: unknown): string {
  if (!error) return 'Something went wrong.';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  return 'Something went wrong.';
}

/**
 * One place for the loading / error / empty triad that was previously inline
 * strings scattered across ~20 pages. Renders `children` only in the happy path.
 */
export function DataState({
  loading,
  error,
  empty,
  loadingLabel = 'Loading…',
  emptyLabel = 'Nothing here yet.',
  onRetry,
  children,
  className,
}: DataStateProps) {
  if (loading) {
    return (
      <div className={cn('flex items-center justify-center gap-2 py-10 text-[12px] text-text-muted', className)}>
        <Spinner />
        <span>{loadingLabel}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('flex flex-col items-center justify-center gap-2 py-10 text-center', className)}>
        <p className="text-[12px] text-red-500">{errorMessage(error)}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="text-[12px] rounded-[6px] border font-semibold text-text-muted px-3 py-1.5 hover:border-navy hover:text-navy transition-colors"
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  if (empty) {
    return (
      <div className={cn('flex items-center justify-center py-10 text-[12px] text-text-muted', className)}>
        {emptyLabel}
      </div>
    );
  }

  return <>{children}</>;
}
