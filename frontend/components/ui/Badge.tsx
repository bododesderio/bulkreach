/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
import React from 'react';
import { cn } from '@/lib/utils';

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';
type Variant = 'soft' | 'solid' | 'outline';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  variant?: Variant;
}

// Soft = tinted fill + readable text (warning/info use AA-safe darker text on
// their light tints). Solid = filled. Outline = ringed. All theme-aware.
const SOFT: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-fg-muted',
  brand: 'bg-[var(--brand-050)] text-brand',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-[#b9770f]',
  danger: 'bg-danger/10 text-danger',
  info: 'bg-info/10 text-[#1b8a95]',
};
const SOLID: Record<Tone, string> = {
  neutral: 'bg-fg-muted text-white',
  brand: 'bg-brand text-brand-fg',
  success: 'bg-success text-white',
  warning: 'bg-warning text-white',
  danger: 'bg-danger text-white',
  info: 'bg-info text-white',
};
const OUTLINE: Record<Tone, string> = {
  neutral: 'border border-line text-fg-muted',
  brand: 'border border-brand text-brand',
  success: 'border border-success text-success',
  warning: 'border border-warning text-[#b9770f]',
  danger: 'border border-danger text-danger',
  info: 'border border-info text-[#1b8a95]',
};

/**
 * A plain pill label for counts, tags, and categories. For live backend status
 * tokens use `StatusBadge` instead (it resolves colour/label from lib/status).
 */
export function Badge({ tone = 'neutral', variant = 'soft', className, ...rest }: BadgeProps) {
  const map = variant === 'solid' ? SOLID : variant === 'outline' ? OUTLINE : SOFT;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap',
        map[tone],
        className,
      )}
      {...rest}
    />
  );
}
