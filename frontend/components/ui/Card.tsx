/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
import React from 'react';
import { cn } from '@/lib/utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Padding scale. `md` (default) matches the old `p-4`; `lg` matches `p-6`. */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Soft elevation. Off by default so it stays flush with legacy pages. */
  elevated?: boolean;
}

const PADDING: Record<NonNullable<CardProps['padding']>, string> = {
  none: 'p-0',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

/**
 * The standard surface. Token-backed (`bg-surface`/`border-line`) so it inverts
 * for free in dark mode while staying pixel-identical in light. Replaces the
 * `'bg-white border rounded-[11px] p-4'` string copy-pasted across 20 files.
 */
export function Card({ padding = 'md', elevated = false, className, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        'bg-surface border border-line rounded-[11px]',
        elevated && 'shadow-soft',
        PADDING[padding],
        className,
      )}
      {...rest}
    />
  );
}
