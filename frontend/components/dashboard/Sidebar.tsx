/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
'use client';

import {
  LayoutDashboard,
  Users,
  Send,
  FileBarChart,
  CreditCard,
  Settings,
  LogOut,
} from 'lucide-react';
import { AppSidebar, type NavSection } from '@/components/ui';

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

/** Client dashboard sidebar — the shared rail with client routes, a plan badge,
 *  and a log-out footer. */
export default function Sidebar({ plan, onLogout }: SidebarProps) {
  return (
    <AppSidebar
      nav={sections}
      badge={plan ? `${plan} plan` : undefined}
      footer={
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
      }
    />
  );
}
