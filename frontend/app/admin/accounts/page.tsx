'use client';

import { useState, useMemo } from 'react';
import { Users, CheckCircle, Clock, AlertTriangle, Search } from 'lucide-react';
import { toast } from 'sonner';
import Topbar from '@/components/admin/Topbar';
import DemoBadge from '@/components/admin/DemoBadge';
import { RevealGroup, RevealItem, Reveal } from '@/components/admin/Reveal';
import StatCard from '@/components/admin/StatCard';
import DataTable, { Column } from '@/components/admin/DataTable';
import { StatusPill } from '@/components/admin/StatusPill';
import { seedAccounts, type AccountStatus, type PlanKey } from '@/lib/seed-data';

const cardBase = 'bg-white border rounded-[11px] p-4';

const PLAN_CFG: Record<PlanKey, { label: string; color: string; bg: string }> = {
  starter:  { label: 'Starter',  color: '#6B7280', bg: 'rgba(107,114,128,0.10)' },
  growth:   { label: 'Growth',   color: '#009980', bg: 'rgba(0,212,170,0.12)'   },
  business: { label: 'Business', color: '#1B1F4A', bg: 'rgba(27,31,74,0.09)'    },
  managed:  { label: 'Managed',  color: '#B45309', bg: 'rgba(245,158,11,0.10)'  },
};

const STATUS_CFG: Record<AccountStatus, { label: string; color: string; pulse: boolean }> = {
  active:    { label: 'Active',    color: '#10B981', pulse: true  },
  trial:     { label: 'Trial',     color: '#00D4AA', pulse: false },
  past_due:  { label: 'Past due',  color: '#F59E0B', pulse: false },
  suspended: { label: 'Suspended', color: '#9CA3AF', pulse: false },
};

type FilterStatus = AccountStatus | 'all';

const CHIPS: { label: string; value: FilterStatus }[] = [
  { label: 'All',       value: 'all'       },
  { label: 'Active',    value: 'active'    },
  { label: 'Trial',     value: 'trial'     },
  { label: 'Past due',  value: 'past_due'  },
  { label: 'Suspended', value: 'suspended' },
];

// Pre-computed counts (seed has 16 sample rows; headline figure is 127)
const totalActive  = seedAccounts.filter((a) => a.status === 'active').length;
const totalTrials  = seedAccounts.filter((a) => a.status === 'trial').length;
const totalPastDue = seedAccounts.filter((a) => a.status === 'past_due').length;

const TABLE_COLUMNS: Column<(typeof seedAccounts)[number]>[] = [
  {
    key: 'name',
    label: 'Account',
    render: (row) => (
      <div>
        <div className="font-semibold text-[12px]" style={{ color: '#1B1F4A' }}>
          {row.name}
        </div>
        <div className="text-[10.5px] text-text-muted mt-[1px]">
          {row.contact} &middot; {row.email}
        </div>
      </div>
    ),
  },
  { key: 'region', label: 'Region' },
  {
    key: 'plan',
    label: 'Plan',
    render: (row) => {
      const c = PLAN_CFG[row.plan];
      return (
        <span
          style={{
            background: c.bg,
            color: c.color,
            padding: '2px 9px',
            fontSize: '9.5px',
            fontWeight: 700,
            borderRadius: '9999px',
            display: 'inline-block',
            whiteSpace: 'nowrap',
            letterSpacing: '0.03em',
          }}
        >
          {c.label}
        </span>
      );
    },
  },
  {
    key: 'messages_month',
    label: 'Messages/mo',
    align: 'right',
    render: (row) => (
      <span className="font-mono">{row.messages_month.toLocaleString()}</span>
    ),
  },
  {
    key: 'mrr_ugx',
    label: 'MRR',
    align: 'right',
    render: (row) => (
      <span className="font-mono">
        {row.mrr_ugx > 0 ? `UGX ${row.mrr_ugx.toLocaleString()}` : '—'}
      </span>
    ),
  },
  {
    key: 'status',
    label: 'Status',
    render: (row) => {
      const c = STATUS_CFG[row.status];
      return <StatusPill label={c.label} color={c.color} pulse={c.pulse} />;
    },
  },
  {
    key: 'actions',
    label: '',
    align: 'right',
    render: (row) => (
      <button
        type="button"
        className="text-[11px] rounded-[5px] border bg-transparent font-semibold text-text-muted px-2 py-1 hover:border-teal hover:text-navy transition-colors"
        onClick={() => toast.info(`Viewing ${row.name}`)}
      >
        View
      </button>
    ),
  },
];

export default function AccountsPage() {
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [search, setSearch] = useState('');

  const rows = useMemo(() => {
    let out = [...seedAccounts];
    if (statusFilter !== 'all') out = out.filter((a) => a.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.contact.toLowerCase().includes(q) ||
          a.region.toLowerCase().includes(q),
      );
    }
    return out;
  }, [statusFilter, search]);

  return (
    <>
      <Topbar title="Accounts" subtitle="127 client organisations" showPeriod={false} />

      <div className="p-[18px]">
        <div className="flex items-center gap-2 mb-4">
          <DemoBadge />
        </div>

        {/* KPI row */}
        <RevealGroup className="grid grid-cols-4 gap-3 mb-[18px]">
          <RevealItem lift>
            <StatCard
              label="TOTAL CLIENTS"
              value={127}
              icon={Users}
              sparklineKey="clients"
              change="+8 this month"
              changeType="up"
            />
          </RevealItem>
          <RevealItem lift>
            <StatCard
              label="ACTIVE"
              value={totalActive}
              icon={CheckCircle}
              change="Subscribed"
              changeType="up"
            />
          </RevealItem>
          <RevealItem lift>
            <StatCard
              label="TRIALS"
              value={totalTrials}
              icon={Clock}
              change="14-day window"
              changeType="up"
            />
          </RevealItem>
          <RevealItem lift>
            <StatCard
              label="PAST DUE"
              value={totalPastDue}
              icon={AlertTriangle}
              warn
              changeType="warn"
              change="Needs attention"
            />
          </RevealItem>
        </RevealGroup>

        {/* Accounts table card */}
        <Reveal delay={0.2} lift className={cardBase}>
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="font-display text-[14px] font-bold text-navy mb-0.5">
                Client accounts
              </div>
              <div className="text-[11px] text-text-muted">
                Showing {rows.length} of 127 clients
              </div>
            </div>
          </div>

          {/* Search + status filter chips */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <div className="relative">
              <Search
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                placeholder="Search accounts…"
                className="input pl-7 h-[32px] text-[12px] w-[220px]"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search accounts"
              />
            </div>

            <div
              className="flex items-center gap-1.5 flex-wrap"
              role="group"
              aria-label="Filter by status"
            >
              {CHIPS.map((chip) => {
                const active = statusFilter === chip.value;
                return (
                  <button
                    key={chip.value}
                    type="button"
                    onClick={() => setStatusFilter(chip.value)}
                    aria-pressed={active}
                    className="text-[11px] rounded-full px-3 py-[4px] font-semibold border transition-colors"
                    style={
                      active
                        ? { background: '#1B1F4A', color: '#fff',     borderColor: '#1B1F4A'      }
                        : { background: 'transparent', color: '#9CA3AF', borderColor: 'var(--border)' }
                    }
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
          </div>

          <DataTable
            columns={TABLE_COLUMNS}
            rows={rows}
            rowKey={(row) => row.id}
            empty={
              <span className="text-text-muted">No accounts match your filter.</span>
            }
          />
        </Reveal>
      </div>
    </>
  );
}
