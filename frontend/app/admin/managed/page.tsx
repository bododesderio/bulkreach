'use client';

import { FileText, Zap, TrendingUp, Users } from 'lucide-react';
import { toast } from 'sonner';
import Topbar from '@/components/admin/Topbar';
import DemoBadge from '@/components/admin/DemoBadge';
import { RevealGroup, RevealItem, Reveal } from '@/components/admin/Reveal';
import StatCard from '@/components/admin/StatCard';
import { StatusPill } from '@/components/admin/StatusPill';
import {
  seedManagedPipeline,
  type ManagedStage,
  type Channel,
} from '@/lib/seed-data';

const cardBase = 'bg-white border rounded-[11px] p-4';

/* ── Stage config ───────────────────────────────────────────────────────── */
const STAGE_CFG: Record<
  ManagedStage,
  { label: string; color: string; pulse: boolean; action: string }
> = {
  brief:       { label: 'Brief',       color: '#9CA3AF', pulse: false, action: 'Review'       },
  copy_review: { label: 'Copy review', color: '#F59E0B', pulse: false, action: 'Approve copy' },
  payment:     { label: 'Payment',     color: '#00D4AA', pulse: false, action: 'Approve'       },
  scheduled:   { label: 'Scheduled',   color: '#6366F1', pulse: false, action: 'Open'          },
  sending:     { label: 'Sending',     color: '#10B981', pulse: true,  action: 'Open'          },
};

/* ── Channel badge config ───────────────────────────────────────────────── */
const CHANNEL_CFG: Record<Channel, { label: string; color: string; bg: string }> = {
  sms:   { label: 'SMS',         color: '#1B1F4A', bg: 'rgba(27,31,74,0.08)'      },
  email: { label: 'Email',       color: '#009980', bg: 'rgba(0,212,170,0.12)'      },
  both:  { label: 'SMS + Email', color: '#6366F1', bg: 'rgba(99,102,241,0.10)'     },
};

/* ── Stage order for the kanban-ish layout ──────────────────────────────── */
const STAGE_ORDER: ManagedStage[] = [
  'brief', 'copy_review', 'payment', 'scheduled', 'sending',
];

/* ── Pre-computed stats ─────────────────────────────────────────────────── */
const pendingCount    = seedManagedPipeline.filter(
  (m) => m.stage === 'brief' || m.stage === 'copy_review',
).length; // 2
const inFlightCount   = seedManagedPipeline.filter(
  (m) => m.stage === 'scheduled' || m.stage === 'sending',
).length; // 2
const pipelineValue   = seedManagedPipeline.reduce((s, m) => s + m.value_ugx, 0); // 4_880_000
const pipelineM       = parseFloat((pipelineValue / 1_000_000).toFixed(1));       // 4.9
const contactsQueued  = seedManagedPipeline.reduce((s, m) => s + m.contacts, 0);  // 65_400

/* ── Items sorted by stage order with incremental reveal delay ──────────── */
const pipelineOrdered = STAGE_ORDER.flatMap((stage) =>
  seedManagedPipeline.filter((m) => m.stage === stage),
).map((m, i) => ({ ...m, delay: i * 0.07 }));

/* ─────────────────────────────────────────────────────────────────────── */
export default function ManagedPage() {
  return (
    <>
      <Topbar
        title="Managed queue"
        subtitle="Full-service campaign pipeline"
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
              label="PENDING BRIEFS"
              value={pendingCount}
              icon={FileText}
              changeType="warn"
              change="Awaiting review"
              warn
            />
          </RevealItem>
          <RevealItem lift>
            <StatCard
              label="IN FLIGHT"
              value={inFlightCount}
              icon={Zap}
              sparklineKey="queue"
              change="Active campaigns"
              changeType="up"
            />
          </RevealItem>
          <RevealItem lift>
            <StatCard
              label="PIPELINE VALUE"
              value={pipelineM}
              decimals={1}
              prefix="UGX "
              suffix="M"
              valueSize={22}
              icon={TrendingUp}
              sparklineKey="revenue"
              change="Total in pipeline"
              changeType="up"
            />
          </RevealItem>
          <RevealItem lift>
            <StatCard
              label="CONTACTS QUEUED"
              value={contactsQueued}
              icon={Users}
              change="Across all stages"
              changeType="up"
            />
          </RevealItem>
        </RevealGroup>

        {/* Pipeline ops queue */}
        <Reveal delay={0.2} lift className={cardBase}>
          <div className="font-display text-[14px] font-bold text-navy mb-0.5">
            Campaign pipeline
          </div>
          <div className="text-[11px] text-text-muted mb-5">
            {seedManagedPipeline.length} campaigns &middot; ops queue by stage
          </div>

          {STAGE_ORDER.map((stage) => {
            const items = pipelineOrdered.filter((m) => m.stage === stage);
            if (items.length === 0) return null;
            const stageCfg = STAGE_CFG[stage];

            return (
              <div key={stage} className="mb-6 last:mb-0">
                {/* Stage header */}
                <div className="flex items-center gap-2 mb-3">
                  <StatusPill
                    label={stageCfg.label}
                    color={stageCfg.color}
                    pulse={stageCfg.pulse}
                  />
                  <span className="text-[11px] text-text-muted">
                    {items.length} item{items.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Pipeline item cards */}
                <RevealGroup className="flex flex-col gap-2">
                  {items.map((item) => {
                    const chCfg = CHANNEL_CFG[item.channel];
                    return (
                      <RevealItem key={item.id} lift delay={item.delay}>
                        <div
                          className="border rounded-[10px] p-4 flex items-start gap-3"
                          style={{ background: '#FAFBFE' }}
                        >
                          {/* Avatar */}
                          <div
                            className="flex-shrink-0 flex items-center justify-center rounded-full font-bold text-[13px]"
                            style={{
                              width: 38,
                              height: 38,
                              background: 'rgba(0,212,170,0.12)',
                              color: '#009980',
                            }}
                            aria-hidden="true"
                          >
                            {item.initials}
                          </div>

                          {/* Main body */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-3">
                              {/* Left: details */}
                              <div className="min-w-0">
                                <div
                                  className="font-semibold text-[13px] truncate"
                                  style={{ color: '#1B1F4A' }}
                                >
                                  {item.account}
                                </div>

                                {/* Channel + contacts row */}
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                  <span
                                    style={{
                                      background: chCfg.bg,
                                      color: chCfg.color,
                                      padding: '1px 7px',
                                      fontSize: '9px',
                                      fontWeight: 700,
                                      borderRadius: '9999px',
                                      letterSpacing: '0.04em',
                                      display: 'inline-block',
                                    }}
                                  >
                                    {chCfg.label}
                                  </span>
                                  <span className="text-[11px] font-mono text-text-muted">
                                    {item.contacts.toLocaleString()} contacts
                                  </span>
                                </div>

                                {/* Note */}
                                <div className="text-[11px] text-text-muted mt-1 leading-snug">
                                  {item.note}
                                </div>

                                {/* Meta: owner + deadline */}
                                <div className="flex items-center gap-4 mt-1.5 text-[10.5px] text-text-muted">
                                  <span>Owner: <span className="font-medium">{item.owner}</span></span>
                                  <span>Deadline: <span className="font-medium">{item.deadline}</span></span>
                                </div>
                              </div>

                              {/* Right: value + action */}
                              <div className="flex flex-col items-end gap-2.5 flex-shrink-0">
                                <span
                                  className="font-mono font-semibold text-[13px]"
                                  style={{ color: '#1B1F4A' }}
                                >
                                  UGX {item.value_ugx.toLocaleString()}
                                </span>
                                <button
                                  type="button"
                                  className="text-[11px] rounded-[5px] border bg-transparent font-semibold text-text-muted px-2 py-1 hover:border-teal hover:text-navy transition-colors"
                                  onClick={() =>
                                    toast.info(`${stageCfg.action}: ${item.account}`)
                                  }
                                >
                                  {stageCfg.action}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </RevealItem>
                    );
                  })}
                </RevealGroup>
              </div>
            );
          })}
        </Reveal>
      </div>
    </>
  );
}
