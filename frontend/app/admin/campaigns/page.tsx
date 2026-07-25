'use client';

import { Zap, CheckCircle2, Calendar, Send } from 'lucide-react';
import { toast } from 'sonner';
import Topbar from '@/components/admin/Topbar';
import DemoBadge from '@/components/admin/DemoBadge';
import StatCard from '@/components/admin/StatCard';
import { Reveal, RevealGroup, RevealItem } from '@/components/admin/Reveal';
import DataTable, { Column } from '@/components/admin/DataTable';
import LiveTicker from '@/components/admin/LiveTicker';
import { StatusPill } from '@/components/admin/StatusPill';
import {
  seedAdminCampaigns,
  type CampaignStatus,
  type Channel,
} from '@/lib/seed-data';

const cardBase = 'bg-white border rounded-[11px] p-4';

// ── derived stats ─────────────────────────────────────────────────────────────
const sendingNow = seedAdminCampaigns.filter((c) => c.status === 'sending').length;
const completedToday = seedAdminCampaigns.filter(
  (c) => c.status === 'completed' && c.when.startsWith('2026-07-25'),
).length;
const scheduled = seedAdminCampaigns.filter((c) => c.status === 'scheduled').length;
const totalDispatched = seedAdminCampaigns.reduce((s, c) => s + c.sent, 0);

// ── status config ─────────────────────────────────────────────────────────────
const CAMPAIGN_STATUS: Record<CampaignStatus, { label: string; color: string; pulse: boolean }> = {
  sending: { label: 'Sending', color: '#00D4AA', pulse: true },
  completed: { label: 'Completed', color: '#10B981', pulse: false },
  scheduled: { label: 'Scheduled', color: '#6366F1', pulse: false },
  queued: { label: 'Queued', color: '#9CA3AF', pulse: false },
  failed: { label: 'Failed', color: '#EF4444', pulse: false },
};

// ── channel badge config ──────────────────────────────────────────────────────
const CHANNEL_CFG: Record<Channel, { label: string; color: string; bg: string }> = {
  sms: { label: 'SMS', color: '#009980', bg: 'rgba(0,212,170,0.12)' },
  email: { label: 'Email', color: '#6366F1', bg: 'rgba(99,102,241,0.1)' },
  both: { label: 'SMS + Email', color: '#1B1F4A', bg: 'rgba(27,31,74,0.08)' },
};

// ── table column definitions ──────────────────────────────────────────────────
type AdminCampaign = (typeof seedAdminCampaigns)[number];

const columns: Column<AdminCampaign>[] = [
  {
    key: 'name',
    label: 'Campaign',
    render: (row) => (
      <div className="min-w-0">
        <div className="text-[12.5px] font-bold text-navy leading-snug">{row.name}</div>
        <div className="text-[10.5px] text-text-muted">{row.account}</div>
      </div>
    ),
  },
  {
    key: 'channel',
    label: 'Channel',
    render: (row) => {
      const c = CHANNEL_CFG[row.channel];
      return (
        <span
          className="inline-flex items-center rounded-full font-bold whitespace-nowrap"
          style={{ background: c.bg, color: c.color, padding: '2px 8px', fontSize: '9.5px' }}
        >
          {c.label}
        </span>
      );
    },
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
    render: (row) => {
      const s = CAMPAIGN_STATUS[row.status];
      return <StatusPill label={s.label} color={s.color} pulse={s.pulse} />;
    },
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
      <button
        onClick={() => toast(`${row.name} — opening details…`)}
        className="text-[11px] rounded-[5px] border bg-transparent font-semibold text-text-muted px-2 py-1 hover:border-teal hover:text-navy transition-colors"
      >
        Details
      </button>
    ),
  },
];

export default function CampaignsPage() {
  return (
    <>
      <Topbar
        title="Campaigns"
        subtitle="Platform-wide campaign activity"
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
              label="SENDING NOW"
              value={sendingNow}
              valueSize={30}
              change="Active dispatches"
              changeType="up"
              icon={Zap}
              sparklineKey="messages"
            />
          </RevealItem>
          <RevealItem lift>
            <StatCard
              label="COMPLETED TODAY"
              value={completedToday}
              valueSize={30}
              change="Finished since midnight"
              changeType="up"
              icon={CheckCircle2}
              sparklineKey="messages"
            />
          </RevealItem>
          <RevealItem lift>
            <StatCard
              label="SCHEDULED"
              value={scheduled}
              valueSize={30}
              change="Queued for future send"
              changeType="up"
              icon={Calendar}
            />
          </RevealItem>
          <RevealItem lift>
            <StatCard
              label="MESSAGES DISPATCHED"
              value={totalDispatched}
              valueSize={20}
              change="Total sent this period"
              changeType="up"
              icon={Send}
              sparklineKey="messages"
            />
          </RevealItem>
        </RevealGroup>

        {/* Main DataTable */}
        <Reveal delay={0.15} lift className={`${cardBase} mb-[18px]`}>
          <div className="font-display text-[14px] font-bold text-navy mb-0.5">
            All campaigns
          </div>
          <div className="text-[11px] text-text-muted mb-4">
            {seedAdminCampaigns.length} campaigns · platform-wide
          </div>
          <DataTable<AdminCampaign>
            columns={columns}
            rows={seedAdminCampaigns}
            rowKey={(row) => row.id}
            stagger={0.04}
            baseDelay={0.1}
            empty="No campaigns found"
          />
        </Reveal>

        {/* Live activity side card */}
        <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <Reveal delay={0.3} lift className={cardBase}>
            <LiveTicker />
          </Reveal>
        </div>
      </div>
    </>
  );
}
