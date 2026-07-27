'use client';

import { useCallback, useEffect, useState } from 'react';
import { FileText, Zap, CheckCircle2, Layers, Plus, X, UserPlus, Download } from 'lucide-react';
import { toast } from 'sonner';
import Topbar from '@/components/admin/Topbar';
import { RevealGroup, RevealItem, Reveal } from '@/components/admin/Reveal';
import StatCard from '@/components/admin/StatCard';
import { StatusPill } from '@/components/admin/StatusPill';
import { api, apiDownload, ApiError } from '@/lib/api';
import { useAuth } from '@/store/auth';

const cardBase = 'bg-white border rounded-[11px] p-4';

// ── Backend lifecycle ──────────────────────────────────────────────────────
type Stage =
  | 'briefed'
  | 'copy_approved'
  | 'scheduled'
  | 'sending'
  | 'complete'
  | 'report_issued';

const STAGE_ORDER: Stage[] = [
  'briefed', 'copy_approved', 'scheduled', 'sending', 'complete', 'report_issued',
];

const STAGE_CFG: Record<Stage, { label: string; color: string; pulse: boolean }> = {
  briefed:       { label: 'Briefed',       color: '#9CA3AF', pulse: false },
  copy_approved: { label: 'Copy approved', color: '#F59E0B', pulse: false },
  scheduled:     { label: 'Scheduled',     color: '#6366F1', pulse: false },
  sending:       { label: 'Sending',       color: '#10B981', pulse: true  },
  complete:      { label: 'Complete',      color: '#00D4AA', pulse: false },
  report_issued: { label: 'Report issued', color: '#1B1F4A', pulse: false },
};

// Next-stage advance action per stage (null = terminal or report-only).
const NEXT_ACTION: Partial<Record<Stage, { next: Stage; label: string }>> = {
  briefed:       { next: 'copy_approved', label: 'Approve copy' },
  copy_approved: { next: 'scheduled',     label: 'Mark scheduled' },
  scheduled:     { next: 'sending',       label: 'Mark sending' },
  sending:       { next: 'complete',      label: 'Mark complete' },
};

interface Managed {
  id: string;
  account_id: string;
  account_name: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  channel: 'sms' | 'email' | 'both' | null;
  audience: number | null;
  brief_text: string;
  status: Stage;
  account_manager_id: string | null;
  account_manager_email: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  report_ready: boolean;
  report_url: string | null;
}

interface ManagedResponse {
  items: Managed[];
  stats: { total: number; pending: number; in_flight: number; complete: number };
}

interface AccountLite {
  id: string;
  name: string;
}

interface CampaignLite {
  id: string;
  account_id: string;
  name: string;
  status: string;
}

const CHANNEL_CFG: Record<string, { label: string; color: string; bg: string }> = {
  sms:   { label: 'SMS',         color: '#1B1F4A', bg: 'rgba(27,31,74,0.08)' },
  email: { label: 'Email',       color: '#009980', bg: 'rgba(0,212,170,0.12)' },
  both:  { label: 'SMS + Email', color: '#6366F1', bg: 'rgba(99,102,241,0.10)' },
};

function initials(name: string | null): string {
  if (!name) return '—';
  return name.split(/\s+/).slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase();
}

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—';

export default function ManagedPage() {
  const { user, loadMe } = useAuth();
  const [data, setData] = useState<ManagedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  // New-brief modal
  const [creating, setCreating] = useState(false);
  const [accounts, setAccounts] = useState<AccountLite[]>([]);
  const [formAccount, setFormAccount] = useState('');
  const [formBrief, setFormBrief] = useState('');
  const [saving, setSaving] = useState(false);

  const [campaigns, setCampaigns] = useState<CampaignLite[]>([]);

  const load = useCallback(async () => {
    try {
      const [res, camps] = await Promise.all([
        api<ManagedResponse>('/admin/managed', { auth: true }),
        api<{ items: CampaignLite[] }>('/admin/campaigns?limit=500', { auth: true }),
      ]);
      setData(res);
      setCampaigns(camps.items);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Failed to load managed queue');
    } finally {
      setLoading(false);
    }
  }, []);

  async function linkCampaign(m: Managed, campaignId: string) {
    if (!campaignId) return;
    setBusyId(m.id);
    try {
      await api(`/admin/managed/${m.id}`, {
        method: 'PATCH', auth: true, body: JSON.stringify({ campaign_id: campaignId }),
      });
      toast.success('Campaign linked');
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Link failed');
    } finally {
      setBusyId(null);
    }
  }

  async function downloadReport(m: Managed) {
    setBusyId(m.id);
    try {
      await apiDownload(`/admin/managed/${m.id}/report/download`, 'campaign-report.pdf');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Download failed');
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    load();
    // Admin layout doesn't hydrate the auth store; ensure the current user is
    // loaded so "Assign to me" has an id to send.
    if (!user) loadMe();
  }, [load, user, loadMe]);

  async function openNew() {
    setFormAccount('');
    setFormBrief('');
    setCreating(true);
    if (accounts.length === 0) {
      try {
        const res = await api<{ items: AccountLite[] }>('/admin/accounts?limit=200', { auth: true });
        setAccounts(res.items.map((a) => ({ id: a.id, name: a.name })));
      } catch {
        /* selector stays empty; user can retry */
      }
    }
  }

  async function createBrief() {
    if (!formAccount) {
      toast.error('Select an account');
      return;
    }
    if (!formBrief.trim()) {
      toast.error('Enter a brief');
      return;
    }
    setSaving(true);
    try {
      await api('/admin/managed', {
        method: 'POST',
        auth: true,
        body: JSON.stringify({ account_id: formAccount, brief_text: formBrief.trim() }),
      });
      toast.success('Brief created');
      setCreating(false);
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Create failed');
    } finally {
      setSaving(false);
    }
  }

  async function advance(m: Managed) {
    const step = NEXT_ACTION[m.status];
    if (!step) return;
    setBusyId(m.id);
    try {
      await api(`/admin/managed/${m.id}`, {
        method: 'PATCH',
        auth: true,
        body: JSON.stringify({ status: step.next }),
      });
      toast.success(`${m.account_name ?? 'Campaign'} → ${STAGE_CFG[step.next].label}`);
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Update failed');
    } finally {
      setBusyId(null);
    }
  }

  async function issueReport(m: Managed) {
    setBusyId(m.id);
    try {
      await api(`/admin/managed/${m.id}/report`, { method: 'POST', auth: true });
      toast.success(`Report issued — ${m.account_name ?? 'campaign'}`);
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not issue report');
    } finally {
      setBusyId(null);
    }
  }

  async function assignToMe(m: Managed) {
    let uid = user?.id;
    if (!uid) {
      await loadMe();
      uid = useAuth.getState().user?.id;
    }
    if (!uid) {
      toast.error('Could not determine your user — reload and try again');
      return;
    }
    setBusyId(m.id);
    try {
      await api(`/admin/managed/${m.id}`, {
        method: 'PATCH',
        auth: true,
        body: JSON.stringify({ account_manager_id: uid }),
      });
      toast.success('Assigned to you');
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Assign failed');
    } finally {
      setBusyId(null);
    }
  }

  const items = data?.items ?? [];
  const stats = data?.stats ?? { total: 0, pending: 0, in_flight: 0, complete: 0 };

  return (
    <>
      <Topbar title="Managed queue" subtitle="Full-service campaign pipeline" showPeriod={false} />

      <div className="p-[18px]">
        <div className="flex items-center justify-end mb-4">
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-1.5 rounded-full font-display font-bold text-[13px] px-4 py-2 transition hover:opacity-90"
            style={{ background: '#00D4AA', color: '#0D0F2E' }}
          >
            <Plus size={15} aria-hidden="true" /> New brief
          </button>
        </div>

        {/* KPI row */}
        <RevealGroup className="grid grid-cols-4 gap-3 mb-[18px]">
          <RevealItem lift>
            <StatCard label="PENDING" value={stats.pending} icon={FileText}
              changeType="warn" change="Awaiting action" warn />
          </RevealItem>
          <RevealItem lift>
            <StatCard label="IN FLIGHT" value={stats.in_flight} icon={Zap}
              change="Scheduled / sending" changeType="up" />
          </RevealItem>
          <RevealItem lift>
            <StatCard label="COMPLETE" value={stats.complete} icon={CheckCircle2}
              change="Done / reported" changeType="up" />
          </RevealItem>
          <RevealItem lift>
            <StatCard label="TOTAL" value={stats.total} icon={Layers}
              change="All managed campaigns" changeType="up" />
          </RevealItem>
        </RevealGroup>

        {/* Pipeline */}
        <Reveal delay={0.2} className={cardBase}>
          <div className="font-display text-[14px] font-bold text-navy mb-0.5">Campaign pipeline</div>
          <div className="text-[11px] text-text-muted mb-5">
            {items.length} campaign{items.length !== 1 ? 's' : ''} &middot; ops queue by stage
          </div>

          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-[10px] border bg-[#FAFBFE]" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-10 text-[13px] text-text-muted">
              No managed campaigns yet. Create a brief to start the pipeline.
            </div>
          ) : (
            STAGE_ORDER.map((stage) => {
              const stageItems = items.filter((m) => m.status === stage);
              if (stageItems.length === 0) return null;
              const cfg = STAGE_CFG[stage];
              return (
                <div key={stage} className="mb-6 last:mb-0">
                  <div className="flex items-center gap-2 mb-3">
                    <StatusPill label={cfg.label} color={cfg.color} pulse={cfg.pulse} />
                    <span className="text-[11px] text-text-muted">
                      {stageItems.length} item{stageItems.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  <RevealGroup className="flex flex-col gap-2">
                    {stageItems.map((item) => {
                      const chCfg = item.channel ? CHANNEL_CFG[item.channel] : null;
                      const step = NEXT_ACTION[item.status];
                      const busy = busyId === item.id;
                      return (
                        <RevealItem key={item.id} lift>
                          <div className="border rounded-[10px] p-4 flex items-start gap-3" style={{ background: '#FAFBFE' }}>
                            <div
                              className="flex-shrink-0 flex items-center justify-center rounded-full font-bold text-[13px]"
                              style={{ width: 38, height: 38, background: 'rgba(0,212,170,0.12)', color: '#009980' }}
                              aria-hidden="true"
                            >
                              {initials(item.account_name)}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="font-semibold text-[13px] truncate" style={{ color: '#1B1F4A' }}>
                                    {item.account_name ?? '—'}
                                  </div>

                                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                                    {chCfg && (
                                      <span style={{ background: chCfg.bg, color: chCfg.color, padding: '1px 7px', fontSize: '9px', fontWeight: 700, borderRadius: '9999px', letterSpacing: '0.04em' }}>
                                        {chCfg.label}
                                      </span>
                                    )}
                                    {item.audience != null && (
                                      <span className="text-[11px] font-mono text-text-muted">
                                        {item.audience.toLocaleString()} sent
                                      </span>
                                    )}
                                    {item.campaign_name && (
                                      <span className="text-[11px] text-text-muted truncate">· {item.campaign_name}</span>
                                    )}
                                  </div>

                                  <div className="text-[11px] text-text-muted mt-1 leading-snug line-clamp-2">
                                    {item.brief_text}
                                  </div>

                                  <div className="flex items-center gap-4 mt-1.5 text-[10.5px] text-text-muted">
                                    <span>
                                      Manager:{' '}
                                      <span className="font-medium">{item.account_manager_email ?? 'Unassigned'}</span>
                                    </span>
                                    {item.approved_at && <span>Approved: <span className="font-medium">{fmtDate(item.approved_at)}</span></span>}
                                    <span>Created: <span className="font-medium">{fmtDate(item.created_at)}</span></span>
                                  </div>
                                </div>

                                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                                  {!item.account_manager_id && (
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() => assignToMe(item)}
                                      className="inline-flex items-center gap-1 text-[10.5px] rounded-[5px] border bg-transparent font-semibold text-text-muted px-2 py-1 hover:border-teal hover:text-navy transition-colors disabled:opacity-50"
                                    >
                                      <UserPlus size={11} /> Assign to me
                                    </button>
                                  )}
                                  {step && (
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() => advance(item)}
                                      className="text-[11px] rounded-[5px] font-semibold px-3 py-1.5 transition hover:opacity-90 disabled:opacity-50"
                                      style={{ background: '#00D4AA', color: '#0D0F2E' }}
                                    >
                                      {busy ? '…' : step.label}
                                    </button>
                                  )}
                                  {/* Complete but no campaign linked → pick the campaign that ran */}
                                  {item.status === 'complete' && !item.campaign_id && (
                                    <select
                                      aria-label="Link campaign"
                                      disabled={busy}
                                      defaultValue=""
                                      onChange={(e) => linkCampaign(item, e.target.value)}
                                      className="input text-[11px]"
                                      style={{ maxWidth: 180, padding: '4px 6px' }}
                                    >
                                      <option value="">Link campaign…</option>
                                      {campaigns
                                        .filter((c) => c.account_id === item.account_id)
                                        .map((c) => (
                                          <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                  )}
                                  {item.status === 'complete' && item.campaign_id && (
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() => issueReport(item)}
                                      className="text-[11px] rounded-[5px] font-semibold px-3 py-1.5 transition hover:opacity-90 disabled:opacity-50"
                                      style={{ background: '#1B1F4A', color: '#fff' }}
                                    >
                                      {busy ? '…' : 'Issue report'}
                                    </button>
                                  )}
                                  {item.status === 'report_issued' && (
                                    <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold" style={{ color: '#00897a' }}>
                                      <CheckCircle2 size={12} /> Delivered
                                    </span>
                                  )}
                                  {item.report_ready && (
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() => downloadReport(item)}
                                      className="inline-flex items-center gap-1 text-[10.5px] rounded-[5px] border bg-transparent font-semibold text-text-muted px-2 py-1 hover:border-teal hover:text-navy transition-colors disabled:opacity-50"
                                    >
                                      <Download size={11} /> Download report
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </RevealItem>
                      );
                    })}
                  </RevealGroup>
                </div>
              );
            })
          )}
        </Reveal>
      </div>

      {/* New-brief modal */}
      {creating && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8"
          style={{ background: 'rgba(13,15,46,0.45)' }}
          role="dialog"
          aria-modal="true"
          aria-label="New managed brief"
          onClick={() => !saving && setCreating(false)}
        >
          <div className="w-full max-w-lg animate-fade-up" onClick={(e) => e.stopPropagation()}>
            <div className="bg-white border rounded-[11px] p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display font-bold text-[16px] text-navy">New managed brief</h2>
                <button type="button" onClick={() => !saving && setCreating(false)} aria-label="Close"
                  className="rounded-md p-1 text-text-muted transition hover:bg-black/[0.05] hover:text-navy">
                  <X size={18} />
                </button>
              </div>

              <label htmlFor="mb-account" className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted mb-1.5">
                Client account
              </label>
              <select id="mb-account" className="input mb-4" value={formAccount} onChange={(e) => setFormAccount(e.target.value)}>
                <option value="">— select account —</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>

              <label htmlFor="mb-brief" className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted mb-1.5">
                Brief
              </label>
              <textarea id="mb-brief" className="input" rows={4} style={{ resize: 'vertical' }}
                placeholder="e.g. Send 5,000 SMS payment reminders to overdue borrowers by Friday."
                value={formBrief} onChange={(e) => setFormBrief(e.target.value)} />

              <div className="flex gap-2 justify-end mt-4">
                <button type="button" className="btn-outline" disabled={saving} onClick={() => setCreating(false)}>
                  Cancel
                </button>
                <button type="button" disabled={saving} onClick={createBrief}
                  className="rounded-full font-display font-bold text-[13px] px-4 py-2 transition hover:opacity-90 disabled:opacity-60"
                  style={{ background: '#00D4AA', color: '#0D0F2E' }}>
                  {saving ? 'Creating…' : 'Create brief'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
