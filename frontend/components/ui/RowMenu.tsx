/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
'use client';

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface RowMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  /** Renders in the destructive (red) style — for delete/revoke actions. */
  danger?: boolean;
}

/**
 * Overflow (⋯) menu for per-row table actions. Row action buttons rendered
 * inline overflow the viewport on phones (the table then scrolls sideways to
 * reach them); collapsing them into one menu keeps every action one tap away at
 * any width.
 *
 * The menu is portalled to <body> and fixed-positioned against the trigger, so
 * it is never clipped by the table's `overflow-x-auto` wrapper (which the CSS
 * spec forces to also clip the y-axis) — the failure mode of a plain absolute
 * dropdown on the last row. It closes on outside-click, Escape, and any
 * scroll/resize (whereupon its anchor would be stale).
 */
export function RowMenu({
  items,
  label = 'Row actions',
}: {
  items: RowMenuItem[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Anchor top-right of the menu under the trigger's right edge.
    setCoords({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (btnRef.current?.contains(e.target as Node)) return;
      if (menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    function dismiss() {
      setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', dismiss);
    // capture: catches scrolls inside the table's own overflow container too.
    window.addEventListener('scroll', dismiss, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', dismiss, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="rounded-md p-1.5 text-fg-muted transition hover:bg-black/[0.05] hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-1"
      >
        <MoreHorizontal size={16} />
      </button>

      {open &&
        coords &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={label}
            style={{ position: 'fixed', top: coords.top, right: coords.right, zIndex: 60 }}
            className="min-w-[9.5rem] overflow-hidden rounded-[10px] border bg-surface py-1 shadow-lg"
          >
            {items.map((it, i) => (
              <button
                key={i}
                type="button"
                role="menuitem"
                disabled={it.disabled}
                onClick={() => {
                  setOpen(false);
                  it.onClick();
                }}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition disabled:cursor-not-allowed disabled:opacity-40',
                  it.danger ? 'text-red-600 hover:bg-red-50' : 'text-fg hover:bg-black/[0.04]',
                )}
              >
                {it.icon != null && <span className="flex-shrink-0">{it.icon}</span>}
                <span>{it.label}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
