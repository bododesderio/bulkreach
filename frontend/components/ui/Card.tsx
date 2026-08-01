/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
import React from 'react';
import { cn } from '@/lib/utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Padding scale. `md` (default) matches the old `p-4`; `lg` matches `p-6`. */
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const PADDING: Record<NonNullable<CardProps['padding']>, string> = {
  none: 'p-0',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

/**
 * The standard surface. Replaces the `'bg-white border rounded-[11px] p-4'`
 * string that was copy-pasted across 20 files. Extra classes merge via `cn`.
 */
export function Card({ padding = 'md', className, ...rest }: CardProps) {
  return (
    <div
      className={cn('bg-white border rounded-[11px]', PADDING[padding], className)}
      {...rest}
    />
  );
}
