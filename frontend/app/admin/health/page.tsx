'use client';

import { Activity, Clock, Zap, AlertTriangle } from 'lucide-react';
import Topbar from '@/components/admin/Topbar';
import DemoBadge from '@/components/admin/DemoBadge';
import StatCard from '@/components/admin/StatCard';
import AreaTrend from '@/components/admin/AreaTrend';
import { StatusPill, StatusDot } from '@/components/admin/StatusPill';
import { RevealGroup, RevealItem, Reveal } from '@/components/admin/Reveal';
import {
  seedHealthServices,
  seedHealthIncidents,
  seedThroughputSeries,
  type HealthStatus,
  type Severity,
} from '@/lib/seed-data';

const cardBase = 'bg-white border rounded-[11px] p-4';

const statusColor: Record<HealthStatus, string> = {
  operational: '#10B981',
  degraded: '#F59E0B',
  down: '#EF4444',
};

const severityColor: Record<Severity, string> = {
  info: '#00D4AA',
  warn: '#F59E0B',
  critical: '#EF4444',
};

const activeIncidents = seedHealthIncidents.filter((i) => i.status !== 'Resolved').length;
const avgLatency = Math.round(
  seedHealthServices.reduce((sum, s) => sum + s.latency_ms, 0) / seedHealthServices.length,
);
const avgUptime =
  seedHealthServices.reduce((sum, s) => sum + s.uptime_pct, 0) / seedHealthServices.length;
const operationalCount = seedHealthServices.filter((s) => s.status === 'operational').length;
const hasDegraded = seedHealthServices.some((s) => s.status === 'degraded');
const hasDown = seedHealthServices.some((s) => s.status === 'down');
const overallStatusLabel = hasDown
  ? 'Incident'
  : hasDegraded
    ? 'Degraded'
    : 'Operational';
const overallStatusColor = hasDown ? '#EF4444' : hasDegraded ? '#F59E0B' : '#10B981';

function OverallStatusCard() {
  return (
    <div className="bg-white border rounded-[11px] p-4 h-full">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-text-muted">
          Overall status
        </span>
        <Activity size={15} className="text-text-muted" />
      </div>
      <div className="flex items-center gap-2 mt-2">
        <StatusDot color={overallStatusColor} pulse size={10} />
        <span
          className="font-mono font-semibold text-navy leading-tight"
          style={{ fontSize: '22px' }}
        >
          {overallStatusLabel}
        </span>
      </div>
      <div
        className="inline-flex items-center gap-[3px] text-[10.5px] font-semibold mt-1.5"
        style={{ color: '#10B981' }}
      >
        <span>
          {operationalCount}/{seedHealthServices.length} services healthy
        </span>
      </div>
    </div>
  );
}

export default function HealthPage() {
  return (
    <>
      <Topbar
        title="System health"
        subtitle="Live provider status · All times UTC+3"
        showPeriod={false}
      />

      <div className="p-[18px]">
        <div className="flex items-center gap-2 mb-4">
          <DemoBadge />
          <span
            className="inline-flex items-center gap-1.5 font-semibold"
            style={{ fontSize: '10px', color: '#10B981' }}
          >
            <StatusDot color="#10B981" pulse size={6} />
            Live
          </span>
        </div>

        {/* KPI row */}
        <RevealGroup className="grid grid-cols-4 gap-3 mb-[18px]">
          <RevealItem lift>
            <OverallStatusCard />
          </RevealItem>
          <RevealItem lift>
            <StatCard
              label="Avg uptime"
              value={avgUptime}
              decimals={2}
              suffix="%"
              icon={Clock}
              change="30-day rolling"
              changeType="up"
            />
          </RevealItem>
          <RevealItem lift>
            <StatCard
              label="Avg latency"
              value={avgLatency}
              suffix=" ms"
              icon={Zap}
              change="Across all services"
              changeType="up"
            />
          </RevealItem>
          <RevealItem lift>
            <StatCard
              label="Active incidents"
              value={activeIncidents}
              icon={AlertTriangle}
              change={activeIncidents > 0 ? 'Under monitoring' : 'All clear'}
              changeType={activeIncidents > 0 ? 'warn' : 'up'}
              warn={activeIncidents > 0}
            />
          </RevealItem>
        </RevealGroup>

        {/* Throughput chart + incidents side by side */}
        <div className="grid gap-3 mb-[18px]" style={{ gridTemplateColumns: '1.6fr 1fr' }}>
          <Reveal delay={0.15} lift className={cardBase}>
            <div className="flex items-center justify-between mb-0.5">
              <div className="font-display text-[14px] font-bold text-navy">
                Requests / hour (24h)
              </div>
              <span
                className="inline-flex items-center gap-1.5 font-semibold"
                style={{ fontSize: '10px', color: '#10B981' }}
              >
                <StatusDot color="#10B981" pulse size={5} />
                Live
              </span>
            </div>
            <div className="text-[11px] text-text-muted mb-4">
              Inbound platform requests across all services
            </div>
            <AreaTrend
              data={seedThroughputSeries}
              xKey="t"
              series={[{ key: 'req', color: '#00D4AA', label: 'Requests', fill: true }]}
              height={200}
              format={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))}
            />
          </Reveal>

          <Reveal delay={0.22} lift className={cardBase}>
            <div className="font-display text-[14px] font-bold text-navy mb-0.5">Incidents</div>
            <div className="text-[11px] text-text-muted mb-4">
              {seedHealthIncidents.length} total · {activeIncidents} active
            </div>
            <div className="flex flex-col gap-3">
              {seedHealthIncidents.map((inc) => (
                <div
                  key={inc.id}
                  className="flex items-start gap-3 p-3 rounded-[8px] border"
                  style={{ background: 'var(--bg)' }}
                >
                  <StatusDot
                    color={severityColor[inc.severity]}
                    pulse={inc.status !== 'Resolved'}
                    size={7}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-semibold text-navy leading-tight mb-0.5">
                      {inc.title}
                    </div>
                    <div className="font-mono text-[10.5px] text-text-muted">{inc.when}</div>
                  </div>
                  <StatusPill
                    label={inc.status}
                    color={inc.status === 'Resolved' ? '#9CA3AF' : '#F59E0B'}
                    pulse={inc.status !== 'Resolved'}
                  />
                </div>
              ))}
            </div>
          </Reveal>
        </div>

        {/* Services list */}
        <Reveal delay={0.3} lift className={cardBase}>
          <div className="font-display text-[14px] font-bold text-navy mb-0.5">Services</div>
          <div className="text-[11px] text-text-muted mb-4">
            {seedHealthServices.length} monitored · uptime + latency
          </div>

          <RevealGroup className="flex flex-col" stagger={0.06}>
            {seedHealthServices.map((svc, idx) => (
              <RevealItem key={svc.name}>
                <div
                  className="flex items-center gap-3 py-3"
                  style={{
                    borderTop: idx === 0 ? 'none' : '1px solid var(--border)',
                  }}
                >
                  {/* Name + category */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusDot
                        color={statusColor[svc.status]}
                        pulse={svc.status === 'operational'}
                        size={7}
                      />
                      <span className="text-[12px] font-semibold text-navy">{svc.name}</span>
                      <span
                        className="text-[9.5px] font-semibold rounded-full px-2 py-0.5"
                        style={{
                          background: 'rgba(156,163,175,0.12)',
                          color: '#9CA3AF',
                        }}
                      >
                        {svc.category}
                      </span>
                    </div>
                    <div className="text-[11px] text-text-muted mt-0.5 pl-[19px]">
                      {svc.detail}
                    </div>
                  </div>

                  {/* Uptime bar */}
                  <div className="w-28 hidden sm:block">
                    <div className="text-[9.5px] text-text-muted mb-1 text-right">
                      {svc.uptime_pct}%
                    </div>
                    <div
                      className="h-1 rounded-full overflow-hidden"
                      style={{ background: 'rgba(0,0,0,0.06)' }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${svc.uptime_pct}%`,
                          background: statusColor[svc.status],
                        }}
                      />
                    </div>
                  </div>

                  {/* Latency */}
                  <div className="w-16 text-right hidden sm:block">
                    <span className="font-mono text-[11px] text-navy">{svc.latency_ms} ms</span>
                  </div>

                  {/* Status pill */}
                  <div className="w-24 flex justify-end">
                    <StatusPill
                      label={svc.status}
                      color={statusColor[svc.status]}
                      pulse={svc.status === 'operational' || svc.status === 'degraded'}
                    />
                  </div>
                </div>
              </RevealItem>
            ))}
          </RevealGroup>
        </Reveal>
      </div>
    </>
  );
}
