/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  /** A primary action — typically a Button. */
  action?: React.ReactNode;
  className?: string;
}

/**
 * The considered "nothing here yet" panel — icon in a tinted disc, title,
 * description and an optional call to action. For the terse inline loading /
 * error / empty triad inside a card, keep using `DataState`.
 */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-12 text-center', className)}>
      {Icon && (
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--brand-050)] text-brand">
          <Icon size={22} aria-hidden />
        </span>
      )}
      <div>
        <p className="font-display text-[15px] font-semibold text-fg">{title}</p>
        {description && <p className="mx-auto mt-1 max-w-sm text-[13px] text-fg-muted">{description}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
