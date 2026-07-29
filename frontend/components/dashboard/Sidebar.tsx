/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  Mail,
  LayoutDashboard,
  Users,
  Send,
  FileBarChart,
  CreditCard,
  Settings,
  LogOut,
} from 'lucide-react';

interface NavItem {
  icon: LucideIcon;
  label: string;
  href: string;
  exact?: boolean;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const sections: NavSection[] = [
  {
    label: 'Overview',
    items: [{ icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard', exact: true }],
  },
  {
    label: 'Messaging',
    items: [
      { icon: Users, label: 'Contacts', href: '/dashboard/contacts' },
      { icon: Send, label: 'Campaigns', href: '/dashboard/campaigns' },
    ],
  },
  {
    label: 'Insights',
    items: [{ icon: FileBarChart, label: 'Reports', href: '/dashboard/reports' }],
  },
  {
    label: 'Account',
    items: [
      { icon: CreditCard, label: 'Billing', href: '/dashboard/billing' },
      { icon: Settings, label: 'Settings', href: '/dashboard/settings' },
    ],
  },
];

interface SidebarProps {
  /** Account plan, rendered as a teal badge under the wordmark (e.g. "Trial"). */
  plan?: string;
  onLogout: () => void;
}

/** Client dashboard sidebar — same visual language as the admin sidebar
 *  (dark #0F1326, teal active left-border, sectioned nav) with client routes,
 *  a plan badge in place of SUPERADMIN, and a logout footer. */
export default function Sidebar({ plan, onLogout }: SidebarProps) {
  const pathname = usePathname();

  return (
    <div
      className="flex h-full flex-col overflow-y-auto"
      style={{ width: '220px', background: '#0F1326' }}
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

        {plan && (
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
                className="rounded-full flex-shrink-0"
                style={{ width: '6px', height: '6px', background: '#00D4AA', display: 'inline-block' }}
              />
              {plan} plan
            </span>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="py-2.5 flex-1">
        {sections.map((section) => (
          <div key={section.label}>
            <div
              className="font-bold uppercase px-[17px] pt-3.5 pb-1"
              style={{ fontSize: '9.5px', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.2)' }}
            >
              {section.label}
            </div>

            {section.items.map((item) => {
              const isActive = item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  data-testid={`nav-${item.label.toLowerCase()}`}
                  aria-current={isActive ? 'page' : undefined}
                  className="flex items-center gap-2 px-[17px] py-[7.5px] transition-colors hover:bg-white/[0.04]"
                  style={{
                    borderLeft: isActive ? '2px solid #00D4AA' : '2px solid transparent',
                    background: isActive ? 'rgba(255,255,255,0.06)' : undefined,
                  }}
                >
                  <Icon
                    size={14}
                    color={isActive ? 'white' : 'rgba(255,255,255,0.45)'}
                    style={{ width: '16px', flexShrink: 0 }}
                  />
                  <span
                    className={isActive ? 'font-semibold' : 'font-medium'}
                    style={{ fontSize: '12.5px', color: isActive ? 'white' : 'rgba(255,255,255,0.52)' }}
                  >
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Logout footer */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '10px 12px' }}>
        <button
          onClick={onLogout}
          data-testid="sidebar-logout"
          className="flex w-full items-center gap-2 rounded-[7px] px-[9px] py-2 transition-colors hover:bg-white/[0.05]"
        >
          <LogOut size={14} color="rgba(255,255,255,0.45)" style={{ flexShrink: 0 }} />
          <span className="font-medium" style={{ fontSize: '12.5px', color: 'rgba(255,255,255,0.52)' }}>
            Log out
          </span>
        </button>
      </div>
    </div>
  );
}
