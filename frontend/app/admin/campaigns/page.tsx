/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Zap, CheckCircle2, Calendar, Send } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useApiQuery } from '@/lib/hooks';
import Topbar from '@/components/admin/Topbar';
import StatCard from '@/components/admin/StatCard';
import { Reveal, RevealGroup, RevealItem } from '@/components/admin/Reveal';
import DataTable, { Column } from '@/components/admin/DataTable';
import LiveTicker from '@/components/admin/LiveTicker';
import { StatusBadge, DataState } from '@/components/ui';

// ── types ─────────────────────────────────────────────────────────────────────
type CampaignStatus =
  | 'draft'
  | 'queued'
  | 'scheduled'
  | 'sending'
  | 'completed'
  | 'failed'
  | 'cancelled';

type Channel = 'sms' | 'email' | 'both';

interface AdminCampaign {
  id: string;
  account_id: string;
  account_name: string;
  name: string;
  channel: Channel;
  audience: number;
  sent: number;
  delivered: number;
  failed: number;
  status: CampaignStatus;
  progress: number;
  when: string;
}

interface CampaignStats {
  total: number;
  sending: number;
  completed: number;
  scheduled: number;
  failed: number;
  messages_sent: number;
}

interface CampaignResponse {
  items: AdminCampaign[];
  stats: CampaignStats;
}

const cardBase = 'bg-white border rounded-[11px] p-4';

// ── table columns ─────────────────────────────────────────────────────────────
const columns: Column<AdminCampaign>[] = [
  {
    key: 'name',
    label: 'Campaign',
    render: (row) => (
      <div className="min-w-0">
        <div className="text-[12.5px] font-bold text-navy leading-snug">{row.name}</div>
        <div className="text-[10.5px] text-text-muted">{row.account_name}</div>
      </div>
    ),
  },
  {
    key: 'channel',
    label: 'Channel',
    render: (row) => <StatusBadge domain="channel" status={row.channel} />,
  },
  {
    key: 'audience',
    label: 'Audience',
    align: 'right',
    render: (row) => (
      <span className="font-mono text-[12px] text-text-md">
        {row.audience.toLocaleString()}
      </span>
    ),
  },
  {
    key: 'delivered',
    label: 'Delivered',
    align: 'right',
    render: (row) => (
      <span className="font-mono text-[12px] text-text-md">
        {row.delivered.toLocaleString()}
        <span className="text-text-muted">/{row.sent.toLocaleString()}</span>
      </span>
    ),
  },
  {
    key: 'status',
    label: 'Status',
    render: (row) => <StatusBadge domain="campaign" status={row.status} />,
  },
  {
    key: 'progress',
    label: 'Progress',
    render: (row) => {
      const isActive = row.status === 'sending';
      const barColor =
        row.status === 'sending'
          ? '#00D4AA'
          : row.status === 'completed'
            ? '#10B981'
            : '#F59E0B';
      return (
        <div className="flex items-center gap-2">
          <div
            className="rounded-full overflow-hidden flex-shrink-0"
            style={{ width: 72, height: 5, background: '#F7F8FC' }}
          >
            <div
              className={`h-full rounded-full ${isActive ? 'animate-pulse' : ''}`}
              style={{ width: `${row.progress}%`, background: barColor }}
            />
          </div>
          <span className="text-[10.5px] font-mono text-text-muted">{row.progress}%</span>
        </div>
      );
    },
  },
  {
    key: 'action',
    label: '',
    align: 'right',
    render: (row) => (
      <Link
        href={`/admin/accounts/${row.account_id}`}
        aria-label={`View ${row.account_name} — owner of ${row.name}`}
        className="inline-block text-[11px] rounded-[5px] border bg-transparent font-semibold text-text-muted px-2 py-1 hover:border-teal hover:text-navy transition-colors"
      >
        Account →
      </Link>
    ),
  },
];

// ── status filter options ─────────────────────────────────────────────────────
type StatusFilter = '' | CampaignStatus;

const FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: '',           label: 'All'       },
  { value: 'sending',   label: 'Sending'   },
  { value: 'completed', label: 'Completed' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'failed',    label: 'Failed'    },
];

// ── page ──────────────────────────────────────────────────────────────────────
export default function CampaignsPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('');

  const { data, isLoading, isError, error, refetch } = useApiQuery(
    ['admin', 'campaigns', statusFilter],
    () => {
      const qs = new URLSearchParams({ limit: '200' });
      if (statusFilter) qs.set('status_filter', statusFilter);
      return api<CampaignResponse>(`/admin/campaigns?${qs.toString()}`, {
        auth: true,
      });
    },
  );

  const items = data?.items ?? [];
  const stats = data?.stats ?? null;
  const loading = isLoading;

  useEffect(() => {
    if (error) toast.error('Failed to load campaigns');
  }, [error]);

  return (
    <>
      <Topbar
        title="Campaigns"
        subtitle="Platform-wide campaign activity"
        showPeriod={false}
      />

      <div className="p-[18px]">
        {/* KPI row */}
        <RevealGroup className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-[18px]">
          <RevealItem lift>
            <StatCard
              label="SENDING NOW"
              value={stats?.sending ?? 0}
              valueSize={30}
              change="Active dispatches"
              changeType="up"
              icon={Zap}
            />
          </RevealItem>
          <RevealItem lift>
            <StatCard
              label="COMPLETED"
              value={stats?.completed ?? 0}
              valueSize={30}
              change="Finished campaigns"
              changeType="up"
              icon={CheckCircle2}
            />
          </RevealItem>
          <RevealItem lift>
            <StatCard
              label="SCHEDULED"
              value={stats?.scheduled ?? 0}
              valueSize={30}
              change="Queued for future send"
              changeType="up"
              icon={Calendar}
            />
          </RevealItem>
          <RevealItem lift>
            <StatCard
              label="MESSAGES DISPATCHED"
              value={stats?.messages_sent ?? 0}
              valueSize={20}
              change="Total sent this period"
              changeType="up"
              icon={Send}
            />
          </RevealItem>
        </RevealGroup>

        {/* Main DataTable */}
        <Reveal delay={0.15} lift className={`${cardBase} mb-[18px]`}>
          <div className="flex items-center justify-between mb-0.5">
            <div className="font-display text-[14px] font-bold text-navy">All campaigns</div>
          </div>

          {/* sub-header: count + status filter */}
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="text-[11px] text-text-muted">
              {loading
                ? '—'
                : `${items.length} campaign${items.length !== 1 ? 's' : ''} · platform-wide`}
            </div>
            <div className="flex items-center gap-1" role="group" aria-label="Filter by status">
              {FILTER_OPTIONS.map((opt) => (
                <button
                  key={opt.value || 'all'}
                  onClick={() => setStatusFilter(opt.value)}
                  className="px-2.5 py-[5px] rounded-[5px] text-[10.5px] font-semibold transition-colors border"
                  style={
                    statusFilter === opt.value
                      ? { background: 'var(--navy)', color: 'white', borderColor: 'var(--navy)' }
                      : { background: 'transparent', color: 'var(--text-muted)', borderColor: 'var(--border)' }
                  }
                  aria-pressed={statusFilter === opt.value}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {loading || isError ? (
            <DataState
              loading={loading}
              error={isError ? error : undefined}
              onRetry={() => refetch()}
              loadingLabel="Loading campaigns…"
            />
          ) : (
            <DataTable<AdminCampaign>
              columns={columns}
              rows={items}
              rowKey={(row) => row.id}
              stagger={0.04}
              baseDelay={0.1}
              empty="No campaigns found"
            />
          )}
        </Reveal>

        {/* Live activity ticker */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Reveal delay={0.3} lift className={cardBase}>
            <LiveTicker />
          </Reveal>
        </div>
      </div>
    </>
  );
}
