'use client';

import { DollarSign, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import Topbar from '@/components/admin/Topbar';
import DemoBadge from '@/components/admin/DemoBadge';
import StatCard from '@/components/admin/StatCard';
import { Reveal, RevealGroup, RevealItem } from '@/components/admin/Reveal';
import DataTable, { Column } from '@/components/admin/DataTable';
import Donut from '@/components/admin/Donut';
import { StatusPill } from '@/components/admin/StatusPill';
import {
  seedPayments,
  seedPaymentMethods,
  type PayStatus,
  type PlanKey,
  type PayMethod,
} from '@/lib/seed-data';

const cardBase = 'bg-white border rounded-[11px] p-4';

// ── derived stats ────────────────────────────────────────────────────────────
const successPayments = seedPayments.filter((p) => p.status === 'success');
const pendingPayments = seedPayments.filter((p) => p.status === 'pending');
const failedPayments = seedPayments.filter((p) => p.status === 'failed');
const successRate = (successPayments.length / seedPayments.length) * 100;
const monthTotal = seedPaymentMethods.reduce((s, m) => s + m.value_ugx, 0); // 8,400,000

// ── donut data ───────────────────────────────────────────────────────────────
const donutData = seedPaymentMethods.map((m) => ({
  label: m.method,
  value: m.value_ugx,
  color: m.color,
}));

// ── status config ────────────────────────────────────────────────────────────
const PAY_STATUS: Record<PayStatus, { label: string; color: string; pulse: boolean }> = {
  success: { label: 'Success', color: '#10B981', pulse: false },
  pending: { label: 'Pending', color: '#F59E0B', pulse: true },
  failed: { label: 'Failed', color: '#EF4444', pulse: false },
  refunded: { label: 'Refunded', color: '#9CA3AF', pulse: false },
};

// ── plan badge config ─────────────────────────────────────────────────────────
const PLAN_CFG: Record<PlanKey, { color: string; bg: string }> = {
  starter: { color: '#6B7280', bg: 'rgba(107,114,128,0.1)' },
  growth: { color: '#009980', bg: 'rgba(0,212,170,0.12)' },
  business: { color: '#1B1F4A', bg: 'rgba(27,31,74,0.1)' },
  managed: { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' },
};

// ── method badge config ───────────────────────────────────────────────────────
const METHOD_CFG: Record<PayMethod, { color: string; bg: string }> = {
  'MTN MoMo': { color: '#B45309', bg: 'rgba(245,158,11,0.1)' },
  'Airtel Money': { color: '#EF4444', bg: 'rgba(239,68,68,0.1)' },
  Visa: { color: '#1B1F4A', bg: 'rgba(27,31,74,0.08)' },
  Mastercard: { color: '#00D4AA', bg: 'rgba(0,212,170,0.12)' },
};

// ── table column definitions ──────────────────────────────────────────────────
type Payment = (typeof seedPayments)[number];

const columns: Column<Payment>[] = [
  {
    key: 'ref',
    label: 'Ref',
    render: (row) => (
      <span className="font-mono text-[11px] text-text-muted">{row.ref}</span>
    ),
  },
  {
    key: 'account',
    label: 'Account',
    render: (row) => (
      <span className="text-[12px] font-semibold text-navy">{row.account}</span>
    ),
  },
  {
    key: 'amount_ugx',
    label: 'Amount',
    align: 'right',
    render: (row) => (
      <span className="font-mono text-[12px] text-navy">
        UGX {row.amount_ugx.toLocaleString()}
      </span>
    ),
  },
  {
    key: 'method',
    label: 'Method',
    render: (row) => {
      const c = METHOD_CFG[row.method];
      return (
        <span
          className="inline-flex items-center rounded-full font-bold whitespace-nowrap"
          style={{ background: c.bg, color: c.color, padding: '2px 8px', fontSize: '9.5px' }}
        >
          {row.method}
        </span>
      );
    },
  },
  {
    key: 'plan',
    label: 'Plan',
    render: (row) => {
      const c = PLAN_CFG[row.plan];
      return (
        <span
          className="inline-flex items-center rounded-full font-bold whitespace-nowrap"
          style={{ background: c.bg, color: c.color, padding: '2px 8px', fontSize: '9.5px' }}
        >
          {row.plan.charAt(0).toUpperCase() + row.plan.slice(1)}
        </span>
      );
    },
  },
  {
    key: 'status',
    label: 'Status',
    render: (row) => {
      const s = PAY_STATUS[row.status];
      return <StatusPill label={s.label} color={s.color} pulse={s.pulse} />;
    },
  },
  {
    key: 'date',
    label: 'Date',
    render: (row) => (
      <span className="text-[11px] text-text-muted">{row.date}</span>
    ),
  },
  {
    key: 'action',
    label: '',
    align: 'right',
    render: (row) => (
      <button
        onClick={() => toast(`Receipt for ${row.ref} — generating…`)}
        className="text-[11px] rounded-[5px] border bg-transparent font-semibold text-text-muted px-2 py-1 hover:border-teal hover:text-navy transition-colors"
      >
        Receipt
      </button>
    ),
  },
];

export default function PaymentsPage() {
  return (
    <>
      <Topbar
        title="Payments"
        subtitle="Flutterwave transactions · Settlement history"
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
              label="COLLECTED (MONTH)"
              value={monthTotal / 1e6}
              prefix="UGX "
              suffix="M"
              decimals={1}
              valueSize={22}
              change="+12% vs last month"
              changeType="up"
              icon={DollarSign}
              sparklineKey="revenue"
            />
          </RevealItem>
          <RevealItem lift>
            <StatCard
              label="SUCCESS RATE"
              value={successRate}
              suffix="%"
              decimals={1}
              valueSize={24}
              change={`${successPayments.length} of ${seedPayments.length} transactions`}
              changeType="up"
              icon={CheckCircle2}
            />
          </RevealItem>
          <RevealItem lift>
            <StatCard
              label="PENDING"
              value={pendingPayments.length}
              valueSize={28}
              change="Awaiting confirmation"
              changeType="warn"
              icon={Clock}
            />
          </RevealItem>
          <RevealItem lift>
            <StatCard
              label="FAILED"
              value={failedPayments.length}
              valueSize={28}
              change="Needs investigation"
              changeType="down"
              icon={XCircle}
              warn
            />
          </RevealItem>
        </RevealGroup>

        {/* Payment methods: Donut + legend | transactions table */}
        <div className="grid gap-3 mb-[18px]" style={{ gridTemplateColumns: '1fr 1.8fr' }}>
          <Reveal delay={0.15} lift className={cardBase}>
            <div className="font-display text-[14px] font-bold text-navy mb-0.5">
              Payment methods
            </div>
            <div className="text-[11px] text-text-muted mb-3">
              Share of collected volume
            </div>
            <div className="flex items-center gap-4">
              {/* Donut */}
              <div style={{ width: 160, flexShrink: 0 }}>
                <Donut
                  data={donutData}
                  height={160}
                  centerLabel={`UGX ${(monthTotal / 1e6).toFixed(1)}M`}
                  centerSub="total"
                  format={(v) => `UGX ${(v / 1e6).toFixed(2)}M`}
                />
              </div>
              {/* Legend */}
              <div className="flex-1 min-w-0">
                {seedPaymentMethods.map((m) => (
                  <div
                    key={m.method}
                    className="flex items-center justify-between py-[7px] border-b last:border-0"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="flex-shrink-0 rounded-full"
                        style={{ width: 8, height: 8, background: m.color }}
                      />
                      <span className="text-[11.5px] font-semibold text-navy truncate">
                        {m.method}
                      </span>
                    </div>
                    <span className="text-[10.5px] text-text-muted ml-2 whitespace-nowrap">
                      {m.share_pct}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.22} lift className={cardBase}>
            <div className="font-display text-[14px] font-bold text-navy mb-0.5">
              Recent transactions
            </div>
            <div className="text-[11px] text-text-muted mb-4">
              Latest {seedPayments.length} transactions
            </div>
            <DataTable<Payment>
              columns={columns}
              rows={seedPayments}
              rowKey={(row) => row.id}
              stagger={0.03}
              baseDelay={0.08}
              empty="No transactions"
            />
          </Reveal>
        </div>
      </div>
    </>
  );
}
