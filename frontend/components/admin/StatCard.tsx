/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
import type { LucideIcon } from 'lucide-react';
import { TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
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
}: StatCardProps) {
  const ChangeIcon =
    changeType === 'up' ? TrendingUp : changeType === 'down' ? TrendingDown : AlertTriangle;
  const changeColor =
    changeType === 'up' ? 'text-success' : changeType === 'down' ? 'text-error' : 'text-amber';

  return (
    <div
      className="bg-white border rounded-[11px] p-4 h-full"
      style={warn ? { borderColor: 'rgba(239,68,68,0.2)' } : undefined}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-text-muted">
          {label}
        </span>
        <Icon size={15} className={warn ? 'text-error' : 'text-text-muted'} />
      </div>

      <div
        className={`font-mono font-semibold leading-tight mt-1 ${warn ? 'text-error' : 'text-navy'}`}
        style={{ fontSize: `${valueSize}px` }}
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
    </div>
  );
}
