/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { Mail, Menu } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useMobileNav } from '@/store/ui';

export type NavBadgeType = 'teal' | 'red';

export interface NavItem {
  icon: LucideIcon;
  label: string;
  href: string;
  /** Match `href` exactly (default matches nested routes too). */
  exact?: boolean;
  /** Small pill on the right of the item. */
  badge?: string;
  badgeType?: NavBadgeType;
  /** Highlighted "special" item (e.g. Data archive). */
  special?: boolean;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

interface AppSidebarProps {
  nav: NavSection[];
  /** Pill under the wordmark (e.g. "SUPERADMIN" or "Growth plan"). */
  badge?: string;
  /** Footer content (e.g. a log-out button). */
  footer?: React.ReactNode;
}

/**
 * The dark navigation rail shared by the admin and client dashboards. Was two
 * near-identical 180-line components; now one config-driven primitive.
 */
export function AppSidebar({ nav, badge, footer }: AppSidebarProps) {
  const pathname = usePathname();

  return (
    <div
      className="flex h-full w-[220px] flex-col overflow-y-auto"
      style={{ background: '#0F1326', borderRight: '1px solid rgba(255,255,255,0.06)' }}
      data-testid="sidebar-nav"
    >
      {/* Logo block */}
      <div style={{ padding: '16px 17px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2">
          <div
            className="flex items-center justify-center rounded-[7px]"
            style={{ width: '28px', height: '28px', background: '#00D4AA', flexShrink: 0 }}
          >
            <Mail size={13} className="text-navy" />
          </div>
          <span className="font-display font-extrabold text-[15px] text-white">BulkReach</span>
        </div>

        {badge && (
          <div className="mt-2">
            <span
              className="inline-flex items-center gap-[5px] rounded-full font-bold uppercase"
              style={{
                background: 'rgba(0,212,170,0.1)',
                border: '1px solid rgba(0,212,170,0.2)',
                padding: '2px 9px',
                fontSize: '9.5px',
                color: '#00D4AA',
                letterSpacing: '0.06em',
              }}
            >
              <span
                className="inline-block flex-shrink-0 rounded-full"
                style={{ width: '6px', height: '6px', background: '#00D4AA' }}
              />
              {badge}
            </span>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2.5">
        {nav.map((section) => (
          <div key={section.label}>
            <div
              className="px-[17px] pb-1 pt-3.5 font-bold uppercase"
              style={{ fontSize: '9.5px', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.2)' }}
            >
              {section.label}
            </div>

            {section.items.map((item) => {
              const isActive = item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;

              const color = item.special
                ? 'rgba(0,212,170,0.8)'
                : isActive
                  ? 'white'
                  : 'rgba(255,255,255,0.52)';
              const iconColor = item.special
                ? 'rgba(0,212,170,0.8)'
                : isActive
                  ? 'white'
                  : 'rgba(255,255,255,0.45)';

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  data-testid={`nav-${item.label.toLowerCase()}`}
                  aria-current={isActive ? 'page' : undefined}
                  className="flex items-center justify-between px-[17px] py-[7.5px] transition-colors hover:bg-white/[0.04]"
                  style={{
                    borderLeft: item.special
                      ? '2px solid rgba(0,212,170,0.3)'
                      : isActive
                        ? '2px solid #00D4AA'
                        : '2px solid transparent',
                    background: item.special
                      ? 'rgba(0,212,170,0.04)'
                      : isActive
                        ? 'rgba(255,255,255,0.06)'
                        : undefined,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Icon size={14} color={iconColor} style={{ width: '16px', flexShrink: 0 }} />
                    <span
                      className={isActive && !item.special ? 'font-semibold' : 'font-medium'}
                      style={{ fontSize: '12.5px', color }}
                    >
                      {item.label}
                    </span>
                  </div>

                  {item.badge && (
                    <span
                      className="rounded-full px-1.5 py-0.5 font-bold"
                      style={
                        item.badgeType === 'red'
                          ? { background: '#EF4444', color: '#fff', fontSize: '9.5px' }
                          : { background: 'rgba(0,212,170,0.15)', color: '#00D4AA', fontSize: '9.5px' }
                      }
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {footer && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '10px 12px' }}>
          {footer}
        </div>
      )}
    </div>
  );
}

/** Hamburger that opens the mobile drawer. Renders only below `lg`. */
export function NavMenuButton() {
  const setOpen = useMobileNav((s) => s.setOpen);
  return (
    <button
      onClick={() => setOpen(true)}
      className="flex items-center justify-center rounded-[7px] border bg-transparent transition-colors hover:bg-bg lg:hidden"
      style={{ width: '32px', height: '32px' }}
      aria-label="Open navigation"
    >
      <Menu size={16} className="text-text-md" />
    </button>
  );
}

interface AppShellProps {
  /** The sidebar element; rendered once for desktop and once inside the drawer. */
  sidebar: React.ReactNode;
  /** Sticky banner above the topbar (e.g. impersonation notice). */
  banner?: React.ReactNode;
  /** Sticky topbar. Omit when pages render their own Topbar (admin does). */
  topbar?: React.ReactNode;
  children: React.ReactNode;
  /** className for the `<main>` element. */
  mainClassName?: string;
}

/**
 * Responsive app skeleton: sticky desktop sidebar, mobile drawer (driven by
 * `useMobileNav`), and a content column with optional sticky banner + topbar.
 * Unifies the admin and client dashboard layouts; gives admin a mobile drawer
 * for the first time.
 */
export function AppShell({ sidebar, banner, topbar, children, mainClassName }: AppShellProps) {
  const pathname = usePathname();
  const { open, setOpen } = useMobileNav();

  // Close the drawer on navigation.
  useEffect(() => setOpen(false), [pathname, setOpen]);

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen shrink-0 lg:block">{sidebar}</aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 h-full">{sidebar}</aside>
        </div>
      )}

      {/* Content column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {(banner || topbar) && (
          <div className="sticky top-0 z-20">
            {banner}
            {topbar}
          </div>
        )}
        <main className={mainClassName ?? 'flex-1 overflow-y-auto'}>{children}</main>
      </div>
    </div>
  );
}
