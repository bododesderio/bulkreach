import type { Metadata } from 'next';
import { TrendingUp, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import Topbar from '@/components/admin/Topbar';
import DemoBadge from '@/components/admin/DemoBadge';
import { RevealGroup, RevealItem, Reveal } from '@/components/admin/Reveal';
import StatCard from '@/components/admin/StatCard';
import DataTable, { Column } from '@/components/admin/DataTable';
import { StatusPill } from '@/components/admin/StatusPill';
import {
  seedSubscriptions,
  seedRevenuePlans,
  type SubStatus,
  type PlanKey,
} from '@/lib/seed-data';

export const metadata: Metadata = { title: 'Subscriptions — BulkReach Admin' };

const cardBase = 'bg-white border rounded-[11px] p-4';

/* ── Derived stats ─────────────────────────────────────────────────────── */
const activeSubs  = seedSubscriptions.filter((s) => s.status === 'active');
const mrrTotal    = activeSubs.reduce((sum, s) => sum + s.mrr_ugx, 0);           // 1_900_000
const mrrMillions = parseFloat((mrrTotal / 1_000_000).toFixed(1));               // 1.9
const activeCount = activeSubs.length;                                            // 9
const trialCount  = seedSubscriptions.filter((s) => s.status === 'trial').length;   // 1
const pastDueCount = seedSubscriptions.filter((s) => s.status === 'past_due').length; // 1

/* ── Config maps ───────────────────────────────────────────────────────── */
const PLAN_CFG: Record<PlanKey, { label: string; color: string; bg: string }> = {
  starter:  { label: 'Starter',  color: '#6B7280', bg: 'rgba(107,114,128,0.10)' },
  growth:   { label: 'Growth',   color: '#009980', bg: 'rgba(0,212,170,0.12)'   },
  business: { label: 'Business', color: '#1B1F4A', bg: 'rgba(27,31,74,0.09)'    },
  managed:  { label: 'Managed',  color: '#B45309', bg: 'rgba(245,158,11,0.10)'  },
};

const STATUS_CFG: Record<SubStatus, { label: string; color: string; pulse: boolean }> = {
  active:    { label: 'Active',    color: '#10B981', pulse: true  },
  trial:     { label: 'Trial',     color: '#00D4AA', pulse: false },
  past_due:  { label: 'Past due',  color: '#F59E0B', pulse: false },
  cancelled: { label: 'Cancelled', color: '#9CA3AF', pulse: false },
};

/* ── Table columns (server-safe: no onClick handlers) ──────────────────── */
const SUBS_COLS: Column<(typeof seedSubscriptions)[number]>[] = [
  {
    key: 'account',
    label: 'Account',
    render: (row) => (
      <span className="font-semibold text-[12px]" style={{ color: '#1B1F4A' }}>
        {row.account}
      </span>
    ),
  },
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
    key: 'mrr_ugx',
    label: 'MRR',
    align: 'right',
    render: (row) => (
      <span className="font-mono">
        {row.mrr_ugx > 0 ? `UGX ${row.mrr_ugx.toLocaleString()}` : '—'}
      </span>
    ),
  },
  { key: 'seats', label: 'Seats', align: 'center' },
  { key: 'started', label: 'Started' },
  { key: 'renews',  label: 'Renews'  },
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
    render: () => (
      <button
        type="button"
        className="text-[11px] rounded-[5px] border bg-transparent font-semibold text-text-muted px-2 py-1 hover:border-teal hover:text-navy transition-colors"
      >
        Manage
      </button>
    ),
  },
];

/* ─────────────────────────────────────────────────────────────────────── */
export default function SubscriptionsPage() {
  return (
    <>
      <Topbar
        title="Subscriptions"
        subtitle="Billing lifecycle · plan distribution"
        showPeriod={false}
      />

      <div className="p-[18px]">
        {/* Bar-grow keyframe (server-rendered style tag, no globals.css change) */}
        <style>{`
          @keyframes planBarScale { from { transform: scaleX(0); } }
          .plan-bar { animation: planBarScale 0.7s cubic-bezier(0.4,0,0.2,1) both; }
        `}</style>

        <div className="flex items-center gap-2 mb-4">
          <DemoBadge />
        </div>

        {/* KPI row */}
        <RevealGroup className="grid grid-cols-4 gap-3 mb-[18px]">
          <RevealItem lift>
            <StatCard
              label="MRR (ACTIVE)"
              value={mrrMillions}
              decimals={1}
              prefix="UGX "
              suffix="M"
              valueSize={22}
              icon={TrendingUp}
              sparklineKey="revenue"
              change="Active subscriptions"
              changeType="up"
            />
          </RevealItem>
          <RevealItem lift>
            <StatCard
              label="ACTIVE SUBS"
              value={activeCount}
              icon={CheckCircle}
              change="Paying plans"
              changeType="up"
            />
          </RevealItem>
          <RevealItem lift>
            <StatCard
              label="TRIALS"
              value={trialCount}
              icon={Clock}
              change="14-day window"
              changeType="up"
            />
          </RevealItem>
          <RevealItem lift>
            <StatCard
              label="PAST DUE"
              value={pastDueCount}
              icon={AlertTriangle}
              warn
              changeType="warn"
              change="Needs attention"
            />
          </RevealItem>
        </RevealGroup>

        {/* Plan distribution (left) + subscriptions table (right) */}
        <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1.6fr' }}>

          {/* Plan distribution card */}
          <Reveal delay={0.15} lift className={cardBase}>
            <div className="font-display text-[14px] font-bold text-navy mb-0.5">
              Plan distribution
            </div>
            <div className="text-[11px] text-text-muted mb-5">By account count</div>

            <div className="flex flex-col gap-5">
              {seedRevenuePlans.map((plan, i) => (
                <div key={plan.name}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[12px] font-semibold text-navy">{plan.name}</span>
                    <span className="text-[11px] font-mono text-text-muted">
                      {plan.accounts} accounts
                    </span>
                  </div>

                  {/* Bar track */}
                  <div
                    className="h-[7px] rounded-full overflow-hidden"
                    style={{ background: 'var(--bg)' }}
                    role="progressbar"
                    aria-valuenow={plan.fill_pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${plan.name}: ${plan.fill_pct}%`}
                  >
                    <div
                      className="plan-bar h-full rounded-full"
                      style={{
                        background: plan.color,
                        transform: `scaleX(${plan.fill_pct / 100})`,
                        transformOrigin: 'left',
                        animationDelay: `${i * 0.12 + 0.4}s`,
                      }}
                    />
                  </div>

                  <div className="text-[10.5px] text-text-muted mt-1">{plan.label}</div>
                </div>
              ))}
            </div>
          </Reveal>

          {/* Subscriptions table card */}
          <Reveal delay={0.22} lift className={cardBase}>
            <div className="font-display text-[14px] font-bold text-navy mb-0.5">
              Active subscriptions
            </div>
            <div className="text-[11px] text-text-muted mb-4">
              {seedSubscriptions.length} subscriptions &middot; {activeCount} active
            </div>

            <DataTable
              columns={SUBS_COLS}
              rows={seedSubscriptions}
              rowKey={(row) => row.id}
            />
          </Reveal>
        </div>
      </div>
    </>
  );
}
