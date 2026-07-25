'use client';

import { useState } from 'react';
import { Bell } from 'lucide-react';

export type Period = 'Today' | 'Month' | 'Quarter';
const PERIODS: Period[] = ['Today', 'Month', 'Quarter'];

interface TopbarProps {
  title: string;
  subtitle: string;
  /** Controlled period (optional). When provided with onPeriodChange the
   *  toggle drives the parent page instead of internal state. */
  period?: Period;
  onPeriodChange?: (p: Period) => void;
  /** Hide the period toggle entirely (pages without a time dimension). */
  showPeriod?: boolean;
}

export default function Topbar({
  title,
  subtitle,
  period,
  onPeriodChange,
  showPeriod = true,
}: TopbarProps) {
  const [internalPeriod, setInternalPeriod] = useState<Period>('Month');
  const activePeriod = period ?? internalPeriod;
  const setActivePeriod = (p: Period) => {
    if (onPeriodChange) onPeriodChange(p);
    else setInternalPeriod(p);
  };

  return (
    <header
      className="flex items-center justify-between bg-white"
      style={{
        height: '60px',
        borderBottom: '1px solid var(--border)',
        padding: '0 22px',
      }}
    >
      {/* Left: title + subtitle */}
      <div>
        <div className="font-display font-extrabold text-[17px] text-navy leading-tight">
          {title}
        </div>
        <div className="text-[11px] text-text-muted">{subtitle}</div>
      </div>

      {/* Right: period toggle + bell + avatar */}
      <div className="flex items-center gap-[9px]">
        {/* Period toggle group */}
        {showPeriod && (
        <div
          className="flex items-center border rounded-[7px] p-0.5"
          style={{ background: 'var(--bg)' }}
        >
          {PERIODS.map((period) => {
            const isActive = period === activePeriod;
            return (
              <button
                key={period}
                onClick={() => setActivePeriod(period)}
                className="px-3 py-[5px] rounded-[5px] text-[11.5px] font-semibold transition-colors"
                style={
                  isActive
                    ? { background: 'white', color: 'var(--navy)' }
                    : { color: 'var(--text-muted)' }
                }
              >
                {period}
              </button>
            );
          })}
        </div>
        )}

        {/* Notification bell */}
        <button
          className="relative flex items-center justify-center border bg-transparent rounded-[7px] transition-colors hover:bg-bg"
          style={{ width: '32px', height: '32px' }}
          aria-label="Notifications"
        >
          <Bell size={15} className="text-text-md" />
          {/* Unread dot */}
          <span
            className="absolute top-1 right-1 rounded-full"
            style={{
              width: '6px',
              height: '6px',
              background: '#EF4444',
              border: '1.5px solid white',
            }}
          />
        </button>

        {/* SA avatar */}
        <div
          className="flex items-center justify-center rounded-full font-display font-extrabold text-teal"
          style={{ width: '32px', height: '32px', background: 'var(--navy)', fontSize: '12px' }}
          aria-label="Super admin"
        >
          SA
        </div>
      </div>
    </header>
  );
}
