/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Info, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useApiQuery } from '@/lib/hooks';
import Topbar from '@/components/admin/Topbar';
import StatCard from '@/components/admin/StatCard';
import DataTable, { Column } from '@/components/admin/DataTable';
import { StatusBadge } from '@/components/ui';
import { RevealGroup, RevealItem, Reveal } from '@/components/admin/Reveal';

const cardBase = 'bg-white border rounded-[11px] p-4';

// ── types ─────────────────────────────────────────────────────────────────────
type Severity = 'info' | 'warn' | 'critical';

interface AuditEntry {
  id: string;
  actor_email: string;
  action: string;
  resource_type: string;
  resource_id: string;
  ip_address: string;
  severity: Severity;
  created_at: string;
}

interface AuditLogResponse {
  items: AuditEntry[];
  total: number;
}

// ── config ────────────────────────────────────────────────────────────────────
const FILTERS = ['All', 'Info', 'Warn', 'Critical'] as const;
type Filter = (typeof FILTERS)[number];

const SEVERITY_MAP: Record<Exclude<Filter, 'All'>, Severity> = {
  Info:     'info',
  Warn:     'warn',
  Critical: 'critical',
};

/** "account.suspend" → "Account suspend"  |  "plan_create" → "Plan create" */
const humanizeAction = (action: string) => {
  const spaced = action.replace(/[._]/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

const fmtDateTime = (iso: string) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
};

// ── table columns (stable — no component state refs) ─────────────────────────
const COLUMNS: Column<AuditEntry>[] = [
  {
    key: 'severity',
    label: 'Severity',
    render: (row) => <StatusBadge domain="severity" status={row.severity} />,
  },
  {
    key: 'actor',
    label: 'Actor',
    render: (row) => (
      <div>
        <div className="text-[12px] font-semibold text-navy">
          {row.actor_email || '—'}
        </div>
        <div className="text-[10.5px] text-text-muted">
          {row.resource_type || '—'}
        </div>
      </div>
    ),
  },
  {
    key: 'action',
    label: 'Action',
    render: (row) => (
      <span className="text-[12px] text-text-md">{humanizeAction(row.action)}</span>
    ),
  },
  {
    key: 'target',
    label: 'Target',
    render: (row) => {
      const parts = [row.resource_type, row.resource_id].filter(Boolean);
      return (
        <span className="text-[12px] text-text-muted">
          {parts.length > 0 ? parts.join(' ') : '—'}
        </span>
      );
    },
  },
  {
    key: 'ip',
    label: 'IP',
    render: (row) => (
      <span className="font-mono text-[11px] text-text-md">
        {row.ip_address || '—'}
      </span>
    ),
  },
  {
    key: 'when',
    label: 'When',
    render: (row) => (
      <span className="font-mono text-[11px] text-text-muted whitespace-nowrap">
        {fmtDateTime(row.created_at)}
      </span>
    ),
  },
];

// ── page ──────────────────────────────────────────────────────────────────────
export default function AuditLogPage() {
  const [filter, setFilter] = useState<Filter>('All');

  const { data, isLoading, error } = useApiQuery(
    ['admin', 'audit-log'],
    () => api<AuditLogResponse>('/admin/audit-log?limit=100', { auth: true }),
  );

  const items = useMemo(() => data?.items ?? [], [data]);
  const total = data?.total ?? 0;
  const loading = isLoading;

  useEffect(() => {
    if (error) toast.error('Failed to load audit log');
  }, [error]);

  const criticalCount = useMemo(
    () => items.filter((e) => e.severity === 'critical').length,
    [items],
  );
  const warnCount = useMemo(
    () => items.filter((e) => e.severity === 'warn').length,
    [items],
  );
  const infoCount = useMemo(
    () => items.filter((e) => e.severity === 'info').length,
    [items],
  );

  const filtered = useMemo(
    () =>
      filter === 'All'
        ? items
        : items.filter(
            (e) => e.severity === SEVERITY_MAP[filter as Exclude<Filter, 'All'>],
          ),
    [items, filter],
  );

  return (
    <>
      <Topbar
        title="Audit log"
        subtitle={`${total} recorded event${total !== 1 ? 's' : ''} · superadmin visibility`}
        showPeriod={false}
      />

      <div className="p-[18px]">
        {loading && (
          <div className="flex items-center justify-center py-16 text-[12px] text-text-muted">
            Loading audit log…
          </div>
        )}

        {!loading && (
          <>
            {/* KPI row */}
            <RevealGroup className="grid grid-cols-4 gap-3 mb-[18px]">
              <RevealItem lift>
                <StatCard
                  label="TOTAL EVENTS"
                  value={total}
                  icon={Activity}
                  change={`${items.length} loaded`}
                  changeType="up"
                />
              </RevealItem>
              <RevealItem lift>
                <StatCard
                  label="CRITICAL"
                  value={criticalCount}
                  icon={XCircle}
                  warn={criticalCount > 0}
                  changeType={criticalCount > 0 ? 'warn' : 'up'}
                  change="Needs attention"
                />
              </RevealItem>
              <RevealItem lift>
                <StatCard
                  label="WARNINGS"
                  value={warnCount}
                  icon={AlertTriangle}
                  changeType="warn"
                  change="Elevated severity"
                />
              </RevealItem>
              <RevealItem lift>
                <StatCard
                  label="INFO"
                  value={infoCount}
                  icon={Info}
                  change="Routine events"
                  changeType="up"
                />
              </RevealItem>
            </RevealGroup>

            {/* Activity trail */}
            <Reveal delay={0.2} lift className={cardBase}>
              <div className="font-display text-[14px] font-bold text-navy mb-0.5">
                Activity trail
              </div>
              <div className="text-[11px] text-text-muted mb-4">
                All platform events — {total} total · showing {items.length}
              </div>

              {/* Filter chips */}
              <div
                className="flex items-center gap-2 mb-4"
                role="group"
                aria-label="Filter by severity"
              >
                {FILTERS.map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    aria-pressed={filter === f}
                    className="text-[11px] rounded-full px-3 py-1 font-semibold transition-colors border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                    style={
                      filter === f
                        ? { background: '#1B1F4A', color: 'white', borderColor: '#1B1F4A' }
                        : { background: 'transparent', color: '#9CA3AF', borderColor: '#e5e7eb' }
                    }
                  >
                    {f}
                  </button>
                ))}
              </div>

              <DataTable<AuditEntry>
                columns={COLUMNS}
                rows={filtered}
                rowKey={(row) => row.id}
                stagger={0.03}
                baseDelay={0.05}
                empty="No events match this filter."
              />
            </Reveal>
          </>
        )}
      </div>
    </>
  );
}
