/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 *
 * Managed queue — the list. A scannable table of full-service jobs; each row
 * opens a focused workspace (/admin/managed/[id]). Stat tiles filter the list.
 * The admin runs every job solo — no approval lane, no assignment.
 */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Layers, Zap, Send, CheckCircle2, Plus } from 'lucide-react';
import Topbar from '@/components/admin/Topbar';
import StatCard from '@/components/admin/StatCard';
import DataTable, { Column } from '@/components/admin/DataTable';
import { Reveal, RevealGroup, RevealItem } from '@/components/admin/Reveal';
import { DataState } from '@/components/ui';
import { api } from '@/lib/api';
import { useApiQuery } from '@/lib/hooks';
import {
  type Managed, type ManagedResponse, type StatFilter,
  STATUS_CFG, CHANNEL_CFG, GROUP_PREDICATE,
  stepOf, primaryActionFor, initials, ageOf,
} from '@/lib/managed';

const cardBase = 'bg-white border rounded-[11px] p-4';

export default function ManagedListPage() {
  const [filter, setFilter] = useState<StatFilter>('all');

  const { data, isLoading, isError, error, refetch } = useApiQuery(
    ['admin', 'managed', 'list'],
    () => api<ManagedResponse>('/admin/managed?limit=500', { auth: true }),
  );

  const items = data?.items ?? [];
  const totalCount = items.length;
  const inProdCount = items.filter(GROUP_PREDICATE.in_prod).length;
  const sendCount = items.filter(GROUP_PREDICATE.send).length;
  const completeCount = items.filter(GROUP_PREDICATE.complete).length;

  const visible = filter === 'all' ? items : items.filter(GROUP_PREDICATE[filter]);
  const toggle = (f: StatFilter) => setFilter((cur) => (cur === f ? 'all' : f));

  const columns: Column<Managed>[] = [
    {
      key: 'client',
      label: 'Client',
      render: (m) => (
        <Link href={`/admin/managed/${m.id}`} className="flex items-center gap-2.5 group">
          <span
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
            style={{ background: 'rgba(0,212,170,0.12)', color: '#009980' }}
            aria-hidden
          >
            {initials(m.account_name)}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-semibold text-navy group-hover:text-teal transition-colors">
              {m.account_name ?? '—'}
            </span>
            <span className="block max-w-[280px] truncate text-[11px] text-text-muted">
              {m.brief_text}
            </span>
          </span>
        </Link>
      ),
    },
    {
      key: 'stage',
      label: 'Stage',
      render: (m) => {
        const st = STATUS_CFG[m.status];
        const step = stepOf(m.status);
        return (
          <div className="flex flex-col gap-1">
            <span
              className="inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{ background: `${step.color}1f`, color: step.color }}
            >
              {step.label}
            </span>
            <span className="text-[10px] text-text-muted">{st.label}</span>
            {(m.on_hold || m.cancelled) && (
              <span className="text-[10px] font-semibold" style={{ color: m.cancelled ? '#DC2626' : '#B45309' }}>
                {m.cancelled ? 'Cancelled' : 'On hold'}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'channel',
      label: 'Channel',
      render: (m) => {
        const ch = m.channel ? CHANNEL_CFG[m.channel] : null;
        return ch ? (
          <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: ch.bg, color: ch.color }}>
            {ch.label}
          </span>
        ) : <span className="text-[11px] text-text-muted">—</span>;
      },
    },
    {
      key: 'age',
      label: 'Age',
      render: (m) => <span className="text-[11px] text-text-muted whitespace-nowrap">{ageOf(m.created_at)}</span>,
    },
    {
      key: 'next',
      label: 'Next step',
      render: (m) => {
        if (m.cancelled) return <span className="text-[11px] text-text-muted">—</span>;
        const a = primaryActionFor(m.status);
        return (
          <span className="text-[11px] font-semibold text-navy">
            {m.on_hold ? 'On hold' : a ? a.label : 'Done'}
          </span>
        );
      },
    },
    {
      key: 'open',
      label: '',
      align: 'right',
      render: (m) => (
        <Link
          href={`/admin/managed/${m.id}`}
          className="inline-block rounded-[5px] border px-2 py-1 text-[11px] font-semibold text-text-muted hover:border-teal hover:text-navy transition-colors"
        >
          Open →
        </Link>
      ),
    },
  ];

  return (
    <>
      <Topbar title="Managed queue" subtitle="Full-service campaigns" showPeriod={false} />

      <div className="p-[18px]">
        <div className="mb-4 flex items-center justify-end">
          <Link
            href="/admin/managed/new"
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 font-display text-[13px] font-bold transition hover:opacity-90"
            style={{ background: '#00D4AA', color: '#0D0F2E' }}
          >
            <Plus size={15} aria-hidden /> New brief
          </Link>
        </div>

        {/* Stat tiles = filters */}
        <RevealGroup className="mb-[18px] grid grid-cols-2 gap-3 lg:grid-cols-4">
          <RevealItem lift>
            <StatCard label="TOTAL" value={totalCount} icon={Layers} change="All managed jobs" changeType="up"
              onClick={() => setFilter('all')} active={filter === 'all'} />
          </RevealItem>
          <RevealItem lift>
            <StatCard label="IN PRODUCTION" value={inProdCount} icon={Zap} change="Brief & content" changeType="up"
              onClick={() => toggle('in_prod')} active={filter === 'in_prod'} />
          </RevealItem>
          <RevealItem lift>
            <StatCard label="TO SEND" value={sendCount} icon={Send} change="Scheduled to dispatch" changeType="up"
              onClick={() => toggle('send')} active={filter === 'send'} />
          </RevealItem>
          <RevealItem lift>
            <StatCard label="COMPLETE" value={completeCount} icon={CheckCircle2} change="Sent / reported / closed" changeType="up"
              onClick={() => toggle('complete')} active={filter === 'complete'} />
          </RevealItem>
        </RevealGroup>

        {/* Table */}
        <Reveal delay={0.12}>
          <div className={cardBase}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="font-display text-[14px] font-bold text-navy">Jobs</div>
              <div className="flex items-center gap-2 text-[11px] text-text-muted">
                <span>
                  {visible.length}
                  {filter !== 'all' && ` of ${totalCount}`} job{visible.length !== 1 ? 's' : ''}
                </span>
                {filter !== 'all' && (
                  <button type="button" onClick={() => setFilter('all')} className="font-semibold text-teal hover:underline">
                    Clear filter ×
                  </button>
                )}
              </div>
            </div>

            {isLoading || isError ? (
              <DataState loading={isLoading} error={isError ? error : undefined} onRetry={() => refetch()} loadingLabel="Loading jobs…" />
            ) : (
              <DataTable<Managed>
                columns={columns}
                rows={visible}
                rowKey={(m) => m.id}
                empty={
                  filter === 'all'
                    ? 'No managed campaigns yet. Create a brief to start.'
                    : 'No jobs match this filter.'
                }
              />
            )}
          </div>
        </Reveal>
      </div>
    </>
  );
}
