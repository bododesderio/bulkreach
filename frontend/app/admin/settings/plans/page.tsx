/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
'use client';

import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Star, X } from 'lucide-react';
import { toast } from 'sonner';
import Topbar from '@/components/admin/Topbar';
import FormGrid, { FormActions, FormCard } from '@/components/admin/FormGrid';
import FormField from '@/components/admin/FormField';
import { Reveal } from '@/components/admin/Reveal';
import { api, ApiError } from '@/lib/api';
import { useApiQuery, useApiMutation } from '@/lib/hooks';

// ── types ─────────────────────────────────────────────────────────────────────

type Period = 'month' | 'quarter' | 'year';
type PlanStatus = 'active' | 'hidden';

interface AdminPlan {
  id: string;
  name: string;
  price_ugx: number;
  messages_per_month: number; // -1 = unlimited
  batch_size: number;
  features: { bullets?: string[]; [key: string]: unknown };
  period: string;
  status: string;
  featured: boolean;
  display_order: number;
  subscriber_count: number;
}

interface PlanForm {
  name: string;
  price_ugx: number;
  unlimited: boolean;
  messages_per_month: number;
  batch_size: number;
  period: Period;
  status: PlanStatus;
  featured: boolean;
  display_order: number;
  bullets: string; // one per line
}

const EMPTY_FORM: PlanForm = {
  name: '',
  price_ugx: 0,
  unlimited: false,
  messages_per_month: 5000,
  batch_size: 20000,
  period: 'month',
  status: 'active',
  featured: false,
  display_order: 100,
  bullets: '',
};

// ── helpers ─────────────────────────────────────────────────────────────────────

function planToForm(p: AdminPlan): PlanForm {
  const unlimited = p.messages_per_month < 0;
  return {
    name: p.name,
    price_ugx: p.price_ugx,
    unlimited,
    messages_per_month: unlimited ? 5000 : p.messages_per_month,
    batch_size: p.batch_size,
    period: (p.period as Period) ?? 'month',
    status: (p.status as PlanStatus) ?? 'active',
    featured: p.featured,
    display_order: p.display_order,
    bullets: Array.isArray(p.features?.bullets) ? p.features.bullets.join('\n') : '',
  };
}

// ── toggle (matches payment-providers page) ────────────────────────────────────

function Toggle({
  id,
  checked,
  onChange,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative inline-flex flex-shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00D4AA] focus-visible:ring-offset-2"
      style={{ width: '40px', height: '22px', background: checked ? '#00D4AA' : '#D1D5DB' }}
    >
      <span className="sr-only">{checked ? 'On' : 'Off'}</span>
      <span
        className="inline-block rounded-full bg-white shadow transition-transform"
        style={{ width: '16px', height: '16px', transform: checked ? 'translateX(20px)' : 'translateX(3px)' }}
      />
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const active = status === 'active';
  return (
    <span
      className="rounded-full font-semibold uppercase"
      style={{
        background: active ? 'rgba(16,185,129,0.1)' : 'rgba(107,114,128,0.12)',
        color: active ? '#10B981' : '#6B7280',
        padding: '2px 9px',
        fontSize: '10px',
        letterSpacing: '0.04em',
      }}
    >
      {active ? 'Active' : 'Hidden'}
    </span>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function PlansPage() {
  // editor: null = closed, 'new' = create, otherwise the plan being edited
  const [editing, setEditing] = useState<AdminPlan | 'new' | null>(null);
  const [form, setForm] = useState<PlanForm>(EMPTY_FORM);

  const { data, isLoading: loading, isError, error } = useApiQuery(
    ['admin', 'plans'],
    () => api<AdminPlan[]>('/admin/plans', { auth: true }),
  );
  const plans = data ?? [];

  useEffect(() => {
    if (isError) {
      toast.error(error instanceof ApiError ? error.message : 'Failed to load plans');
    }
  }, [isError, error]);

  const saveMutation = useApiMutation<
    unknown,
    { payload: Record<string, unknown>; isNew: boolean; editId?: string; name: string }
  >(
    ({ payload, isNew, editId }) =>
      isNew
        ? api('/admin/plans', { method: 'POST', auth: true, body: JSON.stringify(payload) })
        : api(`/admin/plans/${editId}`, { method: 'PATCH', auth: true, body: JSON.stringify(payload) }),
    {
      invalidate: [['admin', 'plans']],
      onSuccess: (_d, vars) => {
        toast.success(vars.isNew ? `Plan “${vars.name}” created` : `Plan “${vars.name}” updated`);
        setEditing(null);
      },
      onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Save failed'),
    },
  );
  const saving = saveMutation.isPending;

  // Editor-modal a11y: ESC closes (unless mid-save); lock body scroll while open.
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) setEditing(null);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [editing, saving]);

  const deleteMutation = useApiMutation<unknown, AdminPlan>(
    (p) => api(`/admin/plans/${p.id}`, { method: 'DELETE', auth: true }),
    {
      invalidate: [['admin', 'plans']],
      onSuccess: (_d, p) => toast.success(`Plan “${p.name}” deleted`),
      onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Delete failed'),
    },
  );
  const deletingId = deleteMutation.isPending ? deleteMutation.variables?.id ?? null : null;

  function openNew() {
    setForm(EMPTY_FORM);
    setEditing('new');
  }

  function openEdit(p: AdminPlan) {
    setForm(planToForm(p));
    setEditing(p);
  }

  function update<K extends keyof PlanForm>(key: K, value: PlanForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function save() {
    if (!form.name.trim()) {
      toast.error('Plan name is required');
      return;
    }
    const bullets = form.bullets
      .split('\n')
      .map((b) => b.trim())
      .filter(Boolean);

    // Preserve any non-bullet feature keys (e.g. gates) when editing
    const existingFeatures =
      editing !== 'new' && editing ? { ...editing.features } : {};
    const features = { ...existingFeatures, bullets };

    const payload = {
      name: form.name.trim(),
      price_ugx: Math.max(0, Math.round(form.price_ugx)),
      messages_per_month: form.unlimited ? -1 : Math.max(0, Math.round(form.messages_per_month)),
      batch_size: Math.max(1, Math.round(form.batch_size)),
      period: form.period,
      status: form.status,
      featured: form.featured,
      display_order: Math.round(form.display_order),
      features,
    };

    saveMutation.mutate({
      payload,
      isNew: editing === 'new',
      editId: editing !== 'new' && editing ? editing.id : undefined,
      name: payload.name,
    });
  }

  function remove(p: AdminPlan) {
    if (p.subscriber_count > 0) {
      toast.error('Plan has active subscribers — hide it instead of deleting');
      return;
    }
    if (!window.confirm(`Delete the “${p.name}” plan? This cannot be undone.`)) return;
    deleteMutation.mutate(p);
  }

  const fmtMsgs = (n: number) => (n < 0 ? 'Unlimited' : n.toLocaleString());

  return (
    <>
      <Topbar
        title="Plans"
        subtitle="Subscription plans that drive pricing & checkout"
        showPeriod={false}
      />

      <div className="p-[18px] space-y-4">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <p className="text-[12px] text-text-muted">
            Edits flow straight to the public pricing page and client checkout.
          </p>
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-1.5 rounded-full font-display font-bold text-[13px] px-4 py-2 transition hover:opacity-90"
            style={{ background: '#00D4AA', color: '#0D0F2E' }}
          >
            <Plus size={15} aria-hidden="true" /> New plan
          </button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-[11px] border bg-white" />
            ))}
          </div>
        ) : plans.length === 0 ? (
          <FormCard>
            <p className="text-center text-[13px] text-text-muted py-6">
              No plans yet. Create your first plan.
            </p>
          </FormCard>
        ) : (
          <Reveal>
            <div className="overflow-x-auto rounded-[11px] border bg-white">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b">
                    {['Order', 'Plan', 'Price (UGX)', 'Messages / mo', 'Batch', 'Period', 'Status', 'Subs', ''].map(
                      (h) => (
                        <th
                          key={h}
                          className="px-4 py-3 text-left text-[10.5px] font-semibold uppercase tracking-[0.04em] text-text-muted whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {plans.map((p) => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-black/[0.015] transition-colors">
                      <td className="px-4 py-3 font-mono text-text-muted">{p.display_order}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-navy">{p.name}</span>
                          {p.featured && (
                            <span
                              className="inline-flex items-center gap-0.5 rounded-full font-semibold uppercase"
                              style={{
                                background: 'rgba(0,212,170,0.12)',
                                color: '#007a65',
                                padding: '1px 7px',
                                fontSize: '9px',
                                letterSpacing: '0.04em',
                              }}
                            >
                              <Star size={9} aria-hidden="true" /> Featured
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold whitespace-nowrap">
                        {p.price_ugx.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 font-mono whitespace-nowrap">{fmtMsgs(p.messages_per_month)}</td>
                      <td className="px-4 py-3 font-mono text-text-muted">{p.batch_size.toLocaleString()}</td>
                      <td className="px-4 py-3 capitalize text-text-muted">{p.period}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={p.status} />
                      </td>
                      <td className="px-4 py-3 font-mono text-text-muted">{p.subscriber_count}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(p)}
                            aria-label={`Edit ${p.name}`}
                            className="rounded-md p-1.5 text-text-muted transition hover:bg-black/[0.05] hover:text-navy"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(p)}
                            disabled={p.subscriber_count > 0 || deletingId === p.id}
                            aria-label={`Delete ${p.name}`}
                            title={p.subscriber_count > 0 ? 'Has active subscribers — hide instead' : 'Delete'}
                            className="rounded-md p-1.5 text-text-muted transition hover:bg-red-50 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-text-muted"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>
        )}
      </div>

      {/* ── Editor modal ─────────────────────────────────────────────────────── */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8"
          style={{ background: 'rgba(13,15,46,0.45)' }}
          role="dialog"
          aria-modal="true"
          aria-label={editing === 'new' ? 'Create plan' : 'Edit plan'}
          onClick={() => !saving && setEditing(null)}
        >
          <div
            className="w-full max-w-2xl animate-fade-up"
            onClick={(e) => e.stopPropagation()}
          >
            <FormCard>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display font-bold text-[16px] text-navy">
                  {editing === 'new' ? 'New plan' : `Edit “${editing.name}”`}
                </h2>
                <button
                  type="button"
                  onClick={() => !saving && setEditing(null)}
                  aria-label="Close"
                  className="rounded-md p-1 text-text-muted transition hover:bg-black/[0.05] hover:text-navy"
                >
                  <X size={18} />
                </button>
              </div>

              <FormGrid columns={2}>
                <FormField label="Plan name" htmlFor="pf-name">
                  <input
                    id="pf-name"
                    type="text"
                    className="input"
                    maxLength={50}
                    value={form.name}
                    onChange={(e) => update('name', e.target.value)}
                  />
                </FormField>

                <FormField label="Price (UGX)" htmlFor="pf-price" hint="0 = free / managed.">
                  <input
                    id="pf-price"
                    type="number"
                    min={0}
                    className="input"
                    value={form.price_ugx}
                    onChange={(e) => update('price_ugx', Number(e.target.value))}
                  />
                </FormField>

                <FormField
                  label="Messages / month"
                  htmlFor="pf-msgs"
                  hint="Toggle Unlimited for no monthly cap."
                >
                  <div className="flex items-center gap-3">
                    <input
                      id="pf-msgs"
                      type="number"
                      min={0}
                      className="input"
                      disabled={form.unlimited}
                      value={form.unlimited ? '' : form.messages_per_month}
                      placeholder={form.unlimited ? 'Unlimited' : undefined}
                      onChange={(e) => update('messages_per_month', Number(e.target.value))}
                    />
                    <label className="flex items-center gap-2 whitespace-nowrap text-[12px] text-text-muted select-none">
                      <Toggle
                        id="pf-unlimited"
                        checked={form.unlimited}
                        onChange={(v) => update('unlimited', v)}
                      />
                      Unlimited
                    </label>
                  </div>
                </FormField>

                <FormField label="Batch size" htmlFor="pf-batch" hint="Max recipients per send batch.">
                  <input
                    id="pf-batch"
                    type="number"
                    min={1}
                    className="input"
                    value={form.batch_size}
                    onChange={(e) => update('batch_size', Number(e.target.value))}
                  />
                </FormField>

                <FormField label="Billing period" htmlFor="pf-period">
                  <select
                    id="pf-period"
                    className="input"
                    value={form.period}
                    onChange={(e) => update('period', e.target.value as Period)}
                  >
                    <option value="month">Month</option>
                    <option value="quarter">Quarter</option>
                    <option value="year">Year</option>
                  </select>
                </FormField>

                <FormField label="Status" htmlFor="pf-status" hint="Hidden plans are not offered to clients.">
                  <select
                    id="pf-status"
                    className="input"
                    value={form.status}
                    onChange={(e) => update('status', e.target.value as PlanStatus)}
                  >
                    <option value="active">Active</option>
                    <option value="hidden">Hidden</option>
                  </select>
                </FormField>

                <FormField
                  label="Display order"
                  htmlFor="pf-order"
                  hint="Lower shows first on pricing & checkout."
                >
                  <input
                    id="pf-order"
                    type="number"
                    className="input"
                    value={form.display_order}
                    onChange={(e) => update('display_order', Number(e.target.value))}
                  />
                </FormField>

                <FormField label="Featured" htmlFor="pf-featured" hint="Only one plan can be featured.">
                  <div className="flex h-[38px] items-center gap-2">
                    <Toggle
                      id="pf-featured"
                      checked={form.featured}
                      onChange={(v) => update('featured', v)}
                    />
                    <span className="text-[12px] text-text-muted select-none">
                      {form.featured ? 'Highlighted' : 'Not featured'}
                    </span>
                  </div>
                </FormField>
              </FormGrid>

              <div className="mt-4">
                <FormField
                  label="Feature bullets"
                  htmlFor="pf-bullets"
                  hint="One per line. Shown on pricing and checkout."
                >
                  <textarea
                    id="pf-bullets"
                    className="input"
                    rows={4}
                    style={{ resize: 'vertical' }}
                    placeholder={'Priority delivery\nDedicated sender ID\nEmail + SMS'}
                    value={form.bullets}
                    onChange={(e) => update('bullets', e.target.value)}
                  />
                </FormField>
              </div>

              <FormActions>
                <button
                  type="button"
                  className="btn-outline"
                  disabled={saving}
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={save}
                  className="rounded-full font-display font-bold text-[13px] px-4 py-2 transition hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{ background: '#00D4AA', color: '#0D0F2E' }}
                >
                  {saving ? 'Saving…' : editing === 'new' ? 'Create plan' : 'Save changes'}
                </button>
              </FormActions>
            </FormCard>
          </div>
        </div>
      )}
    </>
  );
}
