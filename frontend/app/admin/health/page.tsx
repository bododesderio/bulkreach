/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
'use client';

import { useEffect } from 'react';
import { Activity, RefreshCw, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useApiQuery } from '@/lib/hooks';
import Topbar from '@/components/admin/Topbar';
import StatCard from '@/components/admin/StatCard';
import { StatusDot } from '@/components/admin/StatusPill';
import { StatusBadge } from '@/components/ui';
import { resolveStatus } from '@/lib/status';
import { RevealGroup, RevealItem, Reveal } from '@/components/admin/Reveal';

// ── types ─────────────────────────────────────────────────────────────────────
type HealthStatus = 'operational' | 'degraded' | 'down';

interface HealthService {
  name: string;
  category: string;
  status: HealthStatus;
  latency_ms: number | null;
  detail: string;
}

interface HealthResponse {
  overall: HealthStatus;
  services: HealthService[];
  checked_at: string;
}

const cardBase = 'bg-white border rounded-[11px] p-4';

const fmtCheckedAt = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day:    '2-digit',
    month:  'short',
    hour:   '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

// ── overall status card ───────────────────────────────────────────────────────
interface OverallStatusCardProps {
  overall: HealthStatus;
  operationalCount: number;
  totalCount: number;
}

function OverallStatusCard({ overall, operationalCount, totalCount }: OverallStatusCardProps) {
  const { color, label } = resolveStatus('health', overall);
  return (
    <div className="bg-white border rounded-[11px] p-4 h-full">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-text-muted">
          Overall status
        </span>
        <Activity size={15} className="text-text-muted" />
      </div>
      <div className="flex items-center gap-2 mt-2">
        <StatusDot color={color} pulse size={10} />
        <span
          className="font-mono font-semibold text-navy leading-tight"
          style={{ fontSize: '22px' }}
        >
          {label}
        </span>
      </div>
      <div
        className="inline-flex items-center gap-[3px] text-[10.5px] font-semibold mt-1.5"
        style={{ color: '#10B981' }}
      >
        {operationalCount}/{totalCount} services healthy
      </div>
    </div>
  );
}

// ── skeleton card ─────────────────────────────────────────────────────────────
function SkeletonCard() {
  return <div className="bg-white border rounded-[11px] p-4 h-full animate-pulse" />;
}

// ── page ──────────────────────────────────────────────────────────────────────
export default function HealthPage() {
  const { data, isFetching, error, refetch } = useApiQuery(
    ['admin', 'health'],
    () => api<HealthResponse>('/admin/health', { auth: true }),
  );

  const loading = isFetching;

  useEffect(() => {
    if (error) toast.error('Failed to load system health');
  }, [error]);

  const services = data?.services ?? [];
  const operationalCount = services.filter((s) => s.status === 'operational').length;

  const validLatencies = services
    .filter((s) => s.latency_ms != null)
    .map((s) => s.latency_ms as number);
  const avgLatency =
    validLatencies.length > 0
      ? Math.round(validLatencies.reduce((a, b) => a + b, 0) / validLatencies.length)
      : null;

  return (
    <>
      <Topbar
        title="System health"
        subtitle="Live provider status · All times UTC+3"
        showPeriod={false}
      />

      <div className="p-[18px]">
        {/* checked-at timestamp + refresh button */}
        <div className="flex items-center justify-between mb-4">
          <div className="text-[11px] text-text-muted">
            {data?.checked_at ? `Last checked ${fmtCheckedAt(data.checked_at)}` : ' '}
          </div>
          <button
            onClick={() => refetch()}
            disabled={loading}
            className="flex items-center gap-1.5 text-[11px] font-semibold rounded-[6px] border px-3 py-1.5 hover:border-teal hover:text-navy transition-colors text-text-muted disabled:opacity-50"
            aria-label="Refresh health data"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* KPI row — 3 cards */}
        <RevealGroup className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-[18px]">
          <RevealItem lift>
            {data ? (
              <OverallStatusCard
                overall={data.overall}
                operationalCount={operationalCount}
                totalCount={services.length}
              />
            ) : (
              <SkeletonCard />
            )}
          </RevealItem>

          <RevealItem lift>
            <StatCard
              label="AVG LATENCY"
              value={avgLatency ?? 0}
              suffix=" ms"
              icon={Zap}
              change={avgLatency != null ? 'Across all services' : 'No data yet'}
              changeType="up"
            />
          </RevealItem>

          <RevealItem lift>
            <StatCard
              label="SERVICES"
              value={services.length}
              icon={Activity}
              change={
                services.length === 0
                  ? 'No services'
                  : `${operationalCount} operational`
              }
              changeType={
                services.length === 0 || operationalCount === services.length ? 'up' : 'warn'
              }
            />
          </RevealItem>
        </RevealGroup>

        {/* Services list */}
        <Reveal delay={0.3} lift className={cardBase}>
          <div className="font-display text-[14px] font-bold text-navy mb-0.5">Services</div>
          <div className="text-[11px] text-text-muted mb-4">
            {loading ? '—' : `${services.length} monitored`}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12 text-[12px] text-text-muted">
              Loading services…
            </div>
          ) : services.length === 0 ? (
            <div className="py-10 text-center text-[12px] text-text-muted">
              No services found.
            </div>
          ) : (
            <RevealGroup className="flex flex-col" stagger={0.06}>
              {services.map((svc, idx) => {
                const color = resolveStatus('health', svc.status).color;
                return (
                  <RevealItem key={svc.name}>
                    <div
                      className="flex items-center gap-3 py-3"
                      style={{
                        borderTop: idx === 0 ? 'none' : '1px solid var(--border)',
                      }}
                    >
                      {/* Name + category + detail */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <StatusDot
                            color={color}
                            pulse={svc.status === 'operational'}
                            size={7}
                          />
                          <span className="text-[12px] font-semibold text-navy">{svc.name}</span>
                          <span
                            className="text-[9.5px] font-semibold rounded-full px-2 py-0.5"
                            style={{ background: 'rgba(156,163,175,0.12)', color: '#9CA3AF' }}
                          >
                            {svc.category}
                          </span>
                        </div>
                        {svc.detail && (
                          <div className="text-[11px] text-text-muted mt-0.5 pl-[19px]">
                            {svc.detail}
                          </div>
                        )}
                      </div>

                      {/* Latency (null-safe) */}
                      <div className="w-16 text-right hidden sm:block">
                        <span className="font-mono text-[11px] text-navy">
                          {svc.latency_ms != null ? `${svc.latency_ms} ms` : '—'}
                        </span>
                      </div>

                      {/* Status pill */}
                      <div className="w-24 flex justify-end">
                        <StatusBadge domain="health" status={svc.status} />
                      </div>
                    </div>
                  </RevealItem>
                );
              })}
            </RevealGroup>
          )}
        </Reveal>
      </div>
    </>
  );
}
