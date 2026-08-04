/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** Max-width of the panel. */
  size?: 'sm' | 'md' | 'lg';
  /** Set false to keep the modal open on overlay click (e.g. mid-submit). */
  dismissOnOverlay?: boolean;
  children: React.ReactNode;
  className?: string;
}

const SIZE: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
};

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Accessible dialog: focus-trap, ESC-to-close, overlay-click, body scroll lock,
 * and focus restoration. Replaces the inline `fixed inset-0 …` overlays that
 * were duplicated across 5 admin pages (none of which trapped focus).
 */
export function Modal({
  open,
  onClose,
  title,
  size = 'md',
  dismissOnOverlay = true,
  children,
  className,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const titleId = useRef(`modal-${Math.random().toString(36).slice(2)}`).current;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const nodes = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!nodes || nodes.length === 0) {
        e.preventDefault();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    // Focus the first focusable element (or the panel) once mounted.
    const raf = requestAnimationFrame(() => {
      const nodes = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      (nodes && nodes.length ? nodes[0] : panelRef.current)?.focus();
    });
    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = overflow;
      restoreRef.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8"
      style={{ background: 'rgba(13,15,46,0.55)' }}
      onMouseDown={(e) => {
        if (dismissOnOverlay && e.target === e.currentTarget) onClose();
      }}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          'w-full rounded-[12px] bg-surface text-fg p-5 shadow-2xl animate-fade-up outline-none my-auto',
          SIZE[size],
          className,
        )}
      >
        {title && (
          <h3 id={titleId} className="font-display font-bold text-[15px] text-fg mb-3">
            {title}
          </h3>
        )}
        {children}
      </div>
    </div>
  );
}
