'use client';

import { toast } from 'sonner';
import { Database, HardDrive, Archive, Users, Download } from 'lucide-react';
import Topbar from '@/components/admin/Topbar';
import DemoBadge from '@/components/admin/DemoBadge';
import StatCard from '@/components/admin/StatCard';
import DataTable, { Column } from '@/components/admin/DataTable';
import { StatusPill } from '@/components/admin/StatusPill';
import { RevealGroup, RevealItem, Reveal } from '@/components/admin/Reveal';
import {
  seedArchiveStats,
  seedArchiveRetention,
  seedArchiveExports,
} from '@/lib/seed-data';

const cardBase = 'bg-white border rounded-[11px] p-4';

type RetentionRow = (typeof seedArchiveRetention)[number];
type ExportRow = (typeof seedArchiveExports)[number];
type RetentionState = RetentionRow['state'];
type ExportStatus = ExportRow['status'];

const stateColor: Record<RetentionState, string> = {
  hot: '#10B981',
  warm: '#F59E0B',
  glacier: '#6366F1',
  purged: '#9CA3AF',
};

const exportStatusColor: Record<ExportStatus, string> = {
  ready: '#10B981',
  processing: '#F59E0B',
  archived: '#9CA3AF',
};

const maxEvents = Math.max(...seedArchiveRetention.map((r) => r.events));

const retentionColumns: Column<RetentionRow>[] = [
  {
    key: 'period',
    label: 'Period',
    render: (row) => (
      <span className="text-[12px] font-semibold text-navy">{row.period}</span>
    ),
  },
  {
    key: 'events',
    label: 'Events',
    align: 'right',
    render: (row) => (
      <span className="font-mono text-[11px] text-text-md">
        {row.events === 0 ? '—' : row.events.toLocaleString()}
      </span>
    ),
  },
  {
    key: 'size_gb',
    label: 'Size',
    align: 'right',
    render: (row) => (
      <span className="font-mono text-[11px] text-text-md">
        {row.size_gb === 0 ? '—' : `${row.size_gb} GB`}
      </span>
    ),
  },
  {
    key: 'bar',
    label: 'Volume',
    render: (row) => (
      <div className="w-32 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.06)' }}>
        <div
          className="h-full rounded-full"
          style={{
            width: maxEvents > 0 ? `${(row.events / maxEvents) * 100}%` : '0%',
            background: stateColor[row.state],
            minWidth: row.events > 0 ? '4px' : '0',
          }}
        />
      </div>
    ),
  },
  {
    key: 'state',
    label: 'State',
    render: (row) => (
      <StatusPill
        label={row.state}
        color={stateColor[row.state]}
        pulse={row.state === 'hot'}
      />
    ),
  },
];

const exportColumns: Column<ExportRow>[] = [
  {
    key: 'range',
    label: 'Range',
    render: (row) => (
      <span className="text-[12px] font-semibold text-navy">{row.range}</span>
    ),
  },
  {
    key: 'format',
    label: 'Format',
    render: (row) => (
      <span
        className="inline-flex items-center rounded-[4px] px-2 py-0.5 font-mono text-[10px] font-bold"
        style={{
          background:
            row.format === 'Parquet'
              ? 'rgba(99,102,241,0.1)'
              : 'rgba(0,212,170,0.1)',
          color: row.format === 'Parquet' ? '#6366F1' : '#00D4AA',
        }}
      >
        {row.format}
      </span>
    ),
  },
  {
    key: 'size_gb',
    label: 'Size',
    align: 'right',
    render: (row) => (
      <span className="font-mono text-[11px] text-text-md">{row.size_gb} GB</span>
    ),
  },
  {
    key: 'status',
    label: 'Status',
    render: (row) => (
      <StatusPill
        label={row.status}
        color={exportStatusColor[row.status]}
        pulse={row.status === 'processing'}
      />
    ),
  },
  {
    key: 'when',
    label: 'When',
    render: (row) => (
      <span className="font-mono text-[11px] text-text-muted">{row.when}</span>
    ),
  },
  {
    key: 'action',
    label: '',
    align: 'right',
    render: (row) => (
      <button
        onClick={() =>
          row.status === 'ready'
            ? toast.success(`Downloading ${row.range}`)
            : toast.info('Export not yet ready')
        }
        className="text-[11px] rounded-[5px] border bg-transparent font-semibold text-text-muted px-2 py-1 hover:border-teal hover:text-navy transition-colors inline-flex items-center gap-1"
        aria-label={`Download ${row.range}`}
      >
        <Download size={11} />
        Download
      </button>
    ),
  },
];

export default function ArchivePage() {
  return (
    <>
      <Topbar
        title="Data archive"
        subtitle="Retention · glacier storage · export jobs"
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
              label="Total events"
              value={14.24}
              decimals={2}
              suffix="M"
              icon={Database}
              change={`${seedArchiveStats.retention_months}-month retention policy`}
              changeType="up"
            />
          </RevealItem>
          <RevealItem lift>
            <StatCard
              label="Hot storage"
              value={seedArchiveStats.storage_gb}
              decimals={1}
              suffix=" GB"
              icon={HardDrive}
              change="Live + warm tiers"
              changeType="up"
            />
          </RevealItem>
          <RevealItem lift>
            <StatCard
              label="Glacier"
              value={seedArchiveStats.glacier_gb}
              decimals={1}
              suffix=" GB"
              icon={Archive}
              change="Cold archive tier"
              changeType="up"
            />
          </RevealItem>
          <RevealItem lift>
            <StatCard
              label="Anonymised contacts"
              value={seedArchiveStats.anonymised_contacts}
              icon={Users}
              change="Hashed on schedule"
              changeType="up"
            />
          </RevealItem>
        </RevealGroup>

        {/* Retention lifecycle */}
        <Reveal delay={0.15} lift className={`${cardBase} mb-[18px]`}>
          <div className="font-display text-[14px] font-bold text-navy mb-0.5">
            Retention lifecycle · 24-month policy
          </div>
          <div className="text-[11px] text-text-muted mb-4">
            Data flows Hot → Warm → Glacier → Purged automatically per Section 18
          </div>

          {/* Lifecycle legend */}
          <div className="flex items-center gap-4 mb-4 flex-wrap">
            {(['hot', 'warm', 'glacier', 'purged'] as RetentionState[]).map((s) => (
              <div key={s} className="flex items-center gap-1.5">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full"
                  style={{ background: stateColor[s] }}
                />
                <span className="text-[10.5px] font-semibold text-text-muted capitalize">{s}</span>
              </div>
            ))}
          </div>

          <DataTable
            columns={retentionColumns}
            rows={seedArchiveRetention}
            rowKey={(row) => row.period}
          />

          <p className="text-[10.5px] text-text-muted mt-4 border-t pt-3">
            Retention &amp; anonymisation run automatically per the 24-month policy (Section 18).
          </p>
        </Reveal>

        {/* Export jobs */}
        <Reveal delay={0.3} lift className={cardBase}>
          <div className="font-display text-[14px] font-bold text-navy mb-0.5">Export jobs</div>
          <div className="text-[11px] text-text-muted mb-4">
            {seedArchiveExports.length} jobs · Parquet and CSV formats
          </div>
          <DataTable
            columns={exportColumns}
            rows={seedArchiveExports}
            rowKey={(row) => row.id}
          />
        </Reveal>
      </div>
    </>
  );
}
