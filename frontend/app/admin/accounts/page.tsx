/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users, CheckCircle, Clock, Ban, Search, LogIn } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/store/auth';
import Topbar from '@/components/admin/Topbar';
import { RevealGroup, RevealItem, Reveal } from '@/components/admin/Reveal';
import StatCard from '@/components/admin/StatCard';
import DataTable, { Column } from '@/components/admin/DataTable';
import { StatusPill } from '@/components/admin/StatusPill';

const cardBase = 'bg-white border rounded-[11px] p-4';

// ── types ─────────────────────────────────────────────────────────────────────
type AccountStatus = 'active' | 'trial' | 'past_due' | 'suspended';

interface AdminAccount {
  id: string;
  name: string;
  email: string;
  plan: string;
  status: AccountStatus;
  is_active: boolean;
  joined: string;
  messages_month: number;
  mrr_ugx: number;
}

interface AccountStats {
  total: number;
  active: number;
  trial: number;
  suspended: number;
  mrr_ugx: number;
}

interface AccountsResponse {
  items: AdminAccount[];
  stats: AccountStats;
}

interface ImpersonateResponse {
  access_token: string;
  account_name: string;
  owner_email: string;
}

// ── config ────────────────────────────────────────────────────────────────────
const STATUS_CFG: Record<string, { label: string; color: string; pulse: boolean }> = {
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
  { label: 'Suspended', value: 'suspended' },
];

const fmtDate = (iso: string) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch {
    return '—';
  }
};

// ── page ──────────────────────────────────────────────────────────────────────
export default function AccountsPage() {
  const router = useRouter();
  const startImpersonation = useAuth((s) => s.startImpersonation);
  const [items, setItems]               = useState<AdminAccount[]>([]);
  const [stats, setStats]               = useState<AccountStats | null>(null);
  const [loading, setLoading]           = useState(true);
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [search, setSearch]             = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<AccountsResponse>('/admin/accounts?limit=200', { auth: true });
      setItems(data.items);
      setStats(data.stats);
    } catch {
      toast.error('Failed to load accounts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSuspend = useCallback(async (row: AdminAccount) => {
    if (!window.confirm(`Suspend "${row.name}"? They will lose access immediately.`)) return;
    setActionPending(row.id);
    try {
      const updated = await api<AdminAccount>(`/admin/accounts/${row.id}/suspend`, {
        method: 'POST',
        auth: true,
      });
      setItems((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      toast.success(`${row.name} suspended`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to suspend account');
    } finally {
      setActionPending(null);
    }
  }, []);

  const handleActivate = useCallback(async (row: AdminAccount) => {
    setActionPending(row.id);
    try {
      const updated = await api<AdminAccount>(`/admin/accounts/${row.id}/activate`, {
        method: 'POST',
        auth: true,
      });
      setItems((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      toast.success(`${row.name} activated`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to activate account');
    } finally {
      setActionPending(null);
    }
  }, []);

  const handleImpersonate = useCallback(async (row: AdminAccount) => {
    if (row.status === 'suspended') {
      toast.error('Reactivate the account before logging in as it.');
      return;
    }
    if (!window.confirm(
      `Log in as "${row.name}"? You'll act as this account for 30 minutes. Every action is audited.`
    )) return;
    setActionPending(row.id);
    try {
      const res = await api<ImpersonateResponse>(`/admin/accounts/${row.id}/impersonate`, {
        method: 'POST',
        auth: true,
      });
      await startImpersonation(res.access_token);
      toast.success(`Now viewing ${res.account_name}`);
      router.push('/dashboard');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to start session');
      setActionPending(null);
    }
  }, [router, startImpersonation]);

  const rows = useMemo(() => {
    let out = [...items];
    if (statusFilter !== 'all') out = out.filter((a) => a.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.email.toLowerCase().includes(q) ||
          a.plan.toLowerCase().includes(q),
      );
    }
    return out;
  }, [items, statusFilter, search]);

  const columns: Column<AdminAccount>[] = useMemo(
    () => [
      {
        key: 'name',
        label: 'Account',
        render: (row) => (
          <div>
            <div className="font-semibold text-[12px]" style={{ color: '#1B1F4A' }}>
              {row.name}
            </div>
            <div className="text-[10.5px] text-text-muted mt-[1px]">{row.email}</div>
          </div>
        ),
      },
      {
        key: 'plan',
        label: 'Plan',
        render: (row) => (
          <span
            style={{
              background: 'rgba(27,31,74,0.09)',
              color: '#1B1F4A',
              padding: '2px 9px',
              fontSize: '9.5px',
              fontWeight: 700,
              borderRadius: '9999px',
              display: 'inline-block',
              whiteSpace: 'nowrap',
              letterSpacing: '0.03em',
            }}
          >
            {row.plan || '—'}
          </span>
        ),
      },
      {
        key: 'joined',
        label: 'Joined',
        render: (row) => (
          <span className="text-[11px] text-text-muted whitespace-nowrap">
            {fmtDate(row.joined)}
          </span>
        ),
      },
      {
        key: 'messages_month',
        label: 'Messages/mo',
        align: 'right',
        render: (row) => (
          <span className="font-mono text-[12px]">{row.messages_month.toLocaleString()}</span>
        ),
      },
      {
        key: 'mrr_ugx',
        label: 'MRR',
        align: 'right',
        render: (row) => (
          <span className="font-mono text-[12px]">
            {row.mrr_ugx > 0 ? `UGX ${row.mrr_ugx.toLocaleString()}` : '—'}
          </span>
        ),
      },
      {
        key: 'status',
        label: 'Status',
        render: (row) => {
          const c = STATUS_CFG[row.status] ?? {
            label: row.status,
            color: '#9CA3AF',
            pulse: false,
          };
          return <StatusPill label={c.label} color={c.color} pulse={c.pulse} />;
        },
      },
      {
        key: 'actions',
        label: '',
        align: 'right',
        render: (row) => {
          const busy = actionPending === row.id;
          return (
            <div className="flex items-center justify-end gap-1.5">
              {row.status !== 'suspended' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleImpersonate(row)}
                  className="inline-flex items-center gap-1 text-[11px] rounded-[5px] border font-semibold px-2 py-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ color: '#1B1F4A', borderColor: 'var(--border)', background: 'transparent' }}
                  aria-label={`Log in as ${row.name}`}
                >
                  <LogIn size={12} aria-hidden="true" />
                  {busy ? '…' : 'Log in as'}
                </button>
              )}
              {row.status === 'active' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleSuspend(row)}
                  className="text-[11px] rounded-[5px] border font-semibold px-2 py-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ color: '#EF4444', borderColor: '#EF4444', background: 'transparent' }}
                  aria-label={`Suspend ${row.name}`}
                >
                  {busy ? '…' : 'Suspend'}
                </button>
              )}
              {row.status === 'suspended' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleActivate(row)}
                  className="text-[11px] rounded-[5px] border font-semibold px-2 py-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ color: '#10B981', borderColor: '#10B981', background: 'transparent' }}
                  aria-label={`Activate ${row.name}`}
                >
                  {busy ? '…' : 'Activate'}
                </button>
              )}
            </div>
          );
        },
      },
    ],
    [actionPending, handleSuspend, handleActivate, handleImpersonate],
  );

  return (
    <>
      <Topbar
        title="Accounts"
        subtitle={
          stats ? `${stats.total} client organisation${stats.total !== 1 ? 's' : ''}` : 'Client organisations'
        }
        showPeriod={false}
      />

      <div className="p-[18px]">
        {loading && (
          <div className="flex items-center justify-center py-16 text-[12px] text-text-muted">
            Loading accounts…
          </div>
        )}

        {!loading && stats && (
          <>
            {/* KPI row */}
            <RevealGroup className="grid grid-cols-4 gap-3 mb-[18px]">
              <RevealItem lift>
                <StatCard
                  label="TOTAL CLIENTS"
                  value={stats.total}
                  icon={Users}
                  sparklineKey="clients"
                  change="All organisations"
                  changeType="up"
                />
              </RevealItem>
              <RevealItem lift>
                <StatCard
                  label="ACTIVE"
                  value={stats.active}
                  icon={CheckCircle}
                  change="Subscribed"
                  changeType="up"
                />
              </RevealItem>
              <RevealItem lift>
                <StatCard
                  label="TRIALS"
                  value={stats.trial}
                  icon={Clock}
                  change="14-day window"
                  changeType="up"
                />
              </RevealItem>
              <RevealItem lift>
                <StatCard
                  label="SUSPENDED"
                  value={stats.suspended}
                  icon={Ban}
                  warn={stats.suspended > 0}
                  changeType={stats.suspended > 0 ? 'warn' : 'up'}
                  change="Access revoked"
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
                    Showing {rows.length} of {stats.total} client{stats.total !== 1 ? 's' : ''}
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
                            ? { background: '#1B1F4A', color: '#fff', borderColor: '#1B1F4A' }
                            : { background: 'transparent', color: '#9CA3AF', borderColor: 'var(--border)' }
                        }
                      >
                        {chip.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <DataTable<AdminAccount>
                columns={columns}
                rows={rows}
                rowKey={(row) => row.id}
                stagger={0.03}
                baseDelay={0.08}
                empty={
                  <span className="text-text-muted">No accounts match your filter.</span>
                }
              />
            </Reveal>
          </>
        )}

        {!loading && !stats && (
          <div className="py-16 text-center text-[12px] text-text-muted">
            No account data available.
          </div>
        )}
      </div>
    </>
  );
}
