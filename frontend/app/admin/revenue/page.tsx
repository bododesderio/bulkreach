'use client';

import { useState } from 'react';
import { TrendingUp, Banknote, AlertCircle, Users } from 'lucide-react';
import Topbar, { Period } from '@/components/admin/Topbar';
import DemoBadge from '@/components/admin/DemoBadge';
import StatCard from '@/components/admin/StatCard';
import { Reveal, RevealGroup, RevealItem } from '@/components/admin/Reveal';
import AreaTrend from '@/components/admin/AreaTrend';
import {
  seedRevenueTotals,
  seedRevenueSeries,
  seedRevenuePlans,
} from '@/lib/seed-data';

const cardBase = 'bg-white border rounded-[11px] p-4';

export default function RevenuePage() {
  const [period, setPeriod] = useState<Period>('Month');
  const totals = seedRevenueTotals[period];

  return (
    <>
      <Topbar
        title="Revenue"
        subtitle="Platform revenue · Flutterwave settlements"
        period={period}
        onPeriodChange={setPeriod}
      />

      <div className="p-[18px]">
        <div className="flex items-center gap-2 mb-4">
          <DemoBadge />
        </div>

        {/* KPI row — key on StatCard forces CountUp to remount + re-count on period change */}
        <RevealGroup className="grid grid-cols-4 gap-3 mb-[18px]">
          <RevealItem lift>
            <StatCard
              key={period}
              label="MRR"
              value={totals.mrr / 1e6}
              prefix="UGX "
              suffix="M"
              decimals={1}
              valueSize={22}
              change="Monthly recurring revenue"
              changeType="up"
              icon={TrendingUp}
              sparklineKey="revenue"
            />
          </RevealItem>
          <RevealItem lift>
            <StatCard
              key={period}
              label={`COLLECTED (${period.toUpperCase()})`}
              value={totals.collected / 1e6}
              prefix="UGX "
              suffix="M"
              decimals={1}
              valueSize={22}
              change="+12% vs last period"
              changeType="up"
              icon={Banknote}
              sparklineKey="revenue"
            />
          </RevealItem>
          <RevealItem lift>
            <StatCard
              key={period}
              label="OUTSTANDING"
              value={totals.outstanding / 1000}
              prefix="UGX "
              suffix="k"
              decimals={0}
              valueSize={22}
              change="Awaiting settlement"
              changeType="warn"
              icon={AlertCircle}
            />
          </RevealItem>
          <RevealItem lift>
            <StatCard
              key={period}
              label="ARPU"
              value={totals.arpu}
              prefix="UGX "
              decimals={0}
              valueSize={20}
              change="Per active account"
              changeType="up"
              icon={Users}
              sparklineKey="clients"
            />
          </RevealItem>
        </RevealGroup>

        {/* Charts row: area trend (1.5fr) + plan bars (1fr) */}
        <div className="grid gap-3" style={{ gridTemplateColumns: '1.5fr 1fr' }}>
          <Reveal delay={0.15} lift className={cardBase}>
            <div className="font-display text-[14px] font-bold text-navy mb-0.5">
              Revenue vs target
            </div>
            <div className="text-[11px] text-text-muted mb-4">
              Monthly performance · UGX millions
            </div>
            <AreaTrend
              data={seedRevenueSeries as unknown as Record<string, unknown>[]}
              xKey="month"
              series={[
                { key: 'revenue', color: '#00D4AA', label: 'Revenue', fill: true },
                { key: 'target', color: '#1B1F4A', label: 'Target', dashed: true, fill: false },
                { key: 'mrr', color: '#6366F1', label: 'MRR', fill: false },
              ]}
              height={230}
              format={(v) => `UGX ${(v / 1e6).toFixed(1)}M`}
            />
          </Reveal>

          <Reveal delay={0.22} lift className={cardBase}>
            <div className="font-display text-[14px] font-bold text-navy mb-0.5">
              Revenue by plan
            </div>
            <div className="text-[11px] text-text-muted mb-4">
              {seedRevenuePlans.reduce((s, p) => s + p.accounts, 0)} accounts ·{' '}
              {seedRevenuePlans.length} plans
            </div>
            <div className="flex flex-col gap-5">
              {seedRevenuePlans.map((plan) => (
                <div key={plan.name}>
                  <div className="flex items-center justify-between mb-[6px]">
                    <span className="text-[12.5px] font-semibold text-navy">{plan.name}</span>
                    <span className="text-[10.5px] text-text-muted">
                      {plan.accounts} accts · {plan.label}
                    </span>
                  </div>
                  <div
                    className="relative rounded-full overflow-hidden"
                    style={{ height: 7, background: '#F7F8FC' }}
                  >
                    <div
                      className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
                      style={{ width: `${plan.fill_pct}%`, background: plan.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </div>
    </>
  );
}
