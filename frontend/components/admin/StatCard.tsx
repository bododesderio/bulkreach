/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { TrendingUp, TrendingDown, AlertTriangle, ArrowUpRight } from 'lucide-react';
import CountUp from './CountUp';

interface StatCardProps {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  valueSize?: number;
  change?: string;
  changeType?: 'up' | 'down' | 'warn';
  icon: LucideIcon;
  warn?: boolean;
  /** Navigate to this route when clicked (renders as a link). */
  href?: string;
  /** Click handler — e.g. to filter the page (renders as a button). */
  onClick?: () => void;
  /** Selected/active state (for filter cards). */
  active?: boolean;
}

/** KPI card with an animated count-up value. */
export default function StatCard({
  label,
  value,
  prefix = '',
  suffix = '',
  decimals = 0,
  valueSize = 26,
  change,
  changeType = 'up',
  icon: Icon,
  warn = false,
  href,
  onClick,
  active = false,
}: StatCardProps) {
  const ChangeIcon =
    changeType === 'up' ? TrendingUp : changeType === 'down' ? TrendingDown : AlertTriangle;
  const changeColor =
    changeType === 'up' ? 'text-success' : changeType === 'down' ? 'text-error' : 'text-amber';

  const clickable = Boolean(href || onClick);
  const className = `group block h-full w-full text-left bg-surface border rounded-[11px] p-4 ${
    clickable
      ? 'cursor-pointer transition-all hover:border-brand/60 hover:shadow-[0_8px_20px_-12px_rgba(27,31,74,0.25)]'
      : ''
  } ${active ? 'border-brand ring-1 ring-brand/30' : ''}`;
  const style = warn && !active ? { borderColor: 'rgba(239,68,68,0.2)' } : undefined;

  const body = (
    <>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-fg-muted">
          {label}
        </span>
        {href ? (
          <ArrowUpRight
            size={15}
            className="text-fg-muted transition-colors group-hover:text-brand"
            aria-hidden
          />
        ) : (
          <Icon size={15} className={warn ? 'text-error' : 'text-fg-muted'} />
        )}
      </div>

      <div
        className={`font-mono font-semibold leading-tight mt-1 ${warn ? 'text-error' : 'text-fg'}`}
        style={{
          // Fluid: shrinks on narrow mobile cards, grows to the target on desktop.
          fontSize: `clamp(${Math.round(valueSize * 0.7)}px, 5.2vw, ${valueSize}px)`,
        }}
      >
        <CountUp
          value={value}
          prefix={prefix}
          suffix={suffix}
          decimals={decimals}
        />
      </div>

      {change && (
        <div className={`inline-flex items-center gap-[3px] text-[10.5px] font-semibold mt-1.5 ${changeColor}`}>
          <ChangeIcon size={12} />
          <span>{change}</span>
        </div>
      )}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className} style={style} aria-label={`${label} — view details`}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className} style={style} aria-pressed={active}>
        {body}
      </button>
    );
  }
  return (
    <div className={className} style={style}>
      {body}
    </div>
  );
}
