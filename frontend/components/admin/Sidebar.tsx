/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
'use client';

import {
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
  Package,
  Newspaper,
} from 'lucide-react';
import { AppSidebar, type NavSection } from '@/components/ui';

const sections: NavSection[] = [
  {
    label: 'Overview',
    items: [{ icon: LayoutDashboard, label: 'Dashboard', href: '/admin', exact: true }],
  },
  {
    label: 'Clients',
    items: [
      { icon: Users, label: 'Accounts', href: '/admin/accounts' },
      { icon: RefreshCw, label: 'Subscriptions', href: '/admin/subscriptions' },
      { icon: Zap, label: 'Managed queue', href: '/admin/managed' },
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
      { icon: Settings, label: 'Settings', href: '/admin/settings', exact: true },
      { icon: Package, label: 'Plans', href: '/admin/settings/plans' },
      { icon: CreditCard, label: 'Payment providers', href: '/admin/settings/payments' },
      { icon: Newspaper, label: 'Content', href: '/admin/settings/content' },
    ],
  },
  {
    label: 'Data',
    items: [{ icon: Database, label: 'Data archive', href: '/admin/archive', special: true }],
  },
];

export default function Sidebar() {
  return <AppSidebar nav={sections} badge="SUPERADMIN" />;
}
