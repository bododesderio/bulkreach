/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
import React from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Crumb {
  label: string;
  href?: string;
}

/** A breadcrumb trail; the last crumb renders as the current page. */
export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  if (!items.length) return null;
  return (
    <nav aria-label="Breadcrumb" className={cn('flex items-center gap-1 text-[11.5px] text-fg-muted', className)}>
      {items.map((c, i) => {
        const last = i === items.length - 1;
        return (
          <React.Fragment key={`${c.label}-${i}`}>
            {i > 0 && <ChevronRight size={12} className="opacity-60" aria-hidden />}
            {c.href && !last ? (
              <Link href={c.href} className="hover:text-brand transition-colors">
                {c.label}
              </Link>
            ) : (
              <span className={last ? 'text-fg font-medium' : undefined} aria-current={last ? 'page' : undefined}>
                {c.label}
              </span>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}

interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  crumbs?: Crumb[];
  /** Right-aligned actions (buttons, filters). */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * Standard section header: breadcrumbs, title + subtitle, and a right-aligned
 * actions slot. Stacks cleanly on mobile. Token-backed for dark mode.
 */
export function PageHeader({ title, subtitle, crumbs, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('mb-5', className)}>
      {crumbs && crumbs.length > 0 && <Breadcrumbs items={crumbs} className="mb-2" />}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-[22px] font-bold leading-tight tracking-[-0.01em] text-fg">{title}</h1>
          {subtitle && <p className="mt-1 text-[13px] text-fg-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
