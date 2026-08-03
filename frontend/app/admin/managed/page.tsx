/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
'use client';

import { useEffect, useState } from 'react';
import {
  FileText, Zap, CheckCircle2, Layers, Plus, X, UserPlus, Download,
  Pause, Play, Ban, Send, Pencil, Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import Topbar from '@/components/admin/Topbar';
import { RevealGroup, RevealItem, Reveal } from '@/components/admin/Reveal';
import StatCard from '@/components/admin/StatCard';
import { StatusPill } from '@/components/admin/StatusPill';
import { api, apiDownload, ApiError } from '@/lib/api';
import { useApiQuery } from '@/lib/hooks';
import { useAuth } from '@/store/auth';

const cardBase = 'bg-white border rounded-[11px] p-4';

// ─── 15-state pipeline ────────────────────────────────────────────────────────

type Status =
  | 'requested'
  | 'briefed'
  | 'assigned'
  | 'audience_pending'
  | 'audience_ready'
  | 'drafting'
  | 'internal_review'
  | 'awaiting_approval'
  | 'approved'
  | 'scheduled'
  | 'sending'
  | 'sent'
  | 'report_issued'
  | 'closed'
  | 'changes_requested';

// Linear order (changes_requested is a loop state, excluded from linear chain)
const LINEAR_ORDER: Status[] = [
  'requested', 'briefed', 'assigned',
  'audience_pending', 'audience_ready', 'drafting', 'internal_review',
  'awaiting_approval', 'approved',
  'scheduled', 'sending', 'sent',
  'report_issued', 'closed',
];

const STATUS_CFG: Record<Status, { label: string; color: string; pulse: boolean }> = {
  requested:         { label: 'Requested',        color: '#94A3B8', pulse: false },
  briefed:           { label: 'Briefed',           color: '#60A5FA', pulse: false },
  assigned:          { label: 'Assigned',          color: '#818CF8', pulse: false },
  audience_pending:  { label: 'Audience pending',  color: '#F59E0B', pulse: false },
  audience_ready:    { label: 'Audience ready',    color: '#FB923C', pulse: false },
  drafting:          { label: 'Drafting',          color: '#3B82F6', pulse: false },
  internal_review:   { label: 'Internal review',  color: '#0EA5E9', pulse: false },
  awaiting_approval: { label: 'Awaiting approval',color: '#EF4444', pulse: false },
  changes_requested: { label: 'Changes requested',color: '#DC2626', pulse: false },
  approved:          { label: 'Approved',          color: '#10B981', pulse: false },
  scheduled:         { label: 'Scheduled',         color: '#6366F1', pulse: false },
  sending:           { label: 'Sending',           color: '#10B981', pulse: true  },
  sent:              { label: 'Sent',              color: '#00D4AA', pulse: false },
  report_issued:     { label: 'Report issued',     color: '#1B1F4A', pulse: false },
  closed:            { label: 'Closed',            color: '#6B7280', pulse: false },
};

function getValidTransitions(status: Status): Status[] {
  if (status === 'changes_requested') return ['drafting', 'awaiting_approval'];
  const idx = LINEAR_ORDER.indexOf(status);
  if (idx === -1) return [];
  const nexts: Status[] = LINEAR_ORDER.slice(idx + 1);
  if (status === 'awaiting_approval') nexts.push('changes_requested');
  return nexts;
}

// ─── Lane definitions ─────────────────────────────────────────────────────────

interface LaneDef {
  key: string;
  label: string;
  states: Status[];
  bg: string;
  headerColor: string;
}

const LANES: LaneDef[] = [
  {
    key: 'intake',
    label: 'Intake',
    states: ['requested', 'briefed', 'assigned'],
    bg: 'rgba(99,102,241,0.05)',
    headerColor: '#6366F1',
  },
  {
    key: 'production',
    label: 'Production',
    states: ['audience_pending', 'audience_ready', 'drafting', 'internal_review'],
    bg: 'rgba(59,130,246,0.05)',
    headerColor: '#3B82F6',
  },
  {
    key: 'approval',
    label: 'Approval',
    states: ['awaiting_approval', 'changes_requested', 'approved'],
    bg: 'rgba(239,68,68,0.05)',
    headerColor: '#EF4444',
  },
  {
    key: 'dispatch',
    label: 'Dispatch',
    states: ['scheduled', 'sending', 'sent'],
    bg: 'rgba(16,185,129,0.05)',
    headerColor: '#10B981',
  },
  {
    key: 'wrapup',
    label: 'Wrap-up',
    states: ['report_issued', 'closed'],
    bg: 'rgba(107,114,128,0.05)',
    headerColor: '#6B7280',
  },
];

// ─── Domain types ─────────────────────────────────────────────────────────────

interface Managed {
  id: string;
  account_id: string;
  account_name: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  channel: 'sms' | 'email' | 'both' | null;
  audience: number | null;
  brief_text: string;
  status: Status;
  account_manager_id: string | null;
  account_manager_email: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  report_ready: boolean;
  report_url: string | null;
  copy_sms: string | null;
  copy_email_subject: string | null;
  copy_email_body: string | null;
  approval_sent_at: string | null;
  approval_expires_at: string | null;
  change_request_note: string | null;
  on_hold: boolean;
  cancelled: boolean;
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

interface StaffUser {
  id: string;
  email: string;
  role: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

const IN_PROD_STATES = new Set<Status>([
  'requested', 'briefed', 'assigned',
  'audience_pending', 'audience_ready', 'drafting', 'internal_review',
]);

const COMPLETE_STATES = new Set<Status>(['sent', 'report_issued', 'closed']);

// ─── Card component ───────────────────────────────────────────────────────────

interface CardProps {
  item: Managed;
  busy: boolean;
  staff: StaffUser[];
  campaigns: CampaignLite[];
  onStatusChange: (item: Managed, next: Status) => void;
  onEditCopy: (item: Managed) => void;
  onSendApproval: (item: Managed) => void;
  onAssignManager: (item: Managed, userId: string) => void;
  onAssignToMe: (item: Managed) => void;
  onLinkCampaign: (item: Managed, campaignId: string) => void;
  onHold: (item: Managed) => void;
  onCancel: (item: Managed) => void;
  onIssueReport: (item: Managed) => void;
  onDownloadReport: (item: Managed) => void;
}

function ManagedCard({
  item,
  busy,
  staff,
  campaigns,
  onStatusChange,
  onEditCopy,
  onSendApproval,
  onAssignManager,
  onAssignToMe,
  onLinkCampaign,
  onHold,
  onCancel,
  onIssueReport,
  onDownloadReport,
}: CardProps) {
  const chCfg = item.channel ? CHANNEL_CFG[item.channel] : null;
  const transitions = getValidTransitions(item.status);
  const hasCopy = !!(item.copy_sms || item.copy_email_body);
  const canIssueReport =
    (item.status === 'sent' || item.status === 'report_issued') && !!item.campaign_id;
  const accountCampaigns = campaigns.filter((c) => c.account_id === item.account_id);

  return (
    <div
      className={`border rounded-[10px] p-3 flex flex-col gap-2 transition-opacity${item.cancelled ? ' opacity-40' : ''}`}
      style={{ background: '#FAFBFE' }}
    >
      {/* Header */}
      <div className="flex items-start gap-2">
        <div
          className="flex-shrink-0 flex items-center justify-center rounded-full font-bold text-[11px]"
          style={{ width: 30, height: 30, background: 'rgba(0,212,170,0.12)', color: '#009980' }}
          aria-hidden="true"
        >
          {initials(item.account_name)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate text-[12px]" style={{ color: '#1B1F4A' }}>
            {item.account_name ?? '—'}
          </div>
          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
            {chCfg && (
              <span
                style={{
                  background: chCfg.bg, color: chCfg.color,
                  padding: '1px 6px', fontSize: '9px', fontWeight: 700,
                  borderRadius: '9999px', letterSpacing: '0.04em',
                }}
              >
                {chCfg.label}
              </span>
            )}
            {item.on_hold && (
              <span
                style={{
                  background: 'rgba(245,158,11,0.15)', color: '#B45309',
                  padding: '1px 6px', fontSize: '9px', fontWeight: 700,
                  borderRadius: '9999px',
                }}
              >
                On hold
              </span>
            )}
            {item.cancelled && (
              <span
                style={{
                  background: 'rgba(239,68,68,0.12)', color: '#DC2626',
                  padding: '1px 6px', fontSize: '9px', fontWeight: 700,
                  borderRadius: '9999px',
                }}
              >
                Cancelled
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Brief */}
      <div className="text-[11px] text-text-muted leading-snug line-clamp-2">
        {item.brief_text}
      </div>

      {/* changes_requested: client note banner */}
      {item.status === 'changes_requested' && item.change_request_note && (
        <div
          className="rounded-[6px] p-2 text-[10.5px] leading-snug"
          style={{
            background: 'rgba(220,38,38,0.08)',
            color: '#DC2626',
            borderLeft: '2px solid #DC2626',
          }}
          role="alert"
        >
          <span className="font-semibold block mb-0.5">Client note</span>
          {item.change_request_note}
        </div>
      )}

      {/* awaiting_approval: expires banner */}
      {item.status === 'awaiting_approval' && item.approval_expires_at && (
        <div
          className="rounded-[6px] px-2 py-1.5 text-[10.5px] flex items-center gap-1"
          style={{ background: 'rgba(239,68,68,0.06)', color: '#B91C1C' }}
        >
          <Clock size={10} aria-hidden="true" />
          <span>Awaiting client &middot; expires {fmtDate(item.approval_expires_at)}</span>
        </div>
      )}

      {/* Meta */}
      <div className="text-[10.5px] text-text-muted space-y-0.5">
        <div className="truncate">
          Manager:{' '}
          <span className="font-medium">{item.account_manager_email ?? 'Unassigned'}</span>
        </div>
        {item.audience != null && (
          <div>
            Audience:{' '}
            <span className="font-medium font-mono">{item.audience.toLocaleString()}</span>
          </div>
        )}
        {item.campaign_name && (
          <div className="truncate">
            Campaign: <span className="font-medium">{item.campaign_name}</span>
          </div>
        )}
        <div>Created: <span className="font-medium">{fmtDate(item.created_at)}</span></div>
      </div>

      {/* Status transition select */}
      {transitions.length > 0 && !item.cancelled && (
        <select
          aria-label="Move to status"
          disabled={busy}
          defaultValue=""
          onChange={(e) => {
            const val = e.target.value;
            if (val) onStatusChange(item, val as Status);
          }}
          className="input text-[11px]"
          style={{ padding: '4px 6px' }}
        >
          <option value="">Move to&hellip;</option>
          {transitions.map((s) => (
            <option key={s} value={s}>{STATUS_CFG[s].label}</option>
          ))}
        </select>
      )}

      {/* Assign manager (when unassigned) */}
      {!item.account_manager_id && !item.cancelled && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={busy}
            onClick={() => onAssignToMe(item)}
            className="inline-flex items-center gap-1 text-[10.5px] rounded-[5px] border bg-transparent font-semibold text-text-muted px-2 py-1 hover:border-teal hover:text-navy transition-colors disabled:opacity-50"
            aria-label="Assign to me"
          >
            <UserPlus size={10} aria-hidden="true" /> Me
          </button>
          {staff.length > 0 && (
            <select
              aria-label="Assign manager"
              disabled={busy}
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) onAssignManager(item, e.target.value);
              }}
              className="input text-[10.5px] flex-1"
              style={{ padding: '3px 5px' }}
            >
              <option value="">Assign&hellip;</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>{s.email}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Link campaign */}
      {!item.campaign_id && !item.cancelled && accountCampaigns.length > 0 && (
        <select
          aria-label="Link campaign"
          disabled={busy}
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) onLinkCampaign(item, e.target.value);
          }}
          className="input text-[11px]"
          style={{ padding: '4px 6px' }}
        >
          <option value="">Link campaign&hellip;</option>
          {accountCampaigns.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      )}

      {/* Secondary actions */}
      {!item.cancelled && (
        <div className="flex items-center gap-1 flex-wrap">
          <button
            type="button"
            disabled={busy}
            onClick={() => onEditCopy(item)}
            className="inline-flex items-center gap-1 text-[10px] rounded-[5px] border bg-transparent font-semibold text-text-muted px-1.5 py-1 hover:border-teal hover:text-navy transition-colors disabled:opacity-50"
            aria-label="Edit copy"
          >
            <Pencil size={9} aria-hidden="true" /> Copy
          </button>

          <button
            type="button"
            disabled={busy || !hasCopy}
            onClick={() => onSendApproval(item)}
            title={!hasCopy ? 'Add draft copy first' : 'Send for client approval'}
            className="inline-flex items-center gap-1 text-[10px] rounded-[5px] border bg-transparent font-semibold text-text-muted px-1.5 py-1 hover:border-teal hover:text-navy transition-colors disabled:opacity-50"
            aria-label="Send for approval"
          >
            <Send size={9} aria-hidden="true" /> Approval
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => onHold(item)}
            className="inline-flex items-center gap-1 text-[10px] rounded-[5px] border bg-transparent font-semibold text-text-muted px-1.5 py-1 hover:border-teal hover:text-navy transition-colors disabled:opacity-50"
            aria-label={item.on_hold ? 'Resume job' : 'Put on hold'}
          >
            {item.on_hold
              ? <Play size={9} aria-hidden="true" />
              : <Pause size={9} aria-hidden="true" />
            }
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => onCancel(item)}
            className="inline-flex items-center justify-center text-[10px] rounded-[5px] border bg-transparent font-semibold text-text-muted px-1.5 py-1 hover:border-red-400 hover:text-red-600 transition-colors disabled:opacity-50"
            aria-label="Cancel job"
          >
            <Ban size={9} aria-hidden="true" />
          </button>

          {canIssueReport && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onIssueReport(item)}
              className="inline-flex items-center gap-1 text-[10px] rounded-[5px] border bg-transparent font-semibold text-text-muted px-1.5 py-1 hover:border-teal hover:text-navy transition-colors disabled:opacity-50"
              aria-label="Issue report"
            >
              <FileText size={9} aria-hidden="true" /> Report
            </button>
          )}

          {item.report_ready && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onDownloadReport(item)}
              className="inline-flex items-center gap-1 text-[10px] rounded-[5px] border bg-transparent font-semibold text-text-muted px-1.5 py-1 hover:border-teal hover:text-navy transition-colors disabled:opacity-50"
              aria-label="Download report"
            >
              <Download size={9} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ManagedPage() {
  const { user, loadMe } = useAuth();
  const [busyId, setBusyId] = useState<string | null>(null);

  // New-brief modal
  const [creating, setCreating] = useState(false);
  const [accounts, setAccounts] = useState<AccountLite[]>([]);
  const [formAccount, setFormAccount] = useState('');
  const [formBrief, setFormBrief] = useState('');
  const [saving, setSaving] = useState(false);

  // Edit-copy modal
  const [editingCopy, setEditingCopy] = useState<Managed | null>(null);
  const [copyForm, setCopyForm] = useState({
    copy_sms: '',
    copy_email_subject: '',
    copy_email_body: '',
  });
  const [savingCopy, setSavingCopy] = useState(false);

  // Stat-card filter: click a KPI to narrow the board to that stage group.
  const [statFilter, setStatFilter] = useState<'all' | 'in_prod' | 'awaiting' | 'complete'>('all');

  // ── mount data load (React Query): pipeline + linkable campaigns + staff ──────
  const { data, isLoading: loading, refetch } = useApiQuery(
    ['admin', 'managed'],
    async () => {
      const [res, camps, users] = await Promise.all([
        api<ManagedResponse>('/admin/managed', { auth: true }),
        api<{ items: CampaignLite[] }>('/admin/campaigns?limit=500', { auth: true }),
        api<StaffUser[]>('/admin/users', { auth: true }),
      ]);
      return { managed: res, campaigns: camps.items, staff: users };
    },
  );

  const managed = data?.managed ?? null;
  const campaigns = data?.campaigns ?? [];
  const staff = data?.staff ?? [];

  // Bootstrap the current user (used by "assign to me"); not part of the data load.
  useEffect(() => {
    if (!user) loadMe();
  }, [user, loadMe]);

  // ── Action handlers ───────────────────────────────────────────────────────

  async function changeStatus(m: Managed, next: Status) {
    setBusyId(m.id);
    try {
      await api(`/admin/managed/${m.id}`, {
        method: 'PATCH', auth: true, body: JSON.stringify({ status: next }),
      });
      toast.success(`${m.account_name ?? 'Job'} → ${STATUS_CFG[next].label}`);
      await refetch();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Status update failed');
    } finally {
      setBusyId(null);
    }
  }

  function openEditCopy(m: Managed) {
    setCopyForm({
      copy_sms: m.copy_sms ?? '',
      copy_email_subject: m.copy_email_subject ?? '',
      copy_email_body: m.copy_email_body ?? '',
    });
    setEditingCopy(m);
  }

  async function saveCopy() {
    if (!editingCopy) return;
    setSavingCopy(true);
    try {
      await api(`/admin/managed/${editingCopy.id}`, {
        method: 'PATCH',
        auth: true,
        body: JSON.stringify({
          copy_sms: copyForm.copy_sms || null,
          copy_email_subject: copyForm.copy_email_subject || null,
          copy_email_body: copyForm.copy_email_body || null,
        }),
      });
      toast.success('Copy saved');
      setEditingCopy(null);
      await refetch();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Save failed');
    } finally {
      setSavingCopy(false);
    }
  }

  async function sendApproval(m: Managed) {
    setBusyId(m.id);
    try {
      await api(`/admin/managed/${m.id}/request-approval`, { method: 'POST', auth: true });
      toast.success('Copy sent to client for approval');
      await refetch();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not send for approval');
    } finally {
      setBusyId(null);
    }
  }

  async function assignManager(m: Managed, userId: string) {
    if (!userId) return;
    setBusyId(m.id);
    try {
      await api(`/admin/managed/${m.id}`, {
        method: 'PATCH', auth: true, body: JSON.stringify({ account_manager_id: userId }),
      });
      toast.success('Manager assigned');
      await refetch();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Assign failed');
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
        method: 'PATCH', auth: true, body: JSON.stringify({ account_manager_id: uid }),
      });
      toast.success('Assigned to you');
      await refetch();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Assign failed');
    } finally {
      setBusyId(null);
    }
  }

  async function linkCampaign(m: Managed, campaignId: string) {
    if (!campaignId) return;
    setBusyId(m.id);
    try {
      await api(`/admin/managed/${m.id}`, {
        method: 'PATCH', auth: true, body: JSON.stringify({ campaign_id: campaignId }),
      });
      toast.success('Campaign linked');
      await refetch();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Link failed');
    } finally {
      setBusyId(null);
    }
  }

  async function toggleHold(m: Managed) {
    setBusyId(m.id);
    const endpoint = m.on_hold
      ? `/admin/managed/${m.id}/unhold`
      : `/admin/managed/${m.id}/hold`;
    try {
      await api(endpoint, { method: 'POST', auth: true });
      toast.success(m.on_hold ? 'Job resumed' : 'Job put on hold');
      await refetch();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Hold action failed');
    } finally {
      setBusyId(null);
    }
  }

  async function cancelJob(m: Managed) {
    if (!window.confirm(`Cancel "${m.account_name ?? 'this job'}"? This cannot be undone.`)) return;
    setBusyId(m.id);
    try {
      await api(`/admin/managed/${m.id}/cancel`, { method: 'POST', auth: true });
      toast.success('Job cancelled');
      await refetch();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Cancel failed');
    } finally {
      setBusyId(null);
    }
  }

  async function issueReport(m: Managed) {
    setBusyId(m.id);
    try {
      await api(`/admin/managed/${m.id}/report`, { method: 'POST', auth: true });
      toast.success(`Report issued — ${m.account_name ?? 'campaign'}`);
      await refetch();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not issue report');
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

  // New-brief modal helpers

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
    if (!formAccount) { toast.error('Select an account'); return; }
    if (!formBrief.trim()) { toast.error('Enter a brief'); return; }
    setSaving(true);
    try {
      await api('/admin/managed', {
        method: 'POST', auth: true,
        body: JSON.stringify({ account_id: formAccount, brief_text: formBrief.trim() }),
      });
      toast.success('Brief created');
      setCreating(false);
      await refetch();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Create failed');
    } finally {
      setSaving(false);
    }
  }

  // ── Derived stats ─────────────────────────────────────────────────────────

  const items = managed?.items ?? [];

  // Single source of truth for each stat-card group, so the count tiles and the
  // board filter can never drift. Cancelled jobs are excluded from every active
  // group (a cancelled job is not "in production", "awaiting", or "complete").
  const GROUP_PREDICATE: Record<Exclude<typeof statFilter, 'all'>, (m: Managed) => boolean> = {
    in_prod: (m) => IN_PROD_STATES.has(m.status) && !m.cancelled,
    awaiting: (m) => m.status === 'awaiting_approval' && !m.cancelled,
    complete: (m) => COMPLETE_STATES.has(m.status) && !m.cancelled,
  };

  const totalCount = items.length;
  const inProdCount = items.filter(GROUP_PREDICATE.in_prod).length;
  const awaitingCount = items.filter(GROUP_PREDICATE.awaiting).length;
  const completeCount = items.filter(GROUP_PREDICATE.complete).length;

  // Board honours the active stat-card filter; 'all' shows everything.
  const visibleItems =
    statFilter === 'all' ? items : items.filter(GROUP_PREDICATE[statFilter]);

  // Clicking an active card clears the filter (toggle); otherwise set it.
  const toggleFilter = (f: typeof statFilter) =>
    setStatFilter((cur) => (cur === f ? 'all' : f));

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <Topbar title="Managed queue" subtitle="Full-service campaign pipeline" showPeriod={false} />

      <div className="p-[18px]">
        {/* New brief button */}
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
        <RevealGroup className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-[18px]">
          <RevealItem lift>
            <StatCard
              label="TOTAL"
              value={totalCount}
              icon={Layers}
              change="All managed jobs"
              changeType="up"
              onClick={() => setStatFilter('all')}
              active={statFilter === 'all'}
            />
          </RevealItem>
          <RevealItem lift>
            <StatCard
              label="IN PRODUCTION"
              value={inProdCount}
              icon={Zap}
              change="Pre-approval stages"
              changeType="up"
              onClick={() => toggleFilter('in_prod')}
              active={statFilter === 'in_prod'}
            />
          </RevealItem>
          <RevealItem lift>
            <StatCard
              label="AWAITING APPROVAL"
              value={awaitingCount}
              icon={FileText}
              change="Client sign-off needed"
              changeType={awaitingCount > 0 ? 'warn' : 'up'}
              warn={awaitingCount > 0}
              onClick={() => toggleFilter('awaiting')}
              active={statFilter === 'awaiting'}
            />
          </RevealItem>
          <RevealItem lift>
            <StatCard
              label="COMPLETE"
              value={completeCount}
              icon={CheckCircle2}
              change="Sent / reported / closed"
              changeType="up"
              onClick={() => toggleFilter('complete')}
              active={statFilter === 'complete'}
            />
          </RevealItem>
        </RevealGroup>

        {/* Pipeline header */}
        <Reveal delay={0.15} className={`${cardBase} mb-3`}>
          <div className="font-display text-[14px] font-bold text-navy mb-0.5">
            Campaign pipeline
          </div>
          <div className="text-[11px] text-text-muted flex items-center gap-2 flex-wrap">
            <span>
              {visibleItems.length} campaign{visibleItems.length !== 1 ? 's' : ''}
              {statFilter !== 'all' && ` of ${items.length}`} &middot; 15-state kanban &middot; 5 lanes
            </span>
            {statFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setStatFilter('all')}
                className="font-semibold text-teal hover:underline"
              >
                Clear filter ×
              </button>
            )}
          </div>
        </Reveal>

        {/* Kanban board */}
        {loading ? (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="w-[520px] flex-shrink-0 h-48 animate-pulse rounded-[12px] border bg-[#FAFBFE]"
              />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div
            className="text-center py-10 text-[13px] text-text-muted border rounded-[10px]"
            style={{ background: '#FAFBFE' }}
          >
            No managed campaigns yet. Create a brief to start the pipeline.
          </div>
        ) : visibleItems.length === 0 ? (
          <div
            className="text-center py-10 text-[13px] text-text-muted border rounded-[10px]"
            style={{ background: '#FAFBFE' }}
          >
            No campaigns match this filter.{' '}
            <button
              type="button"
              onClick={() => setStatFilter('all')}
              className="font-semibold text-teal hover:underline"
            >
              Show all
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto pb-4">
            <div className="flex gap-3 min-w-fit items-start">
              {LANES.map((lane) => {
                const laneCount = visibleItems.filter((m) => lane.states.includes(m.status)).length;
                return (
                  <div
                    key={lane.key}
                    className="flex-shrink-0 rounded-[12px]"
                    style={{
                      background: lane.bg,
                      border: `1px solid ${lane.headerColor}28`,
                    }}
                  >
                    {/* Lane header */}
                    <div
                      className="px-3 pt-2.5 pb-2 flex items-center gap-2"
                      style={{ borderBottom: `1px solid ${lane.headerColor}20` }}
                    >
                      <span
                        className="font-display font-bold text-[11px] uppercase tracking-[0.06em]"
                        style={{ color: lane.headerColor }}
                      >
                        {lane.label}
                      </span>
                      <span className="ml-auto text-[10px] text-text-muted font-medium tabular-nums">
                        {laneCount}
                      </span>
                    </div>

                    {/* State columns */}
                    <div className="flex gap-2 p-2">
                      {lane.states.map((state) => {
                        const stateItems = visibleItems.filter((m) => m.status === state);
                        const sCfg = STATUS_CFG[state];
                        return (
                          <div key={state} className="w-[190px] flex-shrink-0">
                            <div className="flex items-center gap-1.5 mb-2 px-0.5">
                              <StatusPill
                                label={sCfg.label}
                                color={sCfg.color}
                                pulse={sCfg.pulse}
                              />
                              <span className="text-[10px] text-text-muted font-medium tabular-nums">
                                {stateItems.length}
                              </span>
                            </div>
                            <div className="flex flex-col gap-2">
                              {stateItems.map((item) => (
                                <ManagedCard
                                  key={item.id}
                                  item={item}
                                  busy={busyId === item.id}
                                  staff={staff}
                                  campaigns={campaigns}
                                  onStatusChange={changeStatus}
                                  onEditCopy={openEditCopy}
                                  onSendApproval={sendApproval}
                                  onAssignManager={assignManager}
                                  onAssignToMe={assignToMe}
                                  onLinkCampaign={linkCampaign}
                                  onHold={toggleHold}
                                  onCancel={cancelJob}
                                  onIssueReport={issueReport}
                                  onDownloadReport={downloadReport}
                                />
                              ))}
                              {stateItems.length === 0 && (
                                <div
                                  className="border border-dashed rounded-[8px] h-12 flex items-center justify-center"
                                  style={{ borderColor: `${sCfg.color}40` }}
                                >
                                  <span className="text-[10px] text-text-muted">Empty</span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
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
                <h2 className="font-display font-bold text-[16px] text-navy">
                  New managed brief
                </h2>
                <button
                  type="button"
                  onClick={() => !saving && setCreating(false)}
                  aria-label="Close"
                  className="rounded-md p-1 text-text-muted transition hover:bg-black/[0.05] hover:text-navy"
                >
                  <X size={18} />
                </button>
              </div>

              <label
                htmlFor="mb-account"
                className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted mb-1.5"
              >
                Client account
              </label>
              <select
                id="mb-account"
                className="input mb-4"
                value={formAccount}
                onChange={(e) => setFormAccount(e.target.value)}
              >
                <option value="">— select account —</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>

              <label
                htmlFor="mb-brief"
                className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted mb-1.5"
              >
                Brief
              </label>
              <textarea
                id="mb-brief"
                className="input"
                rows={4}
                style={{ resize: 'vertical' }}
                placeholder="e.g. Send 5,000 SMS payment reminders to overdue borrowers by Friday."
                value={formBrief}
                onChange={(e) => setFormBrief(e.target.value)}
              />

              <div className="flex gap-2 justify-end mt-4">
                <button
                  type="button"
                  className="btn-outline"
                  disabled={saving}
                  onClick={() => setCreating(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={createBrief}
                  className="rounded-full font-display font-bold text-[13px] px-4 py-2 transition hover:opacity-90 disabled:opacity-60"
                  style={{ background: '#00D4AA', color: '#0D0F2E' }}
                >
                  {saving ? 'Creating…' : 'Create brief'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit-copy modal */}
      {editingCopy && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8"
          style={{ background: 'rgba(13,15,46,0.45)' }}
          role="dialog"
          aria-modal="true"
          aria-label="Edit campaign copy"
          onClick={() => !savingCopy && setEditingCopy(null)}
        >
          <div className="w-full max-w-lg animate-fade-up" onClick={(e) => e.stopPropagation()}>
            <div className="bg-white border rounded-[11px] p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="font-display font-bold text-[16px] text-navy">
                    Edit campaign copy
                  </h2>
                  <div className="text-[11px] text-text-muted mt-0.5">
                    {editingCopy.account_name ?? '—'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => !savingCopy && setEditingCopy(null)}
                  aria-label="Close"
                  className="rounded-md p-1 text-text-muted transition hover:bg-black/[0.05] hover:text-navy"
                >
                  <X size={18} />
                </button>
              </div>

              <label
                htmlFor="copy-sms"
                className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted mb-1.5"
              >
                SMS copy
              </label>
              <textarea
                id="copy-sms"
                className="input mb-4"
                rows={3}
                style={{ resize: 'vertical' }}
                placeholder="SMS message text…"
                value={copyForm.copy_sms}
                onChange={(e) => setCopyForm((f) => ({ ...f, copy_sms: e.target.value }))}
              />

              <label
                htmlFor="copy-email-subject"
                className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted mb-1.5"
              >
                Email subject
              </label>
              <input
                id="copy-email-subject"
                type="text"
                className="input mb-4"
                placeholder="Email subject line…"
                value={copyForm.copy_email_subject}
                onChange={(e) =>
                  setCopyForm((f) => ({ ...f, copy_email_subject: e.target.value }))
                }
              />

              <label
                htmlFor="copy-email-body"
                className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted mb-1.5"
              >
                Email body
              </label>
              <textarea
                id="copy-email-body"
                className="input mb-4"
                rows={5}
                style={{ resize: 'vertical' }}
                placeholder="Email body content…"
                value={copyForm.copy_email_body}
                onChange={(e) =>
                  setCopyForm((f) => ({ ...f, copy_email_body: e.target.value }))
                }
              />

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  className="btn-outline"
                  disabled={savingCopy}
                  onClick={() => setEditingCopy(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={savingCopy}
                  onClick={saveCopy}
                  className="rounded-full font-display font-bold text-[13px] px-4 py-2 transition hover:opacity-90 disabled:opacity-60"
                  style={{ background: '#00D4AA', color: '#0D0F2E' }}
                >
                  {savingCopy ? 'Saving…' : 'Save copy'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
