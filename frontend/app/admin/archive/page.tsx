/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
'use client';

import { useCallback, useMemo, useState, FormEvent } from 'react';
import {
  Archive,
  Database,
  Eye,
  FileText,
  Lock,
  Search,
  Shield,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { storageTierLabel } from '@/lib/labels';
import { useApiQuery } from '@/lib/hooks';
import Topbar from '@/components/admin/Topbar';
import { RevealGroup, RevealItem, Reveal } from '@/components/admin/Reveal';
import StatCard from '@/components/admin/StatCard';
import DataTable, { Column } from '@/components/admin/DataTable';
import { StatusPill } from '@/components/admin/StatusPill';

const cardBase = 'bg-surface border rounded-[11px] p-4';

// ── types ─────────────────────────────────────────────────────────────────────

interface Overview {
  archived_campaigns: number;
  master_contacts: number;
  anonymised_contacts: number;
  archived_payments: number;
  archived_reports: number;
  active_legal_holds: number;
  pending_erasures: number;
  oldest_archived_at: string | null;
  storage_estimate_bytes: number;
  live_retention_months: number;
}

interface RetentionPeriod {
  period: string;
  campaigns: number;
  state: 'hot' | 'warm' | 'glacier';
}

interface RetentionRule {
  id: string;
  domain: string;
  account_id: string | null;
  retention_months: number | null;
  never_delete: boolean;
  updated_at: string;
}

interface MasterContact {
  id: string;
  phone: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  account_name: string | null;
  campaign_count: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
  anonymised_at: string | null;
  legal_hold: boolean;
}

interface LegalHold {
  id: string;
  resource_type: string;
  resource_id: string;
  reason: string;
  placed_by_email: string;
  placed_at: string;
  lifted_at: string | null;
  is_active: boolean;
}

interface ErasureRequest {
  id: string;
  contact_phone: string | null;
  contact_email: string | null;
  master_contact_id: string | null;
  requested_by: string | null;
  status: 'pending' | 'completed';
  executed_at: string | null;
  created_at: string;
}

interface ArchiveExport {
  id: string;
  filename: string;
  format: string;
  size_bytes: number;
  storage_class: string;
  s3_key: string | null;
  archived_at: string | null;
}

interface AccessLogEntry {
  id: string;
  actor_email: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  ip_address: string | null;
  created_at: string;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

const fmtDate = (iso: string | null): string => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch {
    return '—';
  }
};

const fmtDateTime = (iso: string | null): string => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '—';
  }
};

// ── color constants ────────────────────────────────────────────────────────────

const TEAL  = '#00D4AA';
const NAVY  = '#1B1F4A';
const AMBER = '#F59E0B';
const RED   = '#EF4444';
const GREEN = '#10B981';

const STATE_COLOR: Record<RetentionPeriod['state'], string> = {
  hot:     GREEN,
  warm:    AMBER,
  glacier: NAVY,
};

// ── page ──────────────────────────────────────────────────────────────────────

export default function ArchivePage() {
  // ── data is loaded via React Query further down (the query key depends on
  //    contactQuery, which is declared in the form-state block below). ──────────

  // ── action busy flags ───────────────────────────────────────────────────────
  const [ingestBusy,        setIngestBusy]        = useState(false);
  const [dryRunBusy,        setDryRunBusy]        = useState(false);
  const [anonymising,       setAnonymising]        = useState<string | null>(null);
  const [liftingHold,       setLiftingHold]        = useState<string | null>(null);
  const [executingErasure,  setExecutingErasure]   = useState<string | null>(null);
  const [holdBusy,          setHoldBusy]           = useState(false);
  const [erasureBusy,       setErasureBusy]        = useState(false);
  const [exportBusy,        setExportBusy]         = useState(false);
  const [ruleBusy,          setRuleBusy]           = useState(false);

  // ── form state ───────────────────────────────────────────────────────────────
  const [contactSearchInput, setContactSearchInput] = useState('');
  const [contactQuery,       setContactQuery]       = useState('');

  const [holdResourceType, setHoldResourceType] = useState<'campaign' | 'master_contact'>('campaign');
  const [holdResourceId,   setHoldResourceId]   = useState('');
  const [holdReason,       setHoldReason]        = useState('');

  const [erasurePhone,       setErasurePhone]       = useState('');
  const [erasureEmail,       setErasureEmail]       = useState('');
  const [erasureRequestedBy, setErasureRequestedBy] = useState('');

  const [exportDomain,  setExportDomain]  = useState<'campaigns' | 'payments' | 'contacts'>('campaigns');
  const [ruleDomain,    setRuleDomain]    = useState('');
  const [ruleMonths,    setRuleMonths]    = useState('');
  const [ruleNeverDelete, setRuleNeverDelete] = useState(false);

  // ── mount data load (React Query) ────────────────────────────────────────────
  // Single query combining all sections. `contactQuery` is part of the key, so a
  // contact search re-runs the load; action handlers call refetch() on success.

  const { data, isLoading: loading, refetch } = useApiQuery(
    ['admin', 'archive', contactQuery],
    async () => {
      const [ov, ret, rul, con, holds, ers, log, exps] = await Promise.all([
        api<Overview>('/admin/archive/overview', { auth: true }),
        api<RetentionPeriod[]>('/admin/archive/retention', { auth: true }),
        api<RetentionRule[]>('/admin/archive/retention/rules', { auth: true }),
        api<MasterContact[]>(
          `/admin/archive/contacts?q=${encodeURIComponent(contactQuery)}&limit=100`,
          { auth: true },
        ),
        api<LegalHold[]>('/admin/archive/legal-holds', { auth: true }),
        api<ErasureRequest[]>('/admin/archive/erasures', { auth: true }),
        api<AccessLogEntry[]>('/admin/archive/access-log?limit=100', { auth: true }),
        api<ArchiveExport[]>('/admin/archive/exports', { auth: true }),
      ]);
      return {
        overview: ov, retention: ret, rules: rul, contacts: con,
        legalHolds: holds, erasures: ers, accessLog: log, exports: exps,
      };
    },
  );

  const overview   = data?.overview   ?? null;
  const retention  = useMemo(() => data?.retention ?? [], [data]);
  const rules      = data?.rules      ?? [];
  const contacts   = data?.contacts   ?? [];
  const legalHolds = data?.legalHolds ?? [];
  const erasures   = data?.erasures   ?? [];
  const exports    = data?.exports    ?? [];
  const accessLog  = data?.accessLog  ?? [];

  // ── action handlers ─────────────────────────────────────────────────────────

  const handleIngest = useCallback(async () => {
    setIngestBusy(true);
    try {
      const res = await api<{
        campaigns_ingested: number;
        reports_ingested: number;
        payments_ingested: number;
        contacts_upserted: number;
      }>('/admin/archive/ingest', { method: 'POST', auth: true });
      toast.success(
        `Ingested: ${res.campaigns_ingested} campaigns · ${res.payments_ingested} payments · ${res.contacts_upserted} contacts`,
      );
      await refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Ingest failed');
    } finally {
      setIngestBusy(false);
    }
  }, [refetch]);

  const handleDryRun = useCallback(async () => {
    setDryRunBusy(true);
    try {
      const res = await api<{
        dry_run: boolean;
        campaigns_purgeable: number;
        contacts_anonymisable: number;
        campaigns_purged: number;
        contacts_anonymised: number;
      }>('/admin/archive/retention/run?dry_run=true', { method: 'POST', auth: true });
      toast.info(
        `Dry-run: ${res.campaigns_purgeable} campaigns purgeable · ${res.contacts_anonymisable} contacts anonymisable`,
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Dry-run failed');
    } finally {
      setDryRunBusy(false);
    }
  }, []);

  const handleAnonymise = useCallback(async (contact: MasterContact) => {
    const label = contact.phone ?? contact.email ?? contact.id;
    if (!window.confirm(`Anonymise contact ${label}? This cannot be undone.`)) return;
    setAnonymising(contact.id);
    try {
      await api<MasterContact>(
        `/admin/archive/contacts/${contact.id}/anonymise`,
        { method: 'POST', auth: true },
      );
      await refetch();
      toast.success('Contact anonymised');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Anonymise failed');
    } finally {
      setAnonymising(null);
    }
  }, [refetch]);

  const handleSearchContacts = useCallback(() => {
    // Updating the search term re-runs the mount query (contactQuery is in the key).
    setContactQuery(contactSearchInput);
  }, [contactSearchInput]);

  const handlePlaceHold = useCallback(async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!holdResourceId.trim() || !holdReason.trim()) {
      toast.error('Resource ID and reason are required');
      return;
    }
    setHoldBusy(true);
    try {
      await api<LegalHold>('/admin/archive/legal-holds', {
        method: 'POST',
        auth: true,
        body: JSON.stringify({
          resource_type: holdResourceType,
          resource_id: holdResourceId.trim(),
          reason: holdReason.trim(),
        }),
      });
      toast.success('Legal hold placed');
      setHoldResourceId('');
      setHoldReason('');
      await refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to place hold');
    } finally {
      setHoldBusy(false);
    }
  }, [holdResourceType, holdResourceId, holdReason, refetch]);

  const handleLiftHold = useCallback(async (hold: LegalHold) => {
    const reason = window.prompt('Reason for lifting this hold:');
    if (reason === null) return;
    if (!reason.trim()) { toast.error('Lift reason is required'); return; }
    if (!window.confirm(`Lift hold on ${hold.resource_type} ${hold.resource_id}?`)) return;
    setLiftingHold(hold.id);
    try {
      await api<LegalHold>(
        `/admin/archive/legal-holds/${hold.id}/lift`,
        { method: 'POST', auth: true, body: JSON.stringify({ reason: reason.trim() }) },
      );
      await refetch();
      toast.success('Legal hold lifted');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to lift hold');
    } finally {
      setLiftingHold(null);
    }
  }, [refetch]);

  const handleNewErasure = useCallback(async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!erasurePhone.trim() && !erasureEmail.trim()) {
      toast.error('Phone or email is required');
      return;
    }
    setErasureBusy(true);
    try {
      await api<ErasureRequest>('/admin/archive/erasures', {
        method: 'POST',
        auth: true,
        body: JSON.stringify({
          ...(erasurePhone.trim()       && { contact_phone: erasurePhone.trim() }),
          ...(erasureEmail.trim()       && { contact_email: erasureEmail.trim() }),
          ...(erasureRequestedBy.trim() && { requested_by:  erasureRequestedBy.trim() }),
        }),
      });
      toast.success('Erasure request created');
      setErasurePhone('');
      setErasureEmail('');
      setErasureRequestedBy('');
      await refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to create erasure request');
    } finally {
      setErasureBusy(false);
    }
  }, [erasurePhone, erasureEmail, erasureRequestedBy, refetch]);

  const handleExecuteErasure = useCallback(async (req: ErasureRequest) => {
    const label = req.contact_phone ?? req.contact_email ?? req.id;
    if (!window.confirm(`Execute erasure for ${label}? This is irreversible.`)) return;
    setExecutingErasure(req.id);
    try {
      await api<ErasureRequest>(
        `/admin/archive/erasures/${req.id}/execute`,
        { method: 'POST', auth: true },
      );
      await refetch();
      toast.success('Erasure executed');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Erasure failed');
    } finally {
      setExecutingErasure(null);
    }
  }, [refetch]);

  const handleNewExport = useCallback(async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setExportBusy(true);
    try {
      await api<ArchiveExport>('/admin/archive/exports', {
        method: 'POST',
        auth: true,
        body: JSON.stringify({ domain: exportDomain }),
      });
      toast.success(`Export job created for ${exportDomain}`);
      await refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to create export');
    } finally {
      setExportBusy(false);
    }
  }, [exportDomain, refetch]);

  const handleSaveRule = useCallback(async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!ruleDomain.trim()) { toast.error('Domain is required'); return; }
    setRuleBusy(true);
    try {
      const months = ruleMonths.trim() ? parseInt(ruleMonths, 10) : null;
      await api<RetentionRule>('/admin/archive/retention/rules', {
        method: 'PUT',
        auth: true,
        body: JSON.stringify({
          domain: ruleDomain.trim(),
          retention_months: months,
          never_delete: ruleNeverDelete,
        }),
      });
      toast.success(`Retention rule saved for ${ruleDomain}`);
      setRuleDomain('');
      setRuleMonths('');
      setRuleNeverDelete(false);
      await refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to save rule');
    } finally {
      setRuleBusy(false);
    }
  }, [ruleDomain, ruleMonths, ruleNeverDelete, refetch]);

  // ── column definitions ────────────────────────────────────────────────────────

  const maxCampaigns = useMemo(
    () => Math.max(1, ...retention.map((r) => r.campaigns)),
    [retention],
  );

  const retentionColumns = useMemo((): Column<RetentionPeriod>[] => [
    {
      key: 'period',
      label: 'Period',
      render: (row) => (
        <span className="text-[12px] font-semibold" style={{ color: NAVY }}>{row.period}</span>
      ),
    },
    {
      key: 'campaigns',
      label: 'Campaigns',
      align: 'right',
      render: (row) => (
        <span className="font-mono text-[11px] text-fg">
          {row.campaigns === 0 ? '—' : row.campaigns.toLocaleString()}
        </span>
      ),
    },
    {
      key: 'bar',
      label: 'Volume',
      render: (row) => (
        <div
          className="w-32 h-1.5 rounded-full overflow-hidden"
          style={{ background: 'rgba(0,0,0,0.06)' }}
          role="presentation"
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${(row.campaigns / maxCampaigns) * 100}%`,
              background: STATE_COLOR[row.state],
              minWidth: row.campaigns > 0 ? '4px' : '0',
            }}
          />
        </div>
      ),
    },
    {
      key: 'state',
      label: 'State',
      render: (row) => (
        <StatusPill label={storageTierLabel(row.state)} color={STATE_COLOR[row.state]} pulse={row.state === 'hot'} />
      ),
    },
  ], [maxCampaigns]);

  const rulesColumns = useMemo((): Column<RetentionRule>[] => [
    {
      key: 'domain',
      label: 'Domain',
      render: (row) => (
        <span className="font-mono text-[11px] font-semibold" style={{ color: NAVY }}>{row.domain}</span>
      ),
    },
    {
      key: 'account_id',
      label: 'Scope',
      render: (row) => (
        <span className="text-[11px] text-fg-muted">{row.account_id ?? 'Global'}</span>
      ),
    },
    {
      key: 'retention',
      label: 'Retention',
      render: (row) => (
        <span className="font-mono text-[11px] text-fg">
          {row.never_delete
            ? 'Never delete'
            : row.retention_months != null
              ? `${row.retention_months} mo`
              : '—'}
        </span>
      ),
    },
    {
      key: 'updated_at',
      label: 'Updated',
      render: (row) => (
        <span className="text-[11px] text-fg-muted whitespace-nowrap">{fmtDate(row.updated_at)}</span>
      ),
    },
  ], []);

  const contactColumns = useMemo((): Column<MasterContact>[] => [
    {
      key: 'contact',
      label: 'Contact',
      render: (row) => {
        const name = [row.first_name, row.last_name].filter(Boolean).join(' ');
        return (
          <div>
            <div className="font-semibold text-[12px]" style={{ color: NAVY }}>
              {name || '—'}
            </div>
            <div className="font-mono text-[10px] text-fg-muted">
              {row.phone ?? row.email ?? row.id}
            </div>
          </div>
        );
      },
    },
    {
      key: 'account_name',
      label: 'Account',
      render: (row) => (
        <span className="text-[11px] text-fg-muted">{row.account_name ?? '—'}</span>
      ),
    },
    {
      key: 'campaign_count',
      label: 'Campaigns',
      align: 'right',
      render: (row) => (
        <span className="font-mono text-[12px]">{row.campaign_count}</span>
      ),
    },
    {
      key: 'last_seen_at',
      label: 'Last seen',
      render: (row) => (
        <span className="text-[11px] text-fg-muted whitespace-nowrap">{fmtDate(row.last_seen_at)}</span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.anonymised_at
            ? <StatusPill label="Anonymised" color="#9CA3AF" />
            : <StatusPill label="Active" color={GREEN} pulse />}
          {row.legal_hold && <StatusPill label="Hold" color={AMBER} />}
        </div>
      ),
    },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (row) => {
        const busy     = anonymising === row.id;
        const disabled = !!(row.anonymised_at || row.legal_hold);
        return (
          <button
            type="button"
            disabled={busy || disabled}
            onClick={() => handleAnonymise(row)}
            title={
              row.legal_hold
                ? 'Cannot anonymise: legal hold active'
                : row.anonymised_at
                  ? 'Already anonymised'
                  : 'Anonymise contact'
            }
            className="text-[11px] rounded-[5px] border font-semibold px-2 py-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              color: disabled ? '#9CA3AF' : RED,
              borderColor: disabled ? '#E5E7EB' : RED,
              background: 'transparent',
            }}
            aria-label={`Anonymise ${row.phone ?? row.email ?? row.id}`}
          >
            {busy ? '…' : 'Anonymise'}
          </button>
        );
      },
    },
  ], [anonymising, handleAnonymise]);

  const holdsColumns = useMemo((): Column<LegalHold>[] => [
    {
      key: 'resource',
      label: 'Resource',
      render: (row) => (
        <div>
          <div className="text-[11px] font-semibold capitalize" style={{ color: NAVY }}>
            {row.resource_type.replace('_', ' ')}
          </div>
          <div className="font-mono text-[10px] text-fg-muted break-all">{row.resource_id}</div>
        </div>
      ),
    },
    {
      key: 'reason',
      label: 'Reason',
      render: (row) => (
        <span className="text-[11px] text-fg line-clamp-2 max-w-[200px] block">{row.reason}</span>
      ),
    },
    {
      key: 'placed_by_email',
      label: 'Placed by',
      render: (row) => (
        <span className="text-[11px] text-fg-muted">{row.placed_by_email}</span>
      ),
    },
    {
      key: 'placed_at',
      label: 'Placed',
      render: (row) => (
        <span className="text-[11px] text-fg-muted whitespace-nowrap">{fmtDate(row.placed_at)}</span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        <StatusPill
          label={row.is_active ? 'Active' : 'Lifted'}
          color={row.is_active ? AMBER : '#9CA3AF'}
          pulse={row.is_active}
        />
      ),
    },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (row) => {
        if (!row.is_active) return null;
        const busy = liftingHold === row.id;
        return (
          <button
            type="button"
            disabled={busy}
            onClick={() => handleLiftHold(row)}
            className="text-[11px] rounded-[5px] border font-semibold px-2 py-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ color: NAVY, borderColor: NAVY, background: 'transparent' }}
            aria-label={`Lift hold on ${row.resource_type} ${row.resource_id}`}
          >
            {busy ? '…' : 'Lift'}
          </button>
        );
      },
    },
  ], [liftingHold, handleLiftHold]);

  const erasureColumns = useMemo((): Column<ErasureRequest>[] => [
    {
      key: 'contact',
      label: 'Contact',
      render: (row) => (
        <span className="font-mono text-[11px]" style={{ color: NAVY }}>
          {row.contact_phone ?? row.contact_email ?? '—'}
        </span>
      ),
    },
    {
      key: 'requested_by',
      label: 'Requested by',
      render: (row) => (
        <span className="text-[11px] text-fg-muted">{row.requested_by ?? '—'}</span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        <StatusPill
          label={row.status}
          color={row.status === 'pending' ? AMBER : GREEN}
          pulse={row.status === 'pending'}
        />
      ),
    },
    {
      key: 'created_at',
      label: 'Created',
      render: (row) => (
        <span className="text-[11px] text-fg-muted whitespace-nowrap">{fmtDate(row.created_at)}</span>
      ),
    },
    {
      key: 'executed_at',
      label: 'Executed',
      render: (row) => (
        <span className="text-[11px] text-fg-muted whitespace-nowrap">{fmtDate(row.executed_at)}</span>
      ),
    },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (row) => {
        if (row.status !== 'pending') return null;
        const busy = executingErasure === row.id;
        return (
          <button
            type="button"
            disabled={busy}
            onClick={() => handleExecuteErasure(row)}
            className="text-[11px] rounded-[5px] border font-semibold px-2 py-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ color: RED, borderColor: RED, background: 'transparent' }}
            aria-label={`Execute erasure for ${row.contact_phone ?? row.contact_email ?? row.id}`}
          >
            {busy ? '…' : 'Execute'}
          </button>
        );
      },
    },
  ], [executingErasure, handleExecuteErasure]);

  const exportColumns = useMemo((): Column<ArchiveExport>[] => [
    {
      key: 'filename',
      label: 'File',
      render: (row) => (
        <span className="font-mono text-[11px] font-semibold" style={{ color: NAVY }}>{row.filename}</span>
      ),
    },
    {
      key: 'format',
      label: 'Format',
      render: (row) => (
        <span
          className="inline-flex items-center rounded-[4px] px-2 py-0.5 font-mono text-[10px] font-bold"
          style={{
            background: row.format === 'parquet' ? 'rgba(99,102,241,0.1)' : `${TEAL}1a`,
            color:      row.format === 'parquet' ? '#6366F1' : TEAL,
          }}
        >
          {row.format.toUpperCase()}
        </span>
      ),
    },
    {
      key: 'size_bytes',
      label: 'Size',
      align: 'right',
      render: (row) => (
        <span className="font-mono text-[11px] text-fg">{formatBytes(row.size_bytes)}</span>
      ),
    },
    {
      key: 'storage_class',
      label: 'Storage',
      render: (row) => (
        <span className="text-[11px] text-fg-muted capitalize">{row.storage_class}</span>
      ),
    },
    {
      key: 'archived_at',
      label: 'Archived',
      render: (row) => (
        <span className="text-[11px] text-fg-muted whitespace-nowrap">{fmtDate(row.archived_at)}</span>
      ),
    },
  ], []);

  const accessLogColumns = useMemo((): Column<AccessLogEntry>[] => [
    {
      key: 'action',
      label: 'Action',
      render: (row) => (
        <span className="font-mono text-[11px] font-semibold" style={{ color: NAVY }}>{row.action}</span>
      ),
    },
    {
      key: 'resource',
      label: 'Resource',
      render: (row) => (
        <span className="text-[11px] text-fg-muted">
          {row.resource_type}
          {row.resource_id ? ` · ${row.resource_id}` : ''}
        </span>
      ),
    },
    {
      key: 'actor_email',
      label: 'Actor',
      render: (row) => (
        <span className="text-[11px] text-fg-muted">{row.actor_email}</span>
      ),
    },
    {
      key: 'ip_address',
      label: 'IP',
      render: (row) => (
        <span className="font-mono text-[11px] text-fg-muted">{row.ip_address ?? '—'}</span>
      ),
    },
    {
      key: 'created_at',
      label: 'When',
      render: (row) => (
        <span className="text-[11px] text-fg-muted whitespace-nowrap">{fmtDateTime(row.created_at)}</span>
      ),
    },
  ], []);

  // ── render ────────────────────────────────────────────────────────────────────

  return (
    <>
      <Topbar
        title="Data archive"
        subtitle={
          overview
            ? `Retention · compliance · governance · ${overview.live_retention_months}-month policy`
            : 'Retention · compliance · governance'
        }
        showPeriod={false}
      />

      <div className="p-[18px]">
        {/* ── header actions ─────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
          <p className="text-[11px] text-fg-muted max-w-[480px]">
            ClickHouse 7-yr analytics TTL and AWS Glacier transitions are infra-gated in this environment.
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={dryRunBusy}
              onClick={handleDryRun}
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold rounded-[7px] border px-3 py-[7px] transition-colors hover:bg-surface-2 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ borderColor: AMBER, color: AMBER }}
              aria-label="Run retention dry-run"
            >
              <Eye size={13} aria-hidden="true" />
              {dryRunBusy ? 'Running…' : 'Dry-run retention'}
            </button>
            <button
              type="button"
              disabled={ingestBusy}
              onClick={handleIngest}
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold rounded-[7px] px-3 py-[7px] transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: TEAL, color: '#fff' }}
              aria-label="Run ingest now"
            >
              <Upload size={13} aria-hidden="true" />
              {ingestBusy ? 'Ingesting…' : 'Ingest now'}
            </button>
          </div>
        </div>

        {/* ── loading ────────────────────────────────────────────────────── */}
        {loading && (
          <div className="flex items-center justify-center py-16 text-[12px] text-fg-muted">
            Loading archive data…
          </div>
        )}

        {!loading && (
          <>
            {/* ── stats row 1 ──────────────────────────────────────────── */}
            <RevealGroup className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3" stagger={0.06}>
              <RevealItem lift>
                <StatCard
                  label="Archived campaigns"
                  value={overview?.archived_campaigns ?? 0}
                  icon={Archive}
                  change={
                    overview?.oldest_archived_at
                      ? `Oldest: ${fmtDate(overview.oldest_archived_at)}`
                      : 'No archived campaigns'
                  }
                  changeType="up"
                />
              </RevealItem>
              <RevealItem lift>
                <StatCard
                  label="Master contacts"
                  value={overview?.master_contacts ?? 0}
                  icon={Users}
                  change={`${overview?.anonymised_contacts ?? 0} anonymised`}
                  changeType="up"
                />
              </RevealItem>
              <RevealItem lift>
                <StatCard
                  label="Anonymised contacts"
                  value={overview?.anonymised_contacts ?? 0}
                  icon={Shield}
                  change="Hashed for compliance"
                  changeType="up"
                />
              </RevealItem>
            </RevealGroup>

            {/* ── stats row 2 ──────────────────────────────────────────── */}
            <RevealGroup className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3" stagger={0.06}>
              <RevealItem lift>
                <StatCard
                  label="Archived payments"
                  value={overview?.archived_payments ?? 0}
                  icon={FileText}
                  change="Payment records"
                  changeType="up"
                />
              </RevealItem>
              <RevealItem lift>
                <StatCard
                  label="Active legal holds"
                  value={overview?.active_legal_holds ?? 0}
                  icon={Lock}
                  warn={(overview?.active_legal_holds ?? 0) > 0}
                  changeType={(overview?.active_legal_holds ?? 0) > 0 ? 'warn' : 'up'}
                  change="Blocks deletion"
                />
              </RevealItem>
              <RevealItem lift>
                <StatCard
                  label="Pending erasures"
                  value={overview?.pending_erasures ?? 0}
                  icon={Trash2}
                  warn={(overview?.pending_erasures ?? 0) > 0}
                  changeType={(overview?.pending_erasures ?? 0) > 0 ? 'warn' : 'up'}
                  change="GDPR / PDPA requests"
                />
              </RevealItem>
            </RevealGroup>

            {/* ── storage / policy info bar ─────────────────────────────── */}
            {overview && (
              <div
                className="flex items-center gap-5 mb-[18px] px-4 py-2.5 rounded-[9px] border flex-wrap"
                style={{ background: `${TEAL}08`, borderColor: `${TEAL}30` }}
              >
                <span className="text-[11px] text-fg-muted">
                  Storage estimate:{' '}
                  <strong className="text-fg font-semibold">
                    {formatBytes(overview.storage_estimate_bytes)}
                  </strong>
                </span>
                <span className="text-[11px] text-fg-muted">
                  Oldest record:{' '}
                  <strong className="text-fg font-semibold">
                    {fmtDate(overview.oldest_archived_at)}
                  </strong>
                </span>
                <span className="text-[11px] text-fg-muted">
                  Retention policy:{' '}
                  <strong className="text-fg font-semibold">
                    {overview.live_retention_months} months
                  </strong>
                </span>
              </div>
            )}

            {/* ── retention breakdown ───────────────────────────────────── */}
            <Reveal delay={0.15} lift className={`${cardBase} mb-[18px]`}>
              <div className="font-display text-[14px] font-bold text-fg mb-0.5">
                Retention lifecycle
              </div>
              <div className="text-[11px] text-fg-muted mb-4">
                Archive periods — Hot → Warm → Glacier per policy
              </div>
              <div className="flex items-center gap-4 mb-4 flex-wrap" aria-label="Retention state legend">
                {(['hot', 'warm', 'glacier'] as RetentionPeriod['state'][]).map((s) => (
                  <div key={s} className="flex items-center gap-1.5">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full"
                      style={{ background: STATE_COLOR[s] }}
                      aria-hidden="true"
                    />
                    <span className="text-[10.5px] font-semibold text-fg-muted capitalize">{s}</span>
                  </div>
                ))}
              </div>
              <DataTable
                columns={retentionColumns}
                rows={retention}
                rowKey={(row) => row.period}
                empty={<span className="text-fg-muted">No retention data yet.</span>}
              />
            </Reveal>

            {/* ── retention rules ────────────────────────────────────────── */}
            <Reveal delay={0.2} lift className={`${cardBase} mb-[18px]`}>
              <div className="font-display text-[14px] font-bold text-fg mb-0.5">
                Retention rules
              </div>
              <div className="text-[11px] text-fg-muted mb-4">
                Per-domain overrides — blank rule uses the global policy
              </div>
              <DataTable
                columns={rulesColumns}
                rows={rules}
                rowKey={(row) => row.id}
                empty={<span className="text-fg-muted">No custom rules. Global policy applies.</span>}
              />
              <form
                onSubmit={handleSaveRule}
                className="mt-4 pt-4 border-t flex items-end gap-2 flex-wrap"
                aria-label="Add or update retention rule"
              >
                <div>
                  <label
                    htmlFor="rule-domain"
                    className="text-[10px] font-bold uppercase tracking-[0.06em] text-fg-muted mb-1 block"
                  >
                    Domain
                  </label>
                  <input
                    id="rule-domain"
                    type="text"
                    placeholder="e.g. campaigns"
                    value={ruleDomain}
                    onChange={(e) => setRuleDomain(e.target.value)}
                    className="input h-[32px] text-[12px] w-[150px]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="rule-months"
                    className="text-[10px] font-bold uppercase tracking-[0.06em] text-fg-muted mb-1 block"
                  >
                    Months (blank = never)
                  </label>
                  <input
                    id="rule-months"
                    type="number"
                    placeholder="e.g. 24"
                    value={ruleMonths}
                    onChange={(e) => setRuleMonths(e.target.value)}
                    min={1}
                    className="input h-[32px] text-[12px] w-[110px]"
                  />
                </div>
                <div className="flex items-center gap-2 pb-[2px]">
                  <input
                    type="checkbox"
                    id="rule-never-delete"
                    checked={ruleNeverDelete}
                    onChange={(e) => setRuleNeverDelete(e.target.checked)}
                    className="rounded"
                  />
                  <label htmlFor="rule-never-delete" className="text-[12px] text-fg whitespace-nowrap cursor-pointer">
                    Never delete
                  </label>
                </div>
                <button
                  type="submit"
                  disabled={ruleBusy}
                  className="text-[12px] font-semibold rounded-[7px] px-3 py-[7px] transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: TEAL, color: '#fff' }}
                >
                  {ruleBusy ? 'Saving…' : 'Save rule'}
                </button>
              </form>
            </Reveal>

            {/* ── master contacts ───────────────────────────────────────── */}
            <Reveal delay={0.25} lift className={`${cardBase} mb-[18px]`}>
              <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
                <div>
                  <div className="font-display text-[14px] font-bold text-fg mb-0.5">
                    Master contacts
                  </div>
                  <div className="text-[11px] text-fg-muted">
                    Deduplicated contact registry · {contacts.length} shown
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 mb-4">
                <div className="relative">
                  <Search
                    size={13}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    placeholder="Search contacts…"
                    value={contactSearchInput}
                    onChange={(e) => setContactSearchInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSearchContacts(); }}
                    className="input pl-7 h-[32px] text-[12px] w-[220px]"
                    aria-label="Search master contacts"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSearchContacts}
                  className="text-[12px] font-semibold rounded-[7px] border px-3 py-[6px] transition-colors hover:bg-surface-2"
                  style={{ borderColor: TEAL, color: TEAL }}
                  aria-label="Search contacts"
                >
                  Search
                </button>
              </div>
              <DataTable
                columns={contactColumns}
                rows={contacts}
                rowKey={(row) => row.id}
                empty={<span className="text-fg-muted">No contacts found.</span>}
              />
            </Reveal>

            {/* ── legal holds ───────────────────────────────────────────── */}
            <Reveal delay={0.3} lift className={`${cardBase} mb-[18px]`}>
              <div className="font-display text-[14px] font-bold text-fg mb-0.5">Legal holds</div>
              <div className="text-[11px] text-fg-muted mb-4">
                Active holds block deletion and anonymisation
              </div>
              <DataTable
                columns={holdsColumns}
                rows={legalHolds}
                rowKey={(row) => row.id}
                empty={<span className="text-fg-muted">No legal holds placed.</span>}
              />
              <form
                onSubmit={handlePlaceHold}
                className="mt-4 pt-4 border-t flex items-end gap-2 flex-wrap"
                aria-label="Place legal hold"
              >
                <div>
                  <label
                    htmlFor="hold-type"
                    className="text-[10px] font-bold uppercase tracking-[0.06em] text-fg-muted mb-1 block"
                  >
                    Resource type
                  </label>
                  <select
                    id="hold-type"
                    value={holdResourceType}
                    onChange={(e) =>
                      setHoldResourceType(e.target.value as 'campaign' | 'master_contact')
                    }
                    className="input h-[32px] text-[12px] w-[160px]"
                  >
                    <option value="campaign">Campaign</option>
                    <option value="master_contact">Master contact</option>
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="hold-resource-id"
                    className="text-[10px] font-bold uppercase tracking-[0.06em] text-fg-muted mb-1 block"
                  >
                    Resource ID
                  </label>
                  <input
                    id="hold-resource-id"
                    type="text"
                    placeholder="UUID"
                    value={holdResourceId}
                    onChange={(e) => setHoldResourceId(e.target.value)}
                    className="input h-[32px] text-[12px] w-[210px]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="hold-reason"
                    className="text-[10px] font-bold uppercase tracking-[0.06em] text-fg-muted mb-1 block"
                  >
                    Reason
                  </label>
                  <input
                    id="hold-reason"
                    type="text"
                    placeholder="Legal case ref…"
                    value={holdReason}
                    onChange={(e) => setHoldReason(e.target.value)}
                    className="input h-[32px] text-[12px] w-[220px]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={holdBusy}
                  className="text-[12px] font-semibold rounded-[7px] px-3 py-[7px] transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: AMBER, color: '#fff' }}
                >
                  {holdBusy ? 'Placing…' : 'Place hold'}
                </button>
              </form>
            </Reveal>

            {/* ── erasure requests ──────────────────────────────────────── */}
            <Reveal delay={0.35} lift className={`${cardBase} mb-[18px]`}>
              <div className="font-display text-[14px] font-bold text-fg mb-0.5">
                Erasure requests
              </div>
              <div className="text-[11px] text-fg-muted mb-4">
                GDPR / PDPA right-to-erasure requests
              </div>
              <DataTable
                columns={erasureColumns}
                rows={erasures}
                rowKey={(row) => row.id}
                empty={<span className="text-fg-muted">No erasure requests yet.</span>}
              />
              <form
                onSubmit={handleNewErasure}
                className="mt-4 pt-4 border-t flex items-end gap-2 flex-wrap"
                aria-label="New erasure request"
              >
                <div>
                  <label
                    htmlFor="erasure-phone"
                    className="text-[10px] font-bold uppercase tracking-[0.06em] text-fg-muted mb-1 block"
                  >
                    Phone
                  </label>
                  <input
                    id="erasure-phone"
                    type="tel"
                    placeholder="+256…"
                    value={erasurePhone}
                    onChange={(e) => setErasurePhone(e.target.value)}
                    className="input h-[32px] text-[12px] w-[150px]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="erasure-email"
                    className="text-[10px] font-bold uppercase tracking-[0.06em] text-fg-muted mb-1 block"
                  >
                    Email
                  </label>
                  <input
                    id="erasure-email"
                    type="email"
                    placeholder="or email…"
                    value={erasureEmail}
                    onChange={(e) => setErasureEmail(e.target.value)}
                    className="input h-[32px] text-[12px] w-[190px]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="erasure-requested-by"
                    className="text-[10px] font-bold uppercase tracking-[0.06em] text-fg-muted mb-1 block"
                  >
                    Requested by
                  </label>
                  <input
                    id="erasure-requested-by"
                    type="text"
                    placeholder="Optional"
                    value={erasureRequestedBy}
                    onChange={(e) => setErasureRequestedBy(e.target.value)}
                    className="input h-[32px] text-[12px] w-[150px]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={erasureBusy}
                  className="text-[12px] font-semibold rounded-[7px] px-3 py-[7px] transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: RED, color: '#fff' }}
                >
                  {erasureBusy ? 'Creating…' : 'New erasure'}
                </button>
              </form>
            </Reveal>

            {/* ── exports ───────────────────────────────────────────────── */}
            <Reveal delay={0.4} lift className={`${cardBase} mb-[18px]`}>
              <div className="font-display text-[14px] font-bold text-fg mb-0.5">Exports</div>
              <div className="text-[11px] text-fg-muted mb-4">
                Archive exports by domain · {exports.length} job{exports.length !== 1 ? 's' : ''}
              </div>
              <DataTable
                columns={exportColumns}
                rows={exports}
                rowKey={(row) => row.id}
                empty={<span className="text-fg-muted">No exports yet.</span>}
              />
              <form
                onSubmit={handleNewExport}
                className="mt-4 pt-4 border-t flex items-end gap-2 flex-wrap"
                aria-label="Create export"
              >
                <div>
                  <label
                    htmlFor="export-domain"
                    className="text-[10px] font-bold uppercase tracking-[0.06em] text-fg-muted mb-1 block"
                  >
                    Domain
                  </label>
                  <select
                    id="export-domain"
                    value={exportDomain}
                    onChange={(e) =>
                      setExportDomain(e.target.value as 'campaigns' | 'payments' | 'contacts')
                    }
                    className="input h-[32px] text-[12px] w-[160px]"
                  >
                    <option value="campaigns">Campaigns</option>
                    <option value="payments">Payments</option>
                    <option value="contacts">Contacts</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={exportBusy}
                  className="text-[12px] font-semibold rounded-[7px] px-3 py-[7px] transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: TEAL, color: '#fff' }}
                >
                  {exportBusy ? 'Creating…' : 'New export'}
                </button>
              </form>
            </Reveal>

            {/* ── access log ────────────────────────────────────────────── */}
            <Reveal delay={0.45} lift className={cardBase}>
              <div className="flex items-start justify-between mb-1 gap-2 flex-wrap">
                <div>
                  <div className="font-display text-[14px] font-bold text-fg mb-0.5">
                    Access log
                  </div>
                  <div className="text-[11px] text-fg-muted mb-4">
                    Append-only · tamper-evident · last {accessLog.length} entries
                  </div>
                </div>
                <StatusPill label="Append-only" color={TEAL} />
              </div>
              <DataTable
                columns={accessLogColumns}
                rows={accessLog}
                rowKey={(row) => row.id}
                empty={<span className="text-fg-muted">No access log entries yet.</span>}
              />
            </Reveal>
          </>
        )}
      </div>
    </>
  );
}
