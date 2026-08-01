/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Calendar, Users } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { useApiQuery, useApiMutation } from '@/lib/hooks';
import Topbar from '@/components/admin/Topbar';
import { Reveal } from '@/components/admin/Reveal';
import { StatusBadge } from '@/components/ui';
import FormGrid, { FormActions, FormCard } from '@/components/admin/FormGrid';
import FormField from '@/components/admin/FormField';
import DataTable from '@/components/admin/DataTable';
import type { Column } from '@/components/admin/DataTable';

// ── types ─────────────────────────────────────────────────────────────────────
type AccountStatus = 'active' | 'trial' | 'past_due' | 'suspended';
type SubStatus = 'active' | 'past_due' | 'cancelled' | 'trialing';

interface AdminAccount {
  id: string;
  name: string;
  email: string;
  plan: string;
  status: AccountStatus;
  is_active: boolean;
  joined: string;
  messages_month: number;
  mrr_ugx: number;
}

interface Subscription {
  id: string;
  plan_id: string;
  plan_name: string;
  price_ugx: number;
  status: SubStatus;
  current_period_end: string | null;
  manually_assigned: boolean;
  custom_messages_per_month: number | null;
  custom_daily_limit: number | null;
  custom_price_ugx: number | null;
  custom_features: Record<string, unknown> | null;
}

interface Campaign {
  id: string;
  name: string;
  type: string;
  status: string;
  messages_sent: number;
  created_at: string;
}

interface Payment {
  tx_ref: string;
  amount_ugx: number;
  method: string;
  status: string;
  created_at: string;
}

interface AccountDetailResponse {
  account: AdminAccount;
  subscription: Subscription | null;
  recent_campaigns: Campaign[];
  recent_payments: Payment[];
  users_count: number;
}

interface AdminPlan {
  id: string;
  name: string;
  price_ugx: number;
  messages_per_month: number;
}

interface AssignPlanResult {
  account_id: string;
  plan_name: string;
  status: string;
  manually_assigned: boolean;
  custom_messages_per_month: number | null;
  custom_daily_limit: number | null;
  custom_price_ugx: number | null;
  current_period_end: string | null;
}

interface PlanForm {
  plan_id: string;
  custom_messages_per_month: string;
  custom_daily_limit: string;
  custom_price_ugx: string;
  period_days: number;
  note: string;
}

// ── constants ─────────────────────────────────────────────────────────────────
const cardBase = 'bg-white border rounded-[11px] p-4';
const cardLg = 'bg-white border rounded-[11px] p-6';

const EMPTY_FORM: PlanForm = {
  plan_id: '',
  custom_messages_per_month: '',
  custom_daily_limit: '',
  custom_price_ugx: '',
  period_days: 30,
  note: '',
};

// ── helpers ────────────────────────────────────────────────────────────────────
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch {
    return '—';
  }
}

function fmtMsgs(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n < 0) return 'Unlimited';
  return n.toLocaleString();
}

function parseOptInt(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = parseInt(t, 10);
  return isNaN(n) ? null : n;
}

// ── KVItem sub-component ──────────────────────────────────────────────────────
function KVItem({
  label,
  value,
  children,
  highlight = false,
}: {
  label: string;
  value?: string;
  children?: ReactNode;
  highlight?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-text-muted mb-0.5">
        {label}
      </div>
      <div
        className="text-[13px] font-semibold"
        style={{ color: highlight ? '#B45309' : '#1B1F4A' }}
      >
        {children ?? value ?? '—'}
      </div>
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────
export default function AccountDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [form, setForm]           = useState<PlanForm>(EMPTY_FORM);
  const [lastResult, setLastResult] = useState<AssignPlanResult | null>(null);

  const { data, isLoading: loading, isError, error } = useApiQuery(
    ['admin', 'account', id],
    async () => {
      const [detail, plans] = await Promise.all([
        api<AccountDetailResponse>(`/admin/accounts/${id}`, { auth: true }),
        api<AdminPlan[]>('/admin/plans', { auth: true }),
      ]);
      return { detail, plans };
    },
  );

  const detail = data?.detail ?? null;
  const plans = data?.plans ?? [];

  useEffect(() => {
    if (isError) {
      toast.error(error instanceof ApiError ? error.message : 'Failed to load account');
    }
  }, [isError, error]);

  // Seed plan dropdown with the account's current plan, if any
  useEffect(() => {
    if (!data) return;
    setForm((prev) => ({
      ...prev,
      plan_id: data.detail.subscription?.plan_id ?? data.plans[0]?.id ?? '',
    }));
  }, [data]);

  const assignMutation = useApiMutation<AssignPlanResult, Record<string, unknown>>(
    (payload) =>
      api<AssignPlanResult>(`/admin/accounts/${id}/plan`, {
        method: 'POST',
        auth: true,
        body: JSON.stringify(payload),
      }),
    {
      invalidate: [['admin', 'account', id]],
      onSuccess: (result) => {
        setLastResult(result);
        toast.success(`Plan assigned: ${result.plan_name}`);
      },
      onError: (err) => {
        toast.error(err instanceof ApiError ? err.message : 'Failed to assign plan');
      },
    },
  );
  const saving = assignMutation.isPending;

  function update<K extends keyof PlanForm>(key: K, value: PlanForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleAssign() {
    if (!form.plan_id) {
      toast.error('Select a plan first');
      return;
    }
    setLastResult(null);

    const payload: Record<string, unknown> = {
      plan_id: form.plan_id,
      period_days: Math.max(1, form.period_days),
    };

    const cmpm = parseOptInt(form.custom_messages_per_month);
    if (cmpm !== null) payload.custom_messages_per_month = cmpm;

    const cdl = parseOptInt(form.custom_daily_limit);
    if (cdl !== null) payload.custom_daily_limit = cdl;

    const cpx = parseOptInt(form.custom_price_ugx);
    if (cpx !== null) payload.custom_price_ugx = cpx;

    if (form.note.trim()) payload.note = form.note.trim();

    assignMutation.mutate(payload);
  }

  // ── column definitions ────────────────────────────────────────────────────
  const campaignCols = useMemo<Column<Campaign>[]>(() => [
    {
      key: 'name',
      label: 'Campaign',
      render: (row) => (
        <span className="font-semibold text-[12px]" style={{ color: '#1B1F4A' }}>
          {row.name}
        </span>
      ),
    },
    {
      key: 'type',
      label: 'Type',
      render: (row) => (
        <span className="capitalize text-[11px] text-text-muted">{row.type}</span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => <StatusBadge domain="campaign" status={row.status} />,
    },
    {
      key: 'messages_sent',
      label: 'Sent',
      align: 'right',
      render: (row) => (
        <span className="font-mono text-[12px]">{row.messages_sent.toLocaleString()}</span>
      ),
    },
    {
      key: 'created_at',
      label: 'Date',
      render: (row) => (
        <span className="text-[11px] text-text-muted whitespace-nowrap">{fmtDate(row.created_at)}</span>
      ),
    },
  ], []);

  const paymentCols = useMemo<Column<Payment>[]>(() => [
    {
      key: 'tx_ref',
      label: 'Ref',
      render: (row) => (
        <span className="font-mono text-[10.5px] text-text-muted">{row.tx_ref}</span>
      ),
    },
    {
      key: 'amount_ugx',
      label: 'Amount',
      align: 'right',
      render: (row) => (
        <span className="font-mono text-[12px] whitespace-nowrap">
          UGX {row.amount_ugx.toLocaleString()}
        </span>
      ),
    },
    {
      key: 'method',
      label: 'Method',
      render: (row) => (
        <span className="capitalize text-[11px] text-text-muted">{row.method}</span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => <StatusBadge domain="payment" status={row.status} />,
    },
    {
      key: 'created_at',
      label: 'Date',
      render: (row) => (
        <span className="text-[11px] text-text-muted whitespace-nowrap">{fmtDate(row.created_at)}</span>
      ),
    },
  ], []);

  // ── loading / error states ────────────────────────────────────────────────
  if (loading) {
    return (
      <>
        <Topbar title="Account" subtitle="Loading…" showPeriod={false} />
        <div className="p-[18px] flex items-center justify-center py-24 text-[12px] text-text-muted">
          Loading account…
        </div>
      </>
    );
  }

  if (!detail) {
    return (
      <>
        <Topbar title="Account" subtitle="Not found" showPeriod={false} />
        <div className="p-[18px] text-center py-20 text-[12px] text-text-muted">
          Account not found.{' '}
          <Link href="/admin/accounts" className="underline hover:text-navy transition-colors">
            Back to accounts
          </Link>
        </div>
      </>
    );
  }

  const { account, subscription, recent_campaigns, recent_payments, users_count } = detail;

  return (
    <>
      <Topbar title={account.name} subtitle={account.email} showPeriod={false} />

      <div className="p-[18px] space-y-4">

        {/* ── Back link ──────────────────────────────────────────────────── */}
        <Link
          href="/admin/accounts"
          className="inline-flex items-center gap-1.5 text-[11px] text-text-muted hover:text-navy transition-colors"
          aria-label="Back to accounts list"
        >
          <ArrowLeft size={13} aria-hidden="true" />
          Back to accounts
        </Link>

        {/* ── Account header card ────────────────────────────────────────── */}
        <Reveal>
          <div className={`${cardBase} flex flex-wrap items-start justify-between gap-4`}>
            {/* Identity */}
            <div className="flex flex-col gap-2 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-display font-extrabold text-[18px] text-navy leading-tight">
                  {account.name}
                </h1>
                <StatusBadge domain="account" status={account.status} />
                {/* Plan pill */}
                <span
                  style={{
                    background: 'rgba(27,31,74,0.09)',
                    color: '#1B1F4A',
                    padding: '2px 9px',
                    fontSize: '9.5px',
                    fontWeight: 700,
                    borderRadius: '9999px',
                    display: 'inline-block',
                    letterSpacing: '0.03em',
                  }}
                >
                  {account.plan || 'No plan'}
                </span>
              </div>
              <div className="text-[12px] text-text-muted truncate">{account.email}</div>
              <div className="flex items-center gap-4 flex-wrap mt-0.5">
                <span className="inline-flex items-center gap-1 text-[11px] text-text-muted">
                  <Calendar size={12} aria-hidden="true" />
                  Joined {fmtDate(account.joined)}
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] text-text-muted">
                  <Users size={12} aria-hidden="true" />
                  {users_count} user{users_count !== 1 ? 's' : ''}
                </span>
              </div>
            </div>

            {/* Quick stats */}
            <div className="flex items-start gap-6 flex-wrap shrink-0">
              <div className="text-right">
                <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-text-muted">
                  Messages / mo
                </div>
                <div className="font-mono font-semibold text-[20px] text-navy leading-tight mt-0.5">
                  {account.messages_month.toLocaleString()}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-text-muted">
                  MRR
                </div>
                <div className="font-mono font-semibold text-[20px] text-navy leading-tight mt-0.5">
                  {account.mrr_ugx > 0 ? `UGX ${account.mrr_ugx.toLocaleString()}` : '—'}
                </div>
              </div>
            </div>
          </div>
        </Reveal>

        {/* ── Subscription & plan controls card ──────────────────────────── */}
        <Reveal delay={0.07}>
          <div className={cardBase}>
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <div className="font-display text-[14px] font-bold text-navy">
                Subscription &amp; plan controls
              </div>
              {subscription?.manually_assigned && (
                <span
                  style={{
                    background: 'rgba(245,158,11,0.12)',
                    color: '#B45309',
                    padding: '2px 10px',
                    fontSize: '9.5px',
                    fontWeight: 700,
                    borderRadius: '9999px',
                    letterSpacing: '0.03em',
                  }}
                >
                  Custom deal
                </span>
              )}
            </div>

            {subscription ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-4">
                <KVItem label="Plan" value={subscription.plan_name} />
                <KVItem label="Status">
                  <StatusBadge domain="subscription" status={subscription.status} />
                </KVItem>
                <KVItem label="Period ends" value={fmtDate(subscription.current_period_end)} />
                <KVItem
                  label="Price"
                  value={`UGX ${subscription.price_ugx.toLocaleString()}`}
                />

                {/* Only show custom override fields that are actually set */}
                {subscription.custom_messages_per_month != null && (
                  <KVItem
                    label="Custom messages / mo"
                    value={fmtMsgs(subscription.custom_messages_per_month)}
                    highlight
                  />
                )}
                {subscription.custom_daily_limit != null && (
                  <KVItem
                    label="Custom daily limit"
                    value={fmtMsgs(subscription.custom_daily_limit)}
                    highlight
                  />
                )}
                {subscription.custom_price_ugx != null && (
                  <KVItem
                    label="Custom price"
                    value={`UGX ${subscription.custom_price_ugx.toLocaleString()}`}
                    highlight
                  />
                )}
              </div>
            ) : (
              <p className="text-[12px] text-text-muted">No active subscription.</p>
            )}
          </div>
        </Reveal>

        {/* ── Assign / override plan form ────────────────────────────────── */}
        <Reveal delay={0.14}>
          <div className={cardLg}>
            <div className="mb-4">
              <div className="font-display text-[14px] font-bold text-navy mb-0.5">
                Assign / override plan
              </div>
              <p className="text-[11px] text-text-muted">
                Custom overrides mark this as a manual deal — payment settlement and dunning
                won&apos;t reset it.
              </p>
            </div>

            {/* Success banner */}
            {lastResult && (
              <div
                className="mb-4 rounded-[9px] border p-3 text-[12px]"
                style={{
                  background: 'rgba(16,185,129,0.08)',
                  borderColor: 'rgba(16,185,129,0.25)',
                  color: '#065F46',
                }}
                role="status"
                aria-live="polite"
              >
                <strong>{lastResult.plan_name}</strong> assigned successfully.
                {lastResult.manually_assigned && ' Marked as a custom deal.'}
                {lastResult.current_period_end &&
                  ` Period ends ${fmtDate(lastResult.current_period_end)}.`}
              </div>
            )}

            <FormGrid columns={2}>
              <FormField label="Plan" htmlFor="af-plan">
                <select
                  id="af-plan"
                  className="input"
                  value={form.plan_id}
                  onChange={(e) => update('plan_id', e.target.value)}
                  disabled={plans.length === 0}
                >
                  {plans.length === 0 && (
                    <option value="">No plans available</option>
                  )}
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {' — '}
                      UGX {p.price_ugx.toLocaleString()}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField
                label="Period days"
                htmlFor="af-period"
                hint="Billing window length. Default 30."
              >
                <input
                  id="af-period"
                  type="number"
                  min={1}
                  className="input"
                  value={form.period_days}
                  onChange={(e) => update('period_days', Math.max(1, Number(e.target.value)))}
                />
              </FormField>

              <FormField
                label="Custom messages / month"
                htmlFor="af-msgs"
                hint="Blank = inherit from plan. Enter -1 for unlimited."
              >
                <input
                  id="af-msgs"
                  type="number"
                  className="input"
                  placeholder="Inherit from plan"
                  value={form.custom_messages_per_month}
                  onChange={(e) => update('custom_messages_per_month', e.target.value)}
                />
              </FormField>

              <FormField
                label="Custom daily limit"
                htmlFor="af-daily"
                hint="Blank = inherit from plan."
              >
                <input
                  id="af-daily"
                  type="number"
                  className="input"
                  placeholder="Inherit from plan"
                  value={form.custom_daily_limit}
                  onChange={(e) => update('custom_daily_limit', e.target.value)}
                />
              </FormField>

              <FormField
                label="Custom price (UGX)"
                htmlFor="af-price"
                hint="Blank = use plan's published price."
              >
                <input
                  id="af-price"
                  type="number"
                  min={0}
                  className="input"
                  placeholder="Inherit from plan"
                  value={form.custom_price_ugx}
                  onChange={(e) => update('custom_price_ugx', e.target.value)}
                />
              </FormField>

              <FormField
                label="Note (optional)"
                htmlFor="af-note"
                hint="Reason for the custom deal."
              >
                <input
                  id="af-note"
                  type="text"
                  className="input"
                  placeholder="e.g. Negotiated discount for 6 months"
                  maxLength={200}
                  value={form.note}
                  onChange={(e) => update('note', e.target.value)}
                />
              </FormField>
            </FormGrid>

            <FormActions>
              <button
                type="button"
                disabled={saving || plans.length === 0}
                onClick={handleAssign}
                className="rounded-full font-display font-bold text-[13px] px-5 py-2 transition hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ background: '#00D4AA', color: '#0D0F2E' }}
              >
                {saving ? 'Saving…' : 'Assign plan'}
              </button>
            </FormActions>
          </div>
        </Reveal>

        {/* ── Recent campaigns + payments ───────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Reveal delay={0.21}>
            <div className={cardBase}>
              <div className="font-display text-[13px] font-bold text-navy mb-3">
                Recent campaigns
              </div>
              <DataTable<Campaign>
                columns={campaignCols}
                rows={recent_campaigns}
                rowKey={(row) => row.id}
                stagger={0.03}
                baseDelay={0.1}
                empty={
                  <span className="text-text-muted">No campaigns yet.</span>
                }
              />
            </div>
          </Reveal>

          <Reveal delay={0.28}>
            <div className={cardBase}>
              <div className="font-display text-[13px] font-bold text-navy mb-3">
                Recent payments
              </div>
              <DataTable<Payment>
                columns={paymentCols}
                rows={recent_payments}
                rowKey={(row) => row.tx_ref}
                stagger={0.03}
                baseDelay={0.1}
                empty={
                  <span className="text-text-muted">No payments yet.</span>
                }
              />
            </div>
          </Reveal>
        </div>
      </div>
    </>
  );
}
