import React from 'react';

export interface Column<T> {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
  /** Custom cell renderer. Falls back to (row as any)[key]. */
  render?: (row: T, index: number) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  /** Stagger each row's fade-up entrance by this many seconds. */
  stagger?: number;
  /** Base delay before the first row animates. */
  baseDelay?: number;
  empty?: React.ReactNode;
}

/** Generic admin table: sticky-looking header, hover rows, staggered row reveal. */
export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  stagger = 0.035,
  baseDelay = 0.05,
  empty,
}: DataTableProps<T>) {
  const lastIndex = rows.length - 1;

  if (rows.length === 0 && empty) {
    return <div className="py-10 text-center text-[12px] text-text-muted">{empty}</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className="text-[10px] font-bold uppercase tracking-[0.06em] text-text-muted px-[10px] py-2 border-b"
                style={{ textAlign: col.align ?? 'left' }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={rowKey(row, i)}
              className="animate-fade-up hover:bg-bg transition-colors"
              style={{ animationDelay: `${baseDelay + i * stagger}s` }}
            >
              {columns.map((col) => {
                const content = col.render
                  ? col.render(row, i)
                  : ((row as Record<string, unknown>)[col.key] as React.ReactNode);
                return (
                  <td
                    key={col.key}
                    className={`px-[10px] py-[10px] text-[12px] text-text-md align-middle ${
                      i === lastIndex ? '' : 'border-b'
                    } ${col.className ?? ''}`}
                    style={{ textAlign: col.align ?? 'left' }}
                  >
                    {content}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
