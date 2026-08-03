/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
import Link from 'next/link';
import { TrendingUp, AlertTriangle, ArrowUpRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface KPICardProps {
  label: string;
  value: string;
  change: string;
  changeType: 'up' | 'warn';
  icon: LucideIcon;
  warn?: boolean;
  valueSize?: number;
  /** When set, the whole card becomes a link to this route. */
  href?: string;
}

export default function KPICard({
  label,
  value,
  change,
  changeType,
  icon: Icon,
  warn = false,
  valueSize,
  href,
}: KPICardProps) {
  const clickable = Boolean(href);
  const className = `group block h-full bg-white border rounded-[11px] p-4 ${
    clickable
      ? 'cursor-pointer transition-all hover:border-teal/60 hover:shadow-[0_8px_20px_-12px_rgba(27,31,74,0.25)]'
      : ''
  }`;
  const style = warn ? { borderColor: 'rgba(239,68,68,0.2)' } : undefined;

  const body = (
    <>
      {/* Top row */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-text-muted">
          {label}
        </span>
        {clickable ? (
          <ArrowUpRight
            size={15}
            className="text-text-muted transition-colors group-hover:text-teal"
            aria-hidden
          />
        ) : (
          <Icon size={15} className={warn ? 'text-error' : 'text-text-muted'} />
        )}
      </div>

      {/* Value */}
      <div
        className={`font-mono font-semibold text-navy leading-tight mt-1 ${warn ? 'text-error' : ''}`}
        style={{
          // Fluid: shrinks to fit a narrow mobile card, grows back on wider screens.
          fontSize: `clamp(${Math.round((valueSize ?? 26) * 0.7)}px, 5.2vw, ${valueSize ?? 26}px)`,
        }}
      >
        {value}
      </div>

      {/* Change badge */}
      <div className="inline-flex items-center gap-[3px] text-[10.5px] font-semibold mt-1.5">
        {changeType === 'up' ? (
          <>
            <TrendingUp size={12} className="text-success" />
            <span className="text-success">{change}</span>
          </>
        ) : (
          <>
            <AlertTriangle size={12} className="text-amber" />
            <span className="text-amber">{change}</span>
          </>
        )}
      </div>
    </>
  );

  return href ? (
    <Link href={href} className={className} style={style} aria-label={`${label} — view details`}>
      {body}
    </Link>
  ) : (
    <div className={className} style={style}>
      {body}
    </div>
  );
}
