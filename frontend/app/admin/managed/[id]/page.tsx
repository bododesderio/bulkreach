/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 *
 * Managed job — focused single-job workspace. The admin runs the whole job here:
 * write the brief, draft copy, link the campaign, send, and issue the report.
 * No client sign-off and no team assignment — one operator, one clear next step.
 */
'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Check, Pause, Play, Ban, Download, FileText, ExternalLink, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, apiDownload, ApiError } from '@/lib/api';
import { useApiQuery } from '@/lib/hooks';
import Topbar from '@/components/admin/Topbar';
import { Reveal } from '@/components/admin/Reveal';
import { DataState } from '@/components/ui';
import {
  type Managed, type CampaignLite, type Status,
  STEPS, STATUS_CFG, CHANNEL_CFG, stepIndexOf, primaryActionFor,
  initials, fmtDate,
} from '@/lib/managed';

const cardBase = 'bg-white border rounded-[11px] p-5';

// ── Stepper ──────────────────────────────────────────────────────────────────
function Stepper({ status }: { status: Status }) {
  const active = stepIndexOf(status);
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {STEPS.map((s, i) => {
        const done = i < active;
        const current = i === active;
        return (
          <div key={s.key} className="flex items-center gap-1 flex-shrink-0">
            <div className="flex items-center gap-2">
              <div
                className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold"
                style={{
                  background: done || current ? s.color : '#EEF1F8',
                  color: done || current ? '#fff' : '#94A3B8',
                }}
              >
                {done ? <Check size={13} aria-hidden /> : i + 1}
              </div>
              <div className="pr-1">
                <div
                  className="text-[12px] font-bold"
                  style={{ color: current ? '#1B1F4A' : done ? '#475569' : '#94A3B8' }}
                >
                  {s.label}
                </div>
                {current && <div className="text-[10px] text-text-muted">{s.hint}</div>}
              </div>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className="h-[2px] w-6 rounded-full sm:w-10"
                style={{ background: done ? s.color : '#EEF1F8' }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function SectionCard({
  n, title, subtitle, active, children,
}: {
  n: number; title: string; subtitle?: string; active?: boolean; children: React.ReactNode;
}) {
  return (
    <Reveal>
      <div
        className={cardBase}
        style={active ? { boxShadow: '0 0 0 1.5px rgba(0,212,170,0.5)' } : undefined}
      >
        <div className="mb-3 flex items-center gap-2">
          <span
            className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold"
            style={{ background: active ? '#00D4AA' : '#EEF1F8', color: active ? '#0D0F2E' : '#64748B' }}
          >
            {n}
          </span>
          <div>
            <div className="font-display text-[14px] font-bold text-navy">{title}</div>
            {subtitle && <div className="text-[11px] text-text-muted">{subtitle}</div>}
          </div>
        </div>
        {children}
      </div>
    </Reveal>
  );
}

export default function ManagedJobPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const { data, isLoading, isError, error, refetch } = useApiQuery(
    ['admin', 'managed', id],
    async () => {
      const job = await api<Managed>(`/admin/managed/${id}`, { auth: true });
      const camps = await api<{ items: CampaignLite[] }>(
        `/admin/campaigns?limit=500`, { auth: true },
      );
      return { job, campaigns: camps.items };
    },
    { enabled: !!id },
  );

  const job = data?.job ?? null;
  const accountCampaigns = useMemo(() => {
    const camps = data?.campaigns ?? [];
    return job ? camps.filter((c) => c.account_id === job.account_id) : [];
  }, [data, job]);

  // ── local edit drafts ──
  const [brief, setBrief] = useState('');
  const [copy, setCopy] = useState({ copy_sms: '', copy_email_subject: '', copy_email_body: '' });
  const [hydrated, setHydrated] = useState<string | null>(null);
  // Seed drafts once per loaded job.
  if (job && hydrated !== job.id) {
    setBrief(job.brief_text);
    setCopy({
      copy_sms: job.copy_sms ?? '',
      copy_email_subject: job.copy_email_subject ?? '',
      copy_email_body: job.copy_email_body ?? '',
    });
    setHydrated(job.id);
  }

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      await refetch();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  const patch = (body: Record<string, unknown>) =>
    api(`/admin/managed/${id}`, { method: 'PATCH', auth: true, body: JSON.stringify(body) });

  async function doPrimary() {
    if (!job) return;
    const action = primaryActionFor(job.status);
    if (!action) return;
    if (action.kind === 'report') {
      await run(() => api(`/admin/managed/${id}/report`, { method: 'POST', auth: true }), 'Report issued');
    } else {
      await run(() => patch({ status: action.target }), `Moved to ${STATUS_CFG[action.target].label}`);
    }
  }

  async function cancelJob() {
    if (!job) return;
    if (!window.confirm(`Cancel "${job.account_name ?? 'this job'}"? This cannot be undone.`)) return;
    await run(() => api(`/admin/managed/${id}/cancel`, { method: 'POST', auth: true }), 'Job cancelled');
  }

  async function toggleHold() {
    if (!job) return;
    const ep = job.on_hold ? 'unhold' : 'hold';
    await run(() => api(`/admin/managed/${id}/${ep}`, { method: 'POST', auth: true }),
      job.on_hold ? 'Job resumed' : 'Job put on hold');
  }

  async function downloadReport() {
    setBusy(true);
    try {
      await apiDownload(`/admin/managed/${id}/report/download`, 'campaign-report.pdf');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Download failed');
    } finally {
      setBusy(false);
    }
  }

  // ── render ──
  if (isLoading || isError || !job) {
    return (
      <>
        <Topbar title="Managed job" subtitle="Full-service campaign" showPeriod={false} />
        <div className="p-[18px]">
          <Link href="/admin/managed" className="mb-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-teal hover:underline">
            <ArrowLeft size={14} aria-hidden /> Back to queue
          </Link>
          <div className={cardBase}>
            <DataState
              loading={isLoading}
              error={isError ? error : undefined}
              onRetry={() => refetch()}
              loadingLabel="Loading job…"
            />
          </div>
        </div>
      </>
    );
  }

  const st = STATUS_CFG[job.status];
  const chCfg = job.channel ? CHANNEL_CFG[job.channel] : null;
  const action = primaryActionFor(job.status);
  const activeStep = stepIndexOf(job.status); // 0 brief · 1 content · 2 send · 3 report
  const hasCopy = !!(copy.copy_sms || copy.copy_email_body);
  const linked = accountCampaigns.find((c) => c.id === job.campaign_id);

  return (
    <>
      <Topbar title="Managed job" subtitle={job.account_name ?? 'Full-service campaign'} showPeriod={false} />

      <div className="p-[18px] space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Link href="/admin/managed" className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-teal hover:underline">
            <ArrowLeft size={14} aria-hidden /> Back to queue
          </Link>
          {job.account_id && (
            <Link href={`/admin/accounts/${job.account_id}`} className="inline-flex items-center gap-1 text-[11px] font-semibold text-text-muted hover:text-navy">
              View client account <ExternalLink size={12} aria-hidden />
            </Link>
          )}
        </div>

        {/* ── Header + stepper + primary action ── */}
        <Reveal>
          <div className={cardBase}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <div
                  className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-[14px] font-bold"
                  style={{ background: 'rgba(0,212,170,0.12)', color: '#009980' }}
                  aria-hidden
                >
                  {initials(job.account_name)}
                </div>
                <div className="min-w-0">
                  <h1 className="font-display text-[18px] font-extrabold text-navy truncate">
                    {job.account_name ?? '—'}
                  </h1>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                      style={{ background: `${st.color}1f`, color: st.color }}
                    >
                      {st.label}
                    </span>
                    {chCfg && (
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: chCfg.bg, color: chCfg.color }}>
                        {chCfg.label}
                      </span>
                    )}
                    {job.on_hold && (
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: 'rgba(245,158,11,0.15)', color: '#B45309' }}>On hold</span>
                    )}
                    {job.cancelled && (
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: 'rgba(239,68,68,0.12)', color: '#DC2626' }}>Cancelled</span>
                    )}
                    <span className="text-[11px] text-text-muted">· Created {fmtDate(job.created_at)}</span>
                  </div>
                </div>
              </div>

              {/* Primary action + hold/cancel */}
              {!job.cancelled && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleHold}
                    disabled={busy}
                    className="inline-flex items-center gap-1 rounded-[7px] border px-2.5 py-2 text-[12px] font-semibold text-text-muted hover:border-teal hover:text-navy disabled:opacity-50"
                  >
                    {job.on_hold ? <><Play size={13} aria-hidden /> Resume</> : <><Pause size={13} aria-hidden /> Hold</>}
                  </button>
                  <button
                    type="button"
                    onClick={cancelJob}
                    disabled={busy}
                    className="inline-flex items-center gap-1 rounded-[7px] border px-2.5 py-2 text-[12px] font-semibold text-text-muted hover:border-red-400 hover:text-red-600 disabled:opacity-50"
                    aria-label="Cancel job"
                  >
                    <Ban size={13} aria-hidden /> Cancel
                  </button>
                  {action && (
                    <button
                      type="button"
                      onClick={doPrimary}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 font-display text-[13px] font-bold transition hover:opacity-90 disabled:opacity-50"
                      style={{ background: '#00D4AA', color: '#0D0F2E' }}
                    >
                      {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Check size={14} aria-hidden />}
                      {action.label}
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="mt-4 border-t pt-4">
              <Stepper status={job.status} />
            </div>
          </div>
        </Reveal>

        {/* ── 1. Brief ── */}
        <SectionCard n={1} title="Brief" subtitle="What the client wants" active={activeStep === 0}>
          <textarea
            className="input min-h-[90px] w-full text-[13px]"
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            disabled={busy || job.cancelled}
            placeholder="Describe the campaign goal, audience and key message…"
          />
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => run(() => patch({ brief_text: brief.trim() }), 'Brief saved')}
              disabled={busy || job.cancelled || brief.trim() === job.brief_text}
              className="rounded-full px-3.5 py-1.5 text-[12px] font-bold transition hover:opacity-90 disabled:opacity-40"
              style={{ background: '#EEF1F8', color: '#1B1F4A' }}
            >
              Save brief
            </button>
          </div>
        </SectionCard>

        {/* ── 2. Content ── */}
        <SectionCard n={2} title="Content" subtitle="Draft the copy and link the campaign that will run" active={activeStep === 1}>
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-navy">SMS copy</label>
              <textarea
                className="input min-h-[80px] w-full text-[13px]"
                value={copy.copy_sms}
                onChange={(e) => setCopy((c) => ({ ...c, copy_sms: e.target.value }))}
                disabled={busy || job.cancelled}
                placeholder="Hi {{name}}, …"
              />
            </div>
            <div className="space-y-2">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-navy">Email subject</label>
                <input
                  className="input w-full text-[13px]"
                  value={copy.copy_email_subject}
                  onChange={(e) => setCopy((c) => ({ ...c, copy_email_subject: e.target.value }))}
                  disabled={busy || job.cancelled}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-navy">Email body</label>
                <textarea
                  className="input min-h-[80px] w-full text-[13px]"
                  value={copy.copy_email_body}
                  onChange={(e) => setCopy((c) => ({ ...c, copy_email_body: e.target.value }))}
                  disabled={busy || job.cancelled}
                />
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
            {/* Campaign link */}
            <div className="text-[12px]">
              {linked ? (
                <span className="text-text-muted">
                  Linked campaign:{' '}
                  <Link href={`/admin/campaigns`} className="font-semibold text-teal hover:underline">
                    {linked.name}
                  </Link>
                </span>
              ) : accountCampaigns.length > 0 ? (
                <label className="flex items-center gap-2">
                  <span className="text-text-muted">Link campaign:</span>
                  <select
                    className="input text-[12px]"
                    defaultValue=""
                    disabled={busy || job.cancelled}
                    onChange={(e) => e.target.value && run(() => patch({ campaign_id: e.target.value }), 'Campaign linked')}
                  >
                    <option value="">Choose…</option>
                    {accountCampaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
              ) : (
                <span className="text-text-muted">
                  No campaigns for this client yet — create one from the client&apos;s dashboard, then link it here.
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => run(() => patch({
                copy_sms: copy.copy_sms || null,
                copy_email_subject: copy.copy_email_subject || null,
                copy_email_body: copy.copy_email_body || null,
              }), 'Copy saved')}
              disabled={busy || job.cancelled}
              className="rounded-full px-3.5 py-1.5 text-[12px] font-bold transition hover:opacity-90 disabled:opacity-40"
              style={{ background: '#EEF1F8', color: '#1B1F4A' }}
            >
              Save copy
            </button>
          </div>
        </SectionCard>

        {/* ── 3. Send ── */}
        <SectionCard n={3} title="Send" subtitle="Schedule and dispatch the campaign" active={activeStep === 2}>
          {!job.campaign_id ? (
            <p className="text-[12.5px] text-text-muted">
              Link a campaign in the Content step first — that&apos;s what actually gets dispatched.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
              <span className="text-text-muted">
                Ready to dispatch <span className="font-semibold text-navy">{job.campaign_name ?? 'the linked campaign'}</span>
                {job.audience != null && <> · {job.audience.toLocaleString()} recipients</>}.
              </span>
              <Link
                href="/admin/campaigns"
                className="inline-flex items-center gap-1 rounded-[7px] border px-2.5 py-1.5 text-[12px] font-semibold text-text-muted hover:border-teal hover:text-navy"
              >
                Open campaign <ExternalLink size={12} aria-hidden />
              </Link>
            </div>
          )}
          {(job.status === 'scheduled' || job.status === 'sending') && (
            <p className="mt-2 text-[11px] text-text-muted">
              Once the campaign has gone out, use <span className="font-semibold">Mark as sent</span> above.
            </p>
          )}
        </SectionCard>

        {/* ── 4. Report ── */}
        <SectionCard n={4} title="Report" subtitle="Issue the branded client report" active={activeStep >= 3}>
          <div className="flex flex-wrap items-center gap-2">
            {job.status === 'sent' && (
              <button
                type="button"
                onClick={() => run(() => api(`/admin/managed/${id}/report`, { method: 'POST', auth: true }), 'Report issued')}
                disabled={busy || !job.campaign_id}
                title={!job.campaign_id ? 'Link a campaign first' : undefined}
                className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-bold transition hover:opacity-90 disabled:opacity-40"
                style={{ background: '#EEF1F8', color: '#1B1F4A' }}
              >
                <FileText size={13} aria-hidden /> Issue report
              </button>
            )}
            {job.report_ready ? (
              <button
                type="button"
                onClick={downloadReport}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12px] font-bold text-navy transition hover:border-teal disabled:opacity-40"
              >
                <Download size={13} aria-hidden /> Download PDF
              </button>
            ) : job.status !== 'sent' && (
              <p className="text-[12.5px] text-text-muted">Report becomes available once the campaign is marked as sent.</p>
            )}
          </div>
        </SectionCard>
      </div>
    </>
  );
}
