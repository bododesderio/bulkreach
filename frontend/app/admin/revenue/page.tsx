/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, Banknote, AlertCircle, Users } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useApiQuery } from '@/lib/hooks';
import Topbar, { Period } from '@/components/admin/Topbar';
import StatCard from '@/components/admin/StatCard';
import { Reveal, RevealGroup, RevealItem } from '@/components/admin/Reveal';
import AreaTrend from '@/components/admin/AreaTrend';
import Donut from '@/components/admin/Donut';

// ── types ─────────────────────────────────────────────────────────────────────
interface RevenueTotals {
  mrr_ugx: number;
  collected_ugx: number;
  outstanding_ugx: number;
  arpu_ugx: number;
}

interface RevenueSeries {
  month: string;
  revenue: number;
}

interface MethodSplit {
  method: string;
  share_pct: number;
  value_ugx: number;
}

interface RevenueResponse {
  period: string;
  totals: RevenueTotals;
  series: RevenueSeries[];
  method_split: MethodSplit[];
}

// ── constants ─────────────────────────────────────────────────────────────────
const METHOD_COLORS = ['#00D4AA', '#1B1F4A', '#F59E0B', '#6366F1', '#10B981', '#EF4444'];
const periodParam = (p: Period): string => p.toLowerCase();
const cardBase = 'bg-white border rounded-[11px] p-4';

// ── page ──────────────────────────────────────────────────────────────────────
export default function RevenuePage() {
  const [period, setPeriod] = useState<Period>('Month');

  const { data, isLoading, error } = useApiQuery(
    ['admin', 'revenue', period],
    () =>
      api<RevenueResponse>(`/admin/revenue?period=${periodParam(period)}`, {
        auth: true,
      }),
  );

  const loading = isLoading;

  useEffect(() => {
    if (error) toast.error('Failed to load revenue data');
  }, [error]);

  const totals = data?.totals;
  const series = data?.series ?? [];
  const splits = data?.method_split ?? [];

  const donutData = splits.map((s, i) => ({
    label: s.method,
    value: s.share_pct,
    color: METHOD_COLORS[i % METHOD_COLORS.length],
  }));

  const centerLabel = totals
    ? totals.collected_ugx >= 1_000_000
      ? `${(totals.collected_ugx / 1_000_000).toFixed(1)}M`
      : totals.collected_ugx.toLocaleString()
    : '';

  return (
    <>
      <Topbar
        title="Revenue"
        subtitle="Platform revenue · Flutterwave settlements"
        period={period}
        onPeriodChange={setPeriod}
      />

      <div className="p-[18px]">
        {loading && (
          <div className="flex items-center justify-center py-16 text-[12px] text-text-muted">
            Loading revenue data…
          </div>
        )}

        {!loading && totals && (
          <>
            {/* KPI row — key on StatCard forces CountUp to remount + re-animate on period change */}
            <RevealGroup className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-[18px]">
              <RevealItem lift>
                <StatCard
                  key={`mrr-${period}`}
                  label="MRR"
                  value={totals.mrr_ugx / 1e6}
                  prefix="UGX "
                  suffix="M"
                  decimals={1}
                  valueSize={22}
                  change="Monthly recurring revenue"
                  changeType="up"
                  icon={TrendingUp}
                />
              </RevealItem>
              <RevealItem lift>
                <StatCard
                  key={`collected-${period}`}
                  label={`COLLECTED (${period.toUpperCase()})`}
                  value={totals.collected_ugx / 1e6}
                  prefix="UGX "
                  suffix="M"
                  decimals={1}
                  valueSize={22}
                  change="Settled this period"
                  changeType="up"
                  icon={Banknote}
                />
              </RevealItem>
              <RevealItem lift>
                <StatCard
                  key={`outstanding-${period}`}
                  label="OUTSTANDING"
                  value={totals.outstanding_ugx / 1000}
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
                  key={`arpu-${period}`}
                  label="ARPU"
                  value={totals.arpu_ugx}
                  prefix="UGX "
                  decimals={0}
                  valueSize={20}
                  change="Per active account"
                  changeType="up"
                  icon={Users}
                />
              </RevealItem>
            </RevealGroup>

            {/* Charts row: area trend (1.5fr) + method split donut (1fr) */}
            <div className="grid grid-cols-1 gap-3 lg:[grid-template-columns:1.5fr_1fr]">
              <Reveal delay={0.15} lift className={cardBase}>
                <div className="font-display text-[14px] font-bold text-navy mb-0.5">
                  Revenue trend
                </div>
                <div className="text-[11px] text-text-muted mb-4">
                  Monthly performance · UGX
                </div>
                {series.length === 0 ? (
                  <div
                    className="flex items-center justify-center"
                    style={{ height: 230 }}
                  >
                    <span className="text-[12px] text-text-muted">No series data yet.</span>
                  </div>
                ) : (
                  <AreaTrend
                    data={series as unknown as Record<string, unknown>[]}
                    xKey="month"
                    series={[
                      { key: 'revenue', color: '#00D4AA', label: 'Revenue', fill: true },
                    ]}
                    height={230}
                    format={(v) => `UGX ${(v / 1e6).toFixed(1)}M`}
                  />
                )}
              </Reveal>

              <Reveal delay={0.22} lift className={cardBase}>
                <div className="font-display text-[14px] font-bold text-navy mb-0.5">
                  Payment method split
                </div>
                <div className="text-[11px] text-text-muted mb-4">
                  {splits.length} method{splits.length !== 1 ? 's' : ''} · {period}
                </div>
                {donutData.length === 0 ? (
                  <div
                    className="flex items-center justify-center"
                    style={{ height: 180 }}
                  >
                    <span className="text-[12px] text-text-muted">No payment data yet.</span>
                  </div>
                ) : (
                  <>
                    <Donut
                      data={donutData}
                      height={180}
                      centerLabel={centerLabel}
                      centerSub="UGX collected"
                      format={(v) => `${v.toFixed(1)}%`}
                    />
                    <div className="flex flex-col gap-1.5 mt-3">
                      {splits.map((s, i) => (
                        <div
                          key={s.method}
                          className="flex items-center justify-between text-[11.5px]"
                        >
                          <div className="flex items-center gap-1.5">
                            <span
                              className="rounded-full flex-shrink-0"
                              style={{
                                width: 8,
                                height: 8,
                                background: METHOD_COLORS[i % METHOD_COLORS.length],
                              }}
                            />
                            <span className="text-navy font-medium">{s.method}</span>
                          </div>
                          <span className="font-mono text-text-muted">
                            {s.share_pct.toFixed(1)}%{' '}
                            · UGX {s.value_ugx.toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </Reveal>
            </div>
          </>
        )}

        {!loading && !totals && (
          <div className="py-16 text-center text-[12px] text-text-muted">
            No revenue data available.
          </div>
        )}
      </div>
    </>
  );
}
