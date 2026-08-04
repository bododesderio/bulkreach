/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
import React from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

type Accent = 'brand' | 'success' | 'warning' | 'danger' | 'info';

interface StatTileProps {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  /** Colour of the left accent bar + icon. */
  accent?: Accent;
  /** Small line under the value — a trend, delta, or note. */
  hint?: React.ReactNode;
  /** Makes the whole tile a link. */
  href?: string;
  /** Makes the whole tile a button (e.g. to filter a page). */
  onClick?: () => void;
  /** Selected/active styling for filter tiles. */
  active?: boolean;
  className?: string;
}

// Left-accent + icon colour per accent. Semantic colours are real Tailwind
// tokens; brand is a CSS var so it tracks the theme.
const BAR: Record<Accent, string> = {
  brand: 'bg-brand',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
};
const ICON: Record<Accent, string> = {
  brand: 'text-brand',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-info',
};

/**
 * The Rooibok KPI-tile pattern, token-backed: coloured left accent, uppercase
 * muted label, big value, icon top-right. Dark-ready by construction. Use for
 * the KPI rows the density mandate calls for on every section landing.
 */
export function StatTile({
  label,
  value,
  icon: Icon,
  accent = 'brand',
  hint,
  href,
  onClick,
  active = false,
  className,
}: StatTileProps) {
  const interactive = Boolean(href || onClick);
  const cls = cn(
    'group relative block h-full w-full overflow-hidden rounded-[11px] border border-line bg-surface p-4 pl-5 text-left',
    interactive && 'cursor-pointer transition hover:border-brand/60 hover:shadow-soft',
    active && 'border-brand ring-1 ring-brand/30',
    className,
  );

  const body = (
    <>
      {/* Left accent bar */}
      <span className={cn('absolute inset-y-0 left-0 w-1', BAR[accent])} aria-hidden />
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-fg-muted">{label}</span>
        {href ? (
          <ArrowUpRight size={15} className="text-fg-muted transition-colors group-hover:text-brand" aria-hidden />
        ) : Icon ? (
          <Icon size={15} className={ICON[accent]} aria-hidden />
        ) : null}
      </div>
      <div className="mt-1 font-mono font-semibold leading-tight text-fg" style={{ fontSize: 'clamp(20px, 5.2vw, 26px)' }}>
        {value}
      </div>
      {hint && <div className="mt-1.5 text-[10.5px] font-semibold text-fg-muted">{hint}</div>}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={cls} aria-label={`${label} — view details`}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls} aria-pressed={active}>
        {body}
      </button>
    );
  }
  return <div className={cls}>{body}</div>;
}
