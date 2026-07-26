'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  Mail,
  LayoutDashboard,
  Users,
  RefreshCw,
  Zap,
  BarChart2,
  CreditCard,
  Megaphone,
  FileText,
  Activity,
  Settings,
  Database,
  ArrowRight,
} from 'lucide-react';

type BadgeType = 'teal' | 'red';

interface NavItem {
  icon: LucideIcon;
  label: string;
  href: string;
  badge?: string;
  badgeType?: BadgeType;
  special?: boolean;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const sections: NavSection[] = [
  {
    label: 'Overview',
    items: [{ icon: LayoutDashboard, label: 'Dashboard', href: '/admin' }],
  },
  {
    label: 'Clients',
    items: [
      { icon: Users, label: 'Accounts', href: '/admin/accounts', badge: '127', badgeType: 'teal' },
      { icon: RefreshCw, label: 'Subscriptions', href: '/admin/subscriptions' },
      { icon: Zap, label: 'Managed queue', href: '/admin/managed', badge: '3', badgeType: 'red' },
    ],
  },
  {
    label: 'Revenue',
    items: [
      { icon: BarChart2, label: 'Revenue', href: '/admin/revenue' },
      { icon: CreditCard, label: 'Payments', href: '/admin/payments' },
    ],
  },
  {
    label: 'Platform',
    items: [
      { icon: Megaphone, label: 'Campaigns', href: '/admin/campaigns' },
      { icon: FileText, label: 'Audit log', href: '/admin/audit-log' },
    ],
  },
  {
    label: 'System',
    items: [
      { icon: Activity, label: 'Health', href: '/admin/health' },
      { icon: Settings, label: 'Settings', href: '/admin/settings' },
      { icon: CreditCard, label: 'Payment providers', href: '/admin/settings/payments' },
    ],
  },
  {
    label: 'Data',
    items: [{ icon: Database, label: 'Data archive', href: '/admin/archive', special: true }],
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="flex-shrink-0 flex flex-col sticky top-0 h-screen overflow-y-auto"
      style={{
        width: '220px',
        background: '#0F1326',
        borderRight: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Logo block */}
      <div
        style={{
          padding: '16px 17px 14px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        {/* Mark + wordmark row */}
        <div className="flex items-center gap-2">
          <div
            className="flex items-center justify-center rounded-[7px]"
            style={{ width: '28px', height: '28px', background: '#00D4AA', flexShrink: 0 }}
          >
            <Mail size={13} className="text-navy" />
          </div>
          <span className="font-display font-extrabold text-[15px] text-white">BulkReach</span>
        </div>

        {/* SUPERADMIN badge */}
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
            SUPERADMIN
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="py-2.5 flex-1">
        {sections.map((section) => (
          <div key={section.label}>
            {/* Section label */}
            <div
              className="font-bold uppercase px-[17px] pt-3.5 pb-1"
              style={{
                fontSize: '9.5px',
                letterSpacing: '0.1em',
                color: 'rgba(255,255,255,0.2)',
              }}
            >
              {section.label}
            </div>

            {/* Items */}
            {section.items.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;

              if (item.special) {
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center justify-between px-[17px] py-[7.5px]"
                    style={{
                      borderLeft: '2px solid rgba(0,212,170,0.3)',
                      background: 'rgba(0,212,170,0.04)',
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <Icon
                        size={14}
                        color="rgba(0,212,170,0.8)"
                        style={{ width: '16px', flexShrink: 0 }}
                      />
                      <span
                        className="font-medium"
                        style={{ fontSize: '12.5px', color: 'rgba(0,212,170,0.8)' }}
                      >
                        {item.label}
                      </span>
                    </div>
                    <ArrowRight size={11} color="rgba(0,212,170,0.45)" />
                  </Link>
                );
              }

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center justify-between px-[17px] py-[7.5px] transition-colors hover:bg-white/[0.04]"
                  style={{
                    borderLeft: isActive ? '2px solid #00D4AA' : '2px solid transparent',
                    background: isActive ? 'rgba(255,255,255,0.06)' : undefined,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Icon
                      size={14}
                      color={isActive ? 'white' : 'rgba(255,255,255,0.45)'}
                      style={{ width: '16px', flexShrink: 0 }}
                    />
                    <span
                      className={isActive ? 'font-semibold' : 'font-medium'}
                      style={{
                        fontSize: '12.5px',
                        color: isActive ? 'white' : 'rgba(255,255,255,0.52)',
                      }}
                    >
                      {item.label}
                    </span>
                  </div>

                  {/* Right badge */}
                  {item.badge && item.badgeType === 'teal' && (
                    <span
                      className="font-bold rounded-full px-1.5 py-0.5"
                      style={{
                        background: 'rgba(0,212,170,0.15)',
                        color: '#00D4AA',
                        fontSize: '9.5px',
                      }}
                    >
                      {item.badge}
                    </span>
                  )}
                  {item.badge && item.badgeType === 'red' && (
                    <span
                      className="font-bold rounded-full px-1.5 py-0.5 text-white"
                      style={{ background: '#EF4444', fontSize: '9.5px' }}
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
    </aside>
  );
}
