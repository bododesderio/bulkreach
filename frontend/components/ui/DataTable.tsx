/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
import React from 'react';
import { cn } from '@/lib/utils';
import { DataState } from './DataState';

export interface Column<T> {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
  /** Custom cell renderer. Falls back to (row as any)[key]. */
  render?: (row: T, index: number) => React.ReactNode;
  className?: string;
  /** Header cell extra classes (e.g. a fixed width). */
  headClassName?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  /** Sticky uppercase header — keep on for scrollable panels. */
  stickyHeader?: boolean;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  /** Shown when there are no rows (string or a full EmptyState). */
  empty?: React.ReactNode;
  /** Optional per-row click. */
  onRowClick?: (row: T, index: number) => void;
  className?: string;
  /** Stagger each row's fade-up entrance by this many seconds (off when unset). */
  stagger?: number;
  /** Base delay before the first staggered row animates. */
  baseDelay?: number;
}

/**
 * Canonical data table: sticky uppercase headers, hover rows, and a built-in
 * loading / error / empty triad. Token-backed → dark-ready. Shares the
 * `Column<T>` shape with the legacy admin table so pages migrate by import swap.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  stickyHeader = true,
  loading,
  error,
  onRetry,
  empty = 'Nothing here yet.',
  onRowClick,
  className,
  stagger,
  baseDelay = 0.05,
}: DataTableProps<T>) {
  const showState = loading || error || rows.length === 0;
  if (showState) {
    // Non-string empty (e.g. an <EmptyState/>) renders as-is when idle+empty.
    if (!loading && !error && React.isValidElement(empty)) return <>{empty}</>;
    return (
      <DataState
        loading={loading}
        error={error}
        empty={rows.length === 0}
        emptyLabel={typeof empty === 'string' ? empty : 'Nothing here yet.'}
        onRetry={onRetry}
      />
    );
  }

  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  'border-b border-line bg-surface px-[10px] py-2 text-[10px] font-bold uppercase tracking-[0.06em] text-fg-muted',
                  stickyHeader && 'sticky top-0 z-10',
                  col.headClassName,
                )}
                style={{ textAlign: col.align ?? 'left' }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const clickable = Boolean(onRowClick);
            return (
              <tr
                key={rowKey(row, i)}
                onClick={clickable ? () => onRowClick!(row, i) : undefined}
                className={cn(
                  'transition-colors hover:bg-surface-2',
                  clickable && 'cursor-pointer',
                  stagger != null && 'animate-fade-up',
                )}
                style={stagger != null ? { animationDelay: `${baseDelay + i * stagger}s` } : undefined}
              >
                {columns.map((col) => {
                  const content = col.render
                    ? col.render(row, i)
                    : ((row as Record<string, unknown>)[col.key] as React.ReactNode);
                  return (
                    <td
                      key={col.key}
                      className={cn(
                        'border-b border-line px-[10px] py-[10px] align-middle text-[12px] text-fg',
                        col.className,
                      )}
                      style={{ textAlign: col.align ?? 'left' }}
                    >
                      {content}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
