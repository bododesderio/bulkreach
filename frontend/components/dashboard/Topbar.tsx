/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
'use client';

import NotificationBell from '@/components/NotificationBell';
import { NavMenuButton, ThemeToggle } from '@/components/ui';

interface TopbarProps {
  title: string;
  subtitle: string;
  accountName: string;
  plan: string;
  /** Used to derive the avatar initials. */
  email: string;
}

function initials(email: string): string {
  return email.slice(0, 2).toUpperCase();
}

/** Client dashboard topbar — same 60px white bar / font-display navy title as the
 *  admin Topbar, but with the real NotificationBell, account name/plan, and a
 *  navy avatar with teal initials. No period toggle (client pages are point-in-time). */
export default function Topbar({
  title,
  subtitle,
  accountName,
  plan,
  email,
}: TopbarProps) {
  return (
    <header
      className="flex items-center justify-between bg-surface"
      style={{ height: '60px', borderBottom: '1px solid var(--border)', padding: '0 16px' }}
    >
      {/* Left: mobile menu + title/subtitle */}
      <div className="flex items-center gap-3">
        <NavMenuButton />
        <div>
          <div
            className="font-display font-extrabold text-[17px] text-fg leading-tight"
            data-testid="page-title"
          >
            {title}
          </div>
          <div className="text-[11px] text-fg-muted">{subtitle}</div>
        </div>
      </div>

      {/* Right: theme toggle + bell + account + avatar */}
      <div className="flex items-center gap-[11px]" data-testid="topbar-profile">
        <ThemeToggle />
        <NotificationBell />
        <div className="hidden text-right sm:block">
          <div className="text-[12.5px] font-semibold text-fg leading-tight">{accountName}</div>
          <div className="text-[10.5px] capitalize text-fg-muted">{plan} plan</div>
        </div>
        <div
          className="flex items-center justify-center rounded-full font-display font-extrabold text-teal"
          style={{ width: '32px', height: '32px', background: 'var(--navy)', fontSize: '12px' }}
          title={email}
        >
          {initials(email)}
        </div>
      </div>
    </header>
  );
}
