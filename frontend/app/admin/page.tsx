import type { Metadata } from 'next';
import { Users, TrendingUp, Send, Zap } from 'lucide-react';
import { seedKPIs } from '@/lib/seed-data';
import Topbar from '@/components/admin/Topbar';
import KPICard from '@/components/admin/KPICard';
import RevenueBars from '@/components/admin/RevenueBars';
import QueueList from '@/components/admin/QueueList';
import HealthList from '@/components/admin/HealthList';
import ClientsTable from '@/components/admin/ClientsTable';
import { Reveal, RevealGroup, RevealItem } from '@/components/admin/Reveal';

export const metadata: Metadata = {
  title: 'Dashboard — BulkReach Admin',
};

const cardBase = 'bg-white border rounded-[11px] p-4';

export default function AdminDashboardPage() {
  return (
    <>
      <Topbar
        title="Dashboard"
        subtitle="Overview · Platform health · Last updated just now"
      />

      <div className="p-[18px]">
        {/* KPI grid — staggered entrance */}
        <RevealGroup className="grid grid-cols-4 gap-3 mb-[18px]">
          <RevealItem lift>
            <KPICard
              label="TOTAL CLIENTS"
              value={String(seedKPIs.total_clients)}
              change={`+${seedKPIs.new_clients_month} this month`}
              changeType="up"
              sparklineKey="clients"
              icon={Users}
            />
          </RevealItem>
          <RevealItem lift>
            <KPICard
              label="REVENUE (MONTH)"
              value={`UGX ${(seedKPIs.revenue_month_ugx / 1_000_000).toFixed(1)}M`}
              valueSize={20}
              change={`+${seedKPIs.revenue_change_pct}% vs last month`}
              changeType="up"
              sparklineKey="revenue"
              icon={TrendingUp}
            />
          </RevealItem>
          <RevealItem lift>
            <KPICard
              label="MESSAGES TODAY"
              value={seedKPIs.messages_today.toLocaleString()}
              valueSize={20}
              change="High volume day"
              changeType="up"
              sparklineKey="messages"
              icon={Send}
            />
          </RevealItem>
          <RevealItem lift>
            <KPICard
              label="MANAGED QUEUE"
              value={String(seedKPIs.managed_queue_pending)}
              change="Pending approval"
              changeType="warn"
              sparklineKey="queue"
              icon={Zap}
              warn
            />
          </RevealItem>
        </RevealGroup>

        {/* Charts row */}
        <div className="grid gap-3 mb-[18px]" style={{ gridTemplateColumns: '1.4fr 1fr' }}>
          <Reveal delay={0.15} lift className={cardBase}>
            <div className="font-display text-[14px] font-bold text-navy mb-0.5">Revenue by plan</div>
            <div className="text-[11px] text-text-muted mb-4">
              This month · {seedKPIs.total_clients} active accounts
            </div>
            <RevenueBars />
          </Reveal>

          <Reveal delay={0.22} lift className={cardBase}>
            <div className="font-display text-[14px] font-bold text-navy mb-0.5">Managed queue</div>
            <div className="text-[11px] text-text-muted mb-4">
              {seedKPIs.managed_queue_pending} campaigns pending action
            </div>
            <QueueList />
          </Reveal>
        </div>

        {/* Bottom row */}
        <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1.5fr' }}>
          <Reveal delay={0.3} lift className={cardBase}>
            <div className="font-display text-[14px] font-bold text-navy mb-0.5">Provider health</div>
            <div className="text-[11px] text-text-muted mb-4">Real-time platform status</div>
            <HealthList />
          </Reveal>

          <Reveal delay={0.36} lift className={cardBase}>
            <div className="font-display text-[14px] font-bold text-navy mb-0.5">Recent clients</div>
            <div className="text-[11px] text-text-muted mb-4">
              Latest signups and most active accounts
            </div>
            <ClientsTable />
          </Reveal>
        </div>
      </div>
    </>
  );
}
