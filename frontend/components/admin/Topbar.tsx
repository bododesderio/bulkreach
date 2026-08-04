/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
'use client';

import { useState } from 'react';
import { Bell } from 'lucide-react';
import { useAuth } from '@/store/auth';
import { NavMenuButton, ThemeToggle } from '@/components/ui';

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

function adminInitials(email: string | undefined): string {
  if (!email) return 'SA';
  return email.slice(0, 2).toUpperCase();
}

export default function Topbar({
  title,
  subtitle,
  period,
  onPeriodChange,
  showPeriod = true,
}: TopbarProps) {
  const [internalPeriod, setInternalPeriod] = useState<Period>('Month');
  const user = useAuth((s) => s.user);

  const activePeriod = period ?? internalPeriod;
  const setActivePeriod = (p: Period) => {
    if (onPeriodChange) onPeriodChange(p);
    else setInternalPeriod(p);
  };

  return (
    <header
      className="flex h-[60px] items-center justify-between gap-2 bg-surface px-3 md:px-[22px]"
      style={{ borderBottom: '1px solid var(--border)' }}
    >
      {/* Left: mobile menu + title + subtitle */}
      <div className="flex min-w-0 items-center gap-3">
        <NavMenuButton />
        <div className="min-w-0">
          <div className="font-display font-extrabold text-[17px] text-fg leading-tight truncate">
            {title}
          </div>
          <div className="text-[11px] text-fg-muted truncate">{subtitle}</div>
        </div>
      </div>

      {/* Right: period toggle + bell + avatar */}
      <div className="flex shrink-0 items-center gap-[9px]">
        {/* Period toggle group — hidden on phones (secondary; page defaults to Month) */}
        {showPeriod && (
        <div
          className="hidden items-center border rounded-[7px] p-0.5 md:flex"
          style={{ background: 'var(--bg)' }}
        >
          {PERIODS.map((p) => {
            const isActive = p === activePeriod;
            return (
              <button
                key={p}
                onClick={() => setActivePeriod(p)}
                className="px-3 py-[5px] rounded-[5px] text-[11.5px] font-semibold transition-colors"
                style={
                  isActive
                    ? { background: 'var(--surface)', color: 'var(--fg)' }
                    : { color: 'var(--text-muted)' }
                }
              >
                {p}
              </button>
            );
          })}
        </div>
        )}

        {/* Theme toggle (moon/sun) */}
        <ThemeToggle />

        {/* Notification bell — no fake unread dot */}
        <button
          className="flex items-center justify-center border border-line bg-transparent rounded-[7px] transition-colors hover:bg-surface-2"
          style={{ width: '32px', height: '32px' }}
          aria-label="Notifications"
        >
          <Bell size={15} className="text-fg-muted" />
        </button>

        {/* Avatar with real user initials */}
        <div
          className="flex items-center justify-center rounded-full font-display font-extrabold text-teal"
          style={{ width: '32px', height: '32px', background: 'var(--navy)', fontSize: '12px' }}
          aria-label={user?.email ?? 'Admin'}
          title={user?.email ?? 'Admin'}
        >
          {adminInitials(user?.email)}
        </div>
      </div>
    </header>
  );
}
