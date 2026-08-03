/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Users, TrendingUp, Send, Zap, UserPlus, CreditCard, Megaphone, Cpu } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useApiQuery } from '@/lib/hooks';
import Topbar, { Period } from '@/components/admin/Topbar';
import KPICard from '@/components/admin/KPICard';
import { Reveal, RevealGroup, RevealItem } from '@/components/admin/Reveal';
import { StatusDot, StatusBadge } from '@/components/ui';

// ── types ─────────────────────────────────────────────────────────────────────
type ActivityKind = 'signup' | 'payment' | 'campaign' | 'managed' | 'system';

interface ActivityItem {
  id: string;
  kind: ActivityKind;
  text: string;
  meta: string;
  when: string; // ISO datetime
}

interface PlanRevenue {
  name: string;
  accounts: number;
  mrr_ugx: number;
}

interface KPIs {
  total_clients: number;
  new_clients: number;
  revenue_ugx: number;
  revenue_change_pct: number | null;
  messages: number;
  messages_change_pct: number | null;
  managed_queue_pending: number;
}

interface OverviewResponse {
  period: string;
  kpis: KPIs;
  revenue_by_plan: PlanRevenue[];
  activity: ActivityItem[];
}

interface HealthService {
  name: string;
  category: string;
  status: 'operational' | 'degraded' | 'down';
  latency_ms: number | null;
  detail: string;
}
interface HealthResponse {
  overall: 'operational' | 'degraded' | 'down';
  services: HealthService[];
  checked_at: string;
}

interface ManagedQueueItem {
  id: string;
  account_name: string | null;
  campaign_name: string | null;
  channel: 'sms' | 'email' | 'both' | null;
  status: string;
  updated_at: string;
}
interface ManagedResponse {
  items: ManagedQueueItem[];
}

/** Pipeline states that are still awaiting operator/client action. */
const QUEUE_ACTIONABLE = new Set([
  'requested',
  'briefed',
  'assigned',
  'audience_pending',
  'audience_ready',
  'drafting',
  'internal_review',
  'awaiting_approval',
  'changes_requested',
  'approved',
  'scheduled',
]);

// ── helpers ───────────────────────────────────────────────────────────────────
const periodParam = (p: Period): string => p.toLowerCase();

function fmtWhen(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function fmtRevenue(ugx: number): string {
  if (ugx >= 1_000_000) return `UGX ${(ugx / 1_000_000).toFixed(1)}M`;
  if (ugx >= 1_000) return `UGX ${(ugx / 1_000).toFixed(0)}k`;
  return `UGX ${ugx.toLocaleString()}`;
}

function fmtChangePct(pct: number | null): string {
  if (pct == null) return '—';
  return `${pct >= 0 ? '+' : ''}${pct}% vs last period`;
}

// ── activity kind config ──────────────────────────────────────────────────────
const KIND_META: Record<ActivityKind, { icon: LucideIcon; color: string }> = {
  signup:   { icon: UserPlus,   color: '#00D4AA' },
  payment:  { icon: CreditCard, color: '#10B981' },
  campaign: { icon: Megaphone,  color: '#6366F1' },
  system:   { icon: Cpu,        color: '#9CA3AF' },
  managed:  { icon: Zap,        color: '#F59E0B' },
};

const PLAN_COLORS = ['#00D4AA', '#1B1F4A', 'rgba(0,212,170,0.45)', '#F59E0B', '#6366F1'];
const cardBase = 'bg-white border rounded-[11px] p-4';

// ── page ──────────────────────────────────────────────────────────────────────
export default function AdminDashboardPage() {
  const [period, setPeriod] = useState<Period>('Month');

  const { data, isLoading: loading, isError } = useApiQuery(
    ['admin', 'overview', period],
    async () => {
      const [overview, healthRes, managedRes] = await Promise.all([
        api<OverviewResponse>(`/admin/overview?period=${periodParam(period)}`, { auth: true }),
        api<HealthResponse>('/admin/health', { auth: true }).catch(() => null),
        api<ManagedResponse>('/admin/managed', { auth: true }).catch(() => null),
      ]);
      return {
        overview,
        health: healthRes?.services ?? [],
        queue: (managedRes?.items ?? [])
          .filter((m) => QUEUE_ACTIONABLE.has(m.status))
          .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
          .slice(0, 5),
      };
    },
  );

  useEffect(() => {
    if (isError) toast.error('Failed to load dashboard data');
  }, [isError]);

  const overview = data?.overview ?? null;
  const health = data?.health ?? [];
  const queue = data?.queue ?? [];

  const kpis = overview?.kpis;
  const plans = overview?.revenue_by_plan ?? [];
  const activity = overview?.activity ?? [];

  // Normalise bar widths relative to the highest-MRR plan
  const maxMrr = plans.reduce((m, p) => Math.max(m, p.mrr_ugx), 0);
  const planBars = plans.map((p, i) => ({
    ...p,
    fill_pct: maxMrr > 0 ? Math.round((p.mrr_ugx / maxMrr) * 100) : 0,
    color: PLAN_COLORS[i % PLAN_COLORS.length],
  }));

  return (
    <>
      <Topbar
        title="Dashboard"
        subtitle="Overview · Platform health · Live data"
        period={period}
        onPeriodChange={setPeriod}
      />

      <div className="p-[18px]">
        {loading && (
          <div className="flex items-center justify-center py-16 text-[12px] text-text-muted">
            Loading dashboard…
          </div>
        )}

        {!loading && kpis && (
          <>
            {/* KPI grid — staggered entrance */}
            <RevealGroup className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-[18px]">
              <RevealItem lift>
                <KPICard
                  label="TOTAL CLIENTS"
                  value={String(kpis.total_clients)}
                  change={`+${kpis.new_clients} new this ${period.toLowerCase()}`}
                  changeType="up"
                  icon={Users}
                  href="/admin/accounts"
                />
              </RevealItem>
              <RevealItem lift>
                <KPICard
                  label={`REVENUE (${period.toUpperCase()})`}
                  value={fmtRevenue(kpis.revenue_ugx)}
                  valueSize={20}
                  change={fmtChangePct(kpis.revenue_change_pct)}
                  changeType={
                    kpis.revenue_change_pct != null && kpis.revenue_change_pct < 0
                      ? 'warn'
                      : 'up'
                  }
                  icon={TrendingUp}
                  href="/admin/revenue"
                />
              </RevealItem>
              <RevealItem lift>
                <KPICard
                  label="MESSAGES"
                  value={kpis.messages.toLocaleString()}
                  valueSize={20}
                  change={fmtChangePct(kpis.messages_change_pct)}
                  changeType={
                    kpis.messages_change_pct != null && kpis.messages_change_pct < 0
                      ? 'warn'
                      : 'up'
                  }
                  icon={Send}
                  href="/admin/campaigns"
                />
              </RevealItem>
              <RevealItem lift>
                <KPICard
                  label="MANAGED QUEUE"
                  value={String(kpis.managed_queue_pending)}
                  change="Pending approval"
                  changeType="warn"
                  icon={Zap}
                  warn
                  href="/admin/managed"
                />
              </RevealItem>
            </RevealGroup>

            {/* Charts row */}
            <div className="grid grid-cols-1 gap-3 mb-[18px] lg:[grid-template-columns:1.4fr_1fr]">
              <Reveal delay={0.15} lift className={cardBase}>
                <div className="flex items-start justify-between gap-2 mb-0.5">
                  <div className="font-display text-[14px] font-bold text-navy">
                    Revenue by plan
                  </div>
                  <Link
                    href="/admin/revenue"
                    className="shrink-0 text-[11px] font-semibold text-teal hover:underline"
                  >
                    View all →
                  </Link>
                </div>
                <div className="text-[11px] text-text-muted mb-4">
                  {period} · {kpis.total_clients} active accounts
                </div>
                {planBars.length === 0 ? (
                  <div className="py-4 text-[12px] text-text-muted">No plan revenue data yet.</div>
                ) : (
                  <div>
                    {planBars.slice(0, 6).map((plan) => (
                      <div key={plan.name} className="mb-3">
                        <div className="flex justify-between items-baseline mb-1.5">
                          <span className="text-[12.5px] font-semibold text-navy">
                            {plan.name}{' '}
                            <span className="text-text-muted font-normal">
                              {plan.accounts} accounts
                            </span>
                          </span>
                          <span className="font-mono text-[12px] text-text-md">
                            {plan.mrr_ugx > 0
                              ? `UGX ${plan.mrr_ugx.toLocaleString()}`
                              : '—'}
                          </span>
                        </div>
                        <div className="h-[5px] bg-[#EEF0FA] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${plan.fill_pct}%`, background: plan.color }}
                          />
                        </div>
                      </div>
                    ))}
                    {planBars.length > 6 && (
                      <Link
                        href="/admin/revenue"
                        className="block pt-1 text-[11px] font-semibold text-teal hover:underline"
                      >
                        +{planBars.length - 6} more plans →
                      </Link>
                    )}
                  </div>
                )}
              </Reveal>

              <Reveal delay={0.22} lift className={cardBase}>
                <div className="flex items-start justify-between gap-2 mb-0.5">
                  <div className="font-display text-[14px] font-bold text-navy">
                    Managed queue
                  </div>
                  <Link
                    href="/admin/managed"
                    className="shrink-0 text-[11px] font-semibold text-teal hover:underline"
                  >
                    View all →
                  </Link>
                </div>
                <div className="text-[11px] text-text-muted mb-4">
                  {kpis.managed_queue_pending} campaigns pending action
                </div>
                {queue.length === 0 ? (
                  <div className="py-4 text-[12px] text-text-muted">Queue is clear.</div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {queue.map((m) => (
                      <div
                        key={m.id}
                        className="bg-bg border rounded-[7px] px-[11px] py-[9px] flex items-center gap-[9px]"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-[12.5px] font-semibold text-navy truncate">
                            {m.campaign_name || m.account_name || 'Untitled campaign'}
                          </div>
                          <div className="text-[10.5px] text-text-muted mt-0.5 truncate">
                            {m.account_name || '—'}
                          </div>
                        </div>
                        <StatusBadge domain="managed" status={m.status} />
                      </div>
                    ))}
                  </div>
                )}
              </Reveal>
            </div>

            {/* Bottom row */}
            <div className="grid grid-cols-1 gap-3 lg:[grid-template-columns:1fr_1.5fr]">
              <Reveal delay={0.3} lift className={cardBase}>
                <div className="flex items-start justify-between gap-2 mb-0.5">
                  <div className="font-display text-[14px] font-bold text-navy">
                    Provider health
                  </div>
                  <Link
                    href="/admin/health"
                    className="shrink-0 text-[11px] font-semibold text-teal hover:underline"
                  >
                    View all →
                  </Link>
                </div>
                <div className="text-[11px] text-text-muted mb-4">Real-time platform status</div>
                {health.length === 0 ? (
                  <div className="py-4 text-[12px] text-text-muted">No health data available.</div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {health.map((svc) => (
                      <div
                        key={svc.name}
                        className="bg-bg border rounded-[7px] px-3 py-[9px] flex justify-between items-center gap-2"
                      >
                        <div className="min-w-0">
                          <div className="text-[12px] font-semibold text-navy truncate">{svc.name}</div>
                          <div className="text-[10.5px] text-text-muted truncate">
                            {svc.detail}
                            {svc.latency_ms != null ? ` · ${svc.latency_ms}ms` : ''}
                          </div>
                        </div>
                        <StatusBadge domain="health" status={svc.status} />
                      </div>
                    ))}
                  </div>
                )}
              </Reveal>

              <Reveal delay={0.36} lift className={cardBase}>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <StatusDot color="#10B981" pulse />
                    <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-text-muted">
                      Live activity
                    </span>
                  </div>
                  <Link
                    href="/admin/audit-log"
                    className="shrink-0 text-[11px] font-semibold text-teal hover:underline"
                  >
                    View all →
                  </Link>
                </div>
                {activity.length === 0 ? (
                  <div className="py-4 text-[12px] text-text-muted">No activity recorded yet.</div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {activity.slice(0, 6).map((item) => {
                      const cfg = KIND_META[item.kind] ?? KIND_META.system;
                      const Icon = cfg.icon;
                      return (
                        <div
                          key={item.id}
                          className="flex items-start gap-2.5 rounded-[8px] px-2.5 py-2 hover:bg-bg transition-colors"
                        >
                          <span
                            className="flex items-center justify-center rounded-[7px] flex-shrink-0 mt-0.5"
                            style={{ width: 26, height: 26, background: `${cfg.color}1f` }}
                          >
                            <Icon size={13} color={cfg.color} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-[12px] font-semibold text-navy leading-snug truncate">
                              {item.text}
                            </div>
                            <div className="text-[10.5px] text-text-muted">{item.meta}</div>
                          </div>
                          <span className="text-[10px] text-text-muted whitespace-nowrap mt-0.5">
                            {fmtWhen(item.when)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Reveal>
            </div>
          </>
        )}

        {!loading && !kpis && (
          <div className="py-16 text-center text-[12px] text-text-muted">
            No overview data available.
          </div>
        )}
      </div>
    </>
  );
}
