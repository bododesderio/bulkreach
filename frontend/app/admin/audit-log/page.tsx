'use client';

import { useState } from 'react';
import { Activity, Shield, Cpu, AlertTriangle } from 'lucide-react';
import Topbar from '@/components/admin/Topbar';
import DemoBadge from '@/components/admin/DemoBadge';
import StatCard from '@/components/admin/StatCard';
import DataTable, { Column } from '@/components/admin/DataTable';
import { StatusPill } from '@/components/admin/StatusPill';
import { RevealGroup, RevealItem, Reveal } from '@/components/admin/Reveal';
import { seedAuditLog, type Severity } from '@/lib/seed-data';

const cardBase = 'bg-white border rounded-[11px] p-4';

const FILTERS = ['All', 'Info', 'Warn', 'Critical'] as const;
type Filter = (typeof FILTERS)[number];

const severityMap: Record<Exclude<Filter, 'All'>, Severity> = {
  Info: 'info',
  Warn: 'warn',
  Critical: 'critical',
};

const severityColor: Record<Severity, string> = {
  info: '#00D4AA',
  warn: '#F59E0B',
  critical: '#EF4444',
};

const adminActionsCount = seedAuditLog.filter(
  (e) => e.role === 'superadmin' || e.role === 'admin',
).length;
const systemEventsCount = seedAuditLog.filter((e) => e.role === 'worker').length;
const criticalCount = seedAuditLog.filter((e) => e.severity === 'critical').length;

type AuditEntry = (typeof seedAuditLog)[number];

const columns: Column<AuditEntry>[] = [
  {
    key: 'severity',
    label: 'Severity',
    render: (row) => (
      <StatusPill
        label={row.severity}
        color={severityColor[row.severity]}
        pulse={row.severity === 'critical'}
      />
    ),
  },
  {
    key: 'actor',
    label: 'Actor',
    render: (row) => (
      <div>
        <div className="text-[12px] font-semibold text-navy">{row.actor}</div>
        <div className="text-[10.5px] text-text-muted">{row.role}</div>
      </div>
    ),
  },
  {
    key: 'action',
    label: 'Action',
    render: (row) => (
      <span className="text-[12px] text-text-md">{row.action}</span>
    ),
  },
  {
    key: 'target',
    label: 'Target',
    render: (row) => (
      <span className="text-[12px] text-text-muted">{row.target}</span>
    ),
  },
  {
    key: 'ip',
    label: 'IP',
    render: (row) => (
      <span className="font-mono text-[11px] text-text-md">{row.ip}</span>
    ),
  },
  {
    key: 'when',
    label: 'When',
    render: (row) => (
      <span className="font-mono text-[11px] text-text-muted">{row.when}</span>
    ),
  },
];

export default function AuditLogPage() {
  const [filter, setFilter] = useState<Filter>('All');

  const filtered =
    filter === 'All'
      ? seedAuditLog
      : seedAuditLog.filter((e) => e.severity === severityMap[filter as Exclude<Filter, 'All'>]);

  return (
    <>
      <Topbar
        title="Audit log"
        subtitle={`${seedAuditLog.length} recorded events · superadmin visibility`}
        showPeriod={false}
      />

      <div className="p-[18px]">
        <div className="flex items-center gap-2 mb-4">
          <DemoBadge />
        </div>

        {/* KPI row */}
        <RevealGroup className="grid grid-cols-4 gap-3 mb-[18px]">
          <RevealItem lift>
            <StatCard
              label="Events today"
              value={342}
              icon={Activity}
              change="Last 24 hours"
              changeType="up"
            />
          </RevealItem>
          <RevealItem lift>
            <StatCard
              label="Admin actions"
              value={adminActionsCount}
              icon={Shield}
              change="Superadmin + admin"
              changeType="up"
            />
          </RevealItem>
          <RevealItem lift>
            <StatCard
              label="System events"
              value={systemEventsCount}
              icon={Cpu}
              change="Background workers"
              changeType="up"
            />
          </RevealItem>
          <RevealItem lift>
            <StatCard
              label="Critical"
              value={criticalCount}
              icon={AlertTriangle}
              change="Needs attention"
              changeType="warn"
              warn={criticalCount > 0}
            />
          </RevealItem>
        </RevealGroup>

        {/* Activity trail */}
        <Reveal delay={0.2} lift className={cardBase}>
          <div className="font-display text-[14px] font-bold text-navy mb-0.5">
            Activity trail
          </div>
          <div className="text-[11px] text-text-muted mb-4">
            All platform events — superadmin, admin, and system workers
          </div>

          {/* Filter chips */}
          <div className="flex items-center gap-2 mb-4" role="group" aria-label="Filter by severity">
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

          <DataTable
            columns={columns}
            rows={filtered}
            rowKey={(row) => row.id}
            empty="No events match this filter."
          />
        </Reveal>
      </div>
    </>
  );
}
