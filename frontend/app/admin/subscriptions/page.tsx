/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
'use client';

import { useEffect } from 'react';
import {
  TrendingUp,
  CheckCircle,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useApiQuery } from '@/lib/hooks';
import Topbar from '@/components/admin/Topbar';
import { RevealGroup, RevealItem, Reveal } from '@/components/admin/Reveal';
import StatCard from '@/components/admin/StatCard';
import DataTable, { Column } from '@/components/admin/DataTable';
import { StatusBadge, DataState } from '@/components/ui';

// ── types ─────────────────────────────────────────────────────────────────────
type SubStatus = 'active' | 'trial' | 'past_due' | 'cancelled';

interface AdminSub {
  id: string;
  account_id: string;
  account_name: string;
  account_email: string;
  plan_name: string;
  price_ugx: number | null;
  status: SubStatus;
  current_period_start: string | null;
  current_period_end: string | null;
}

interface SubStats {
  active: number;
  past_due: number;
  cancelled: number;
  total: number;
  mrr_ugx: number;
}

interface SubResponse {
  items: AdminSub[];
  stats: SubStats;
}

const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const cardBase = 'bg-white border rounded-[11px] p-4';

// ── table columns ─────────────────────────────────────────────────────────────
function buildColumns(): Column<AdminSub>[] {
  return [
    {
      key: 'account',
      label: 'Account',
      render: (row) => (
        <div>
          <div className="text-[12px] font-semibold text-navy">{row.account_name}</div>
          <div className="text-[10.5px] text-text-muted">{row.account_email}</div>
        </div>
      ),
    },
    {
      key: 'plan_name',
      label: 'Plan',
      render: (row) => (
        <span className="text-[12px] font-semibold text-navy">{row.plan_name}</span>
      ),
    },
    {
      key: 'price_ugx',
      label: 'Price',
      align: 'right',
      render: (row) => (
        <span className="font-mono text-[12px] text-navy">
          {row.price_ugx != null ? `UGX ${row.price_ugx.toLocaleString()}` : '—'}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => <StatusBadge domain="subscription" status={row.status} />,
    },
    {
      key: 'current_period_end',
      label: 'Renews',
      render: (row) => (
        <span className="text-[11px] text-text-muted whitespace-nowrap">
          {fmtDate(row.current_period_end)}
        </span>
      ),
    },
  ];
}

const SUBS_COLS = buildColumns();

// ── page ──────────────────────────────────────────────────────────────────────
export default function SubscriptionsPage() {
  const { data, isLoading, isError, error, refetch } = useApiQuery(
    ['admin', 'subscriptions'],
    () => api<SubResponse>('/admin/subscriptions', { auth: true }),
  );

  const items = data?.items ?? [];
  const stats = data?.stats ?? null;
  const loading = isLoading;

  useEffect(() => {
    if (error) toast.error('Failed to load subscriptions');
  }, [error]);

  const mrrM = stats ? stats.mrr_ugx / 1_000_000 : 0;

  return (
    <>
      <Topbar
        title="Subscriptions"
        subtitle="Billing lifecycle · plan distribution"
        showPeriod={false}
      />

      <div className="p-[18px]">
        {loading && (
          <div className="flex items-center justify-center py-16 text-[12px] text-text-muted">
            Loading subscriptions…
          </div>
        )}

        {!loading && isError && (
          <div className="bg-white border rounded-[11px] p-4">
            <DataState error={error} onRetry={() => refetch()} />
          </div>
        )}

        {!loading && !isError && stats && (
          <>
            {/* KPI row */}
            <RevealGroup className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-[18px]">
              <RevealItem lift>
                <StatCard
                  label="MRR (ACTIVE)"
                  value={mrrM}
                  decimals={1}
                  prefix="UGX "
                  suffix="M"
                  valueSize={22}
                  icon={TrendingUp}
                  change="Active subscriptions"
                  changeType="up"
                />
              </RevealItem>
              <RevealItem lift>
                <StatCard
                  label="ACTIVE SUBS"
                  value={stats.active}
                  icon={CheckCircle}
                  change="Paying plans"
                  changeType="up"
                />
              </RevealItem>
              <RevealItem lift>
                <StatCard
                  label="PAST DUE"
                  value={stats.past_due}
                  icon={AlertTriangle}
                  warn
                  changeType="warn"
                  change="Needs attention"
                />
              </RevealItem>
              <RevealItem lift>
                <StatCard
                  label="CANCELLED"
                  value={stats.cancelled}
                  icon={XCircle}
                  changeType="down"
                  change="Churned"
                />
              </RevealItem>
            </RevealGroup>

            {/* Subscriptions table */}
            <Reveal delay={0.15} lift className={cardBase}>
              <div className="font-display text-[14px] font-bold text-navy mb-0.5">
                Active subscriptions
              </div>
              <div className="text-[11px] text-text-muted mb-4">
                {items.length} subscription{items.length !== 1 ? 's' : ''}{' '}
                &middot; {stats.active} active
              </div>

              <DataTable<AdminSub>
                columns={SUBS_COLS}
                rows={items}
                rowKey={(row) => row.id}
                stagger={0.03}
                baseDelay={0.08}
                empty="No subscriptions found"
              />
            </Reveal>
          </>
        )}

        {!loading && !stats && (
          <div className="py-16 text-center text-[12px] text-text-muted">
            No subscription data available.
          </div>
        )}
      </div>
    </>
  );
}
