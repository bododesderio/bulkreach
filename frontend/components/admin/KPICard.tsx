import { TrendingUp, AlertTriangle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { seedSparklines } from '@/lib/seed-data';
import Sparkline from './Sparkline';

interface KPICardProps {
  label: string;
  value: string;
  change: string;
  changeType: 'up' | 'warn';
  sparklineKey: keyof typeof seedSparklines;
  icon: LucideIcon;
  warn?: boolean;
  valueSize?: number;
}

export default function KPICard({
  label,
  value,
  change,
  changeType,
  sparklineKey,
  icon: Icon,
  warn = false,
  valueSize,
}: KPICardProps) {
  const sparkline = seedSparklines[sparklineKey];

  return (
    <div
      className="bg-white border rounded-[11px] p-4"
      style={warn ? { borderColor: 'rgba(239,68,68,0.2)' } : undefined}
    >
      {/* Top row */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-text-muted">
          {label}
        </span>
        <Icon size={15} className={warn ? 'text-error' : 'text-text-muted'} />
      </div>

      {/* Value */}
      <div
        className={`font-mono font-semibold text-navy leading-tight mt-1 ${warn ? 'text-error' : ''}`}
        style={{ fontSize: valueSize ? `${valueSize}px` : '26px' }}
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

      {/* Sparkline */}
      <div className="mt-2">
        <Sparkline
          points={sparkline.points}
          color={sparkline.color}
          dotCx={sparkline.dot.cx}
          dotCy={sparkline.dot.cy}
        />
      </div>
    </div>
  );
}
