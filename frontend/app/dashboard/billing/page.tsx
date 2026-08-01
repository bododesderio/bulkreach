/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, CreditCard, Download, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, apiDownload } from '@/lib/api';
import { useApiQuery, useApiMutation } from '@/lib/hooks';
import { useAuth } from '@/store/auth';
import { Reveal, RevealGroup, RevealItem } from '@/components/admin/Reveal';
import DataTable, { Column } from '@/components/admin/DataTable';
import { StatusPill } from '@/components/admin/StatusPill';
import { StatusBadge } from '@/components/ui';

const cardBase = 'bg-white border rounded-[11px] p-4';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Plan {
  id: string;
  name: string;
  price_ugx: number;
  messages_per_month: number;
  batch_size: number;
  features: Record<string, unknown>;
  period: string;
  featured: boolean;
}

type PayStatus = 'created' | 'pending' | 'successful' | 'failed' | 'timeout';

interface PaymentOut {
  id: string;
  tx_ref: string;
  amount_ugx: number;
  currency: string;
  method: string;
  status: PayStatus;
  provider: string;
  purpose: string;
  created_at: string;
}

interface InvoiceOut {
  id: string;
  number: string;
  kind: string;
  status: string;
  currency: string;
  subtotal_ugx: number;
  vat_rate: number;
  vat_ugx: number;
  total_ugx: number;
  proration_credit_ugx: number;
  plan_name: string | null;
  issued_at: string;
}

interface SubscriptionState {
  status: string; // none|active|past_due|cancelled
  plan: string;
  auto_renew: boolean;
  current_period_end: string | null;
  dunning_stage: number;
  grace_until: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const { account } = useAuth();
  const router = useRouter();

  const [downloading, setDownloading] = useState<string | null>(null);

  const { data, isLoading } = useApiQuery(
    ['dashboard', 'billing'],
    async () => {
      const [plans, history, invoices, subscription] = await Promise.all([
        api<Plan[]>('/payments/plans', { auth: true }).catch(() => [] as Plan[]),
        api<PaymentOut[]>('/payments/history', { auth: true }).catch(
          () => [] as PaymentOut[],
        ),
        api<InvoiceOut[]>('/billing/invoices', { auth: true }).catch(
          () => [] as InvoiceOut[],
        ),
        api<SubscriptionState>('/billing/subscription', { auth: true }).catch(
          () => null as SubscriptionState | null,
        ),
      ]);
      return { plans, history, invoices, subscription };
    },
  );

  const plans        = data?.plans ?? [];
  const history      = data?.history ?? [];
  const invoices     = data?.invoices ?? [];
  const subscription = data?.subscription ?? null;
  const loadingPlans = isLoading;
  const loadingHistory = isLoading;
  const loadingInvoices = isLoading;

  const autoRenewMut = useApiMutation(
    (next: boolean) =>
      api<SubscriptionState>('/billing/auto-renew', {
        method: 'PATCH',
        auth: true,
        body: JSON.stringify({ auto_renew: next }),
      }),
    {
      invalidate: [['dashboard', 'billing']],
      onSuccess: (_s, next) =>
        toast.success(next ? 'Auto-renewal enabled' : 'Auto-renewal turned off'),
      onError: () => toast.error('Could not update auto-renewal.'),
    },
  );
  const savingRenew = autoRenewMut.isPending;

  async function downloadInvoice(inv: InvoiceOut) {
    setDownloading(inv.id);
    try {
      await apiDownload(`/billing/invoices/${inv.id}/pdf`, `${inv.number}.pdf`);
    } catch {
      toast.error('Could not download the invoice. Please try again.');
    } finally {
      setDownloading(null);
    }
  }

  function toggleAutoRenew(next: boolean) {
    autoRenewMut.mutate(next);
  }

  const currentPlanName = account?.plan ?? '';

  // ── Table column definitions ───────────────────────────────────────────────

  const invoiceColumns: Column<InvoiceOut>[] = [
    {
      key: 'number',
      label: 'Invoice',
      render: (inv) => (
        <span className="font-mono text-navy whitespace-nowrap">{inv.number}</span>
      ),
    },
    {
      key: 'issued_at',
      label: 'Date',
      render: (inv) => (
        <span className="text-text-muted whitespace-nowrap">{fmtDate(inv.issued_at)}</span>
      ),
    },
    {
      key: 'plan_name',
      label: 'Plan',
      render: (inv) => (
        <span className="capitalize text-text-muted">{inv.plan_name ?? '—'}</span>
      ),
    },
    {
      key: 'vat_ugx',
      label: 'VAT (UGX)',
      render: (inv) => (
        <span className="font-mono text-text-muted whitespace-nowrap">
          {inv.vat_ugx.toLocaleString()}
        </span>
      ),
    },
    {
      key: 'total_ugx',
      label: 'Total (UGX)',
      render: (inv) => (
        <span className="font-mono font-semibold text-navy whitespace-nowrap">
          {inv.total_ugx.toLocaleString()}
        </span>
      ),
    },
    {
      key: 'inv_status',
      label: 'Status',
      render: (inv) => <StatusBadge domain="invoice" status={inv.status} />,
    },
    {
      key: 'download',
      label: '',
      align: 'right',
      render: (inv) => (
        <button
          type="button"
          onClick={() => downloadInvoice(inv)}
          disabled={downloading === inv.id}
          className="inline-flex items-center gap-1 text-[11px] rounded-[5px] border font-semibold px-2 py-1 disabled:opacity-50"
          style={{ color: '#00D4AA', borderColor: 'rgba(0,212,170,0.35)' }}
          aria-label={`Download invoice ${inv.number}`}
        >
          {downloading === inv.id ? (
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          ) : (
            <Download className="h-3 w-3" aria-hidden />
          )}
          PDF
        </button>
      ),
    },
  ];

  const historyColumns: Column<PaymentOut>[] = [
    {
      key: 'created_at',
      label: 'Date',
      render: (p) => (
        <span className="text-text-muted whitespace-nowrap">{fmtDate(p.created_at)}</span>
      ),
    },
    {
      key: 'amount_ugx',
      label: 'Amount (UGX)',
      render: (p) => (
        <span className="font-mono font-semibold text-navy whitespace-nowrap">
          {p.amount_ugx.toLocaleString()}
        </span>
      ),
    },
    {
      key: 'method',
      label: 'Method',
      render: (p) => (
        <span className="capitalize text-text-muted">{p.method.replace(/_/g, ' ')}</span>
      ),
    },
    {
      key: 'provider',
      label: 'Provider',
      render: (p) => <span className="text-text-muted">{p.provider}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      align: 'right',
      render: (p) => <StatusBadge domain="payment" status={p.status} />,
    },
  ];

  return (
    <div className="space-y-[18px]">

      {/* ── Page heading ──────────────────────────────────────────────────── */}
      <Reveal>
        <h2 className="font-display text-[20px] font-extrabold text-navy">Billing</h2>
        <p className="mt-0.5 text-[12px] text-text-muted">
          Manage your subscription plan and view payment history.
        </p>
      </Reveal>

      {/* ── Past-due / dunning alert ──────────────────────────────────────── */}
      {subscription?.status === 'past_due' && (
        <Reveal>
          <div
            className="flex items-start gap-3 rounded-[11px] border p-4"
            style={{ borderColor: 'rgba(245,158,11,0.35)', background: 'rgba(245,158,11,0.08)' }}
            role="alert"
          >
            <AlertTriangle
              className="mt-0.5 h-4 w-4 flex-shrink-0"
              style={{ color: '#B45309' }}
              aria-hidden
            />
            <div style={{ color: '#92400E' }}>
              <p className="text-[12px] font-semibold">Your subscription payment is overdue.</p>
              <p className="mt-0.5 text-[11.5px]">
                Renew now to keep your account active
                {subscription.grace_until
                  ? ` — access is suspended after ${fmtDate(subscription.grace_until)}.`
                  : '.'}
              </p>
            </div>
          </div>
        </Reveal>
      )}

      {/* ── Current plan card ─────────────────────────────────────────────── */}
      {account && (
        <Reveal delay={0.05}>
          <div className={cardBase}>
            <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-text-muted">
              Current plan
            </span>
            <div className="mt-2 flex flex-wrap items-center gap-2.5">
              <span className="font-mono text-[26px] font-semibold capitalize leading-tight text-navy">
                {account.plan}
              </span>
              <StatusPill
                label={account.status}
                color={account.status === 'active' ? '#10B981' : '#F59E0B'}
                pulse={account.status === 'active'}
              />
            </div>
            {account.trial_messages_remaining > 0 && (
              <p className="mt-1.5 text-[11.5px] text-text-muted">
                <span className="font-mono font-semibold text-navy">
                  {account.trial_messages_remaining.toLocaleString()}
                </span>{' '}
                trial messages remaining
              </p>
            )}

            {/* Auto-renewal toggle (only for a real subscription) */}
            {subscription && subscription.status !== 'none' && (
              <div
                className="mt-4 flex items-center justify-between border-t pt-4"
                style={{ borderColor: 'var(--border)' }}
              >
                <div>
                  <div className="text-[12px] font-semibold text-navy">Auto-renewal</div>
                  <div className="text-[11px] text-text-muted">
                    {subscription.current_period_end
                      ? `Renews on ${fmtDate(subscription.current_period_end)}`
                      : 'Renew your plan automatically each period'}
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={subscription.auto_renew}
                  aria-label="Toggle auto-renewal"
                  disabled={savingRenew}
                  onClick={() => toggleAutoRenew(!subscription.auto_renew)}
                  className="relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50"
                  style={{ background: subscription.auto_renew ? '#00D4AA' : '#CBD5E1' }}
                >
                  <span
                    className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                    style={{
                      transform: subscription.auto_renew ? 'translateX(24px)' : 'translateX(4px)',
                    }}
                  />
                </button>
              </div>
            )}
          </div>
        </Reveal>
      )}

      {/* ── Available plans ───────────────────────────────────────────────── */}
      <Reveal delay={0.1}>
        <div>
          <h3 className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.06em] text-text-muted">
            Available plans
          </h3>

          {loadingPlans ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-44 animate-pulse rounded-[11px] border bg-bg" />
              ))}
            </div>
          ) : plans.length === 0 ? (
            <p className="text-[12px] text-text-muted">No plans available.</p>
          ) : (
            <RevealGroup className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" stagger={0.06}>
              {plans.map((plan) => {
                const isCurrent =
                  currentPlanName.toLowerCase() === plan.name.toLowerCase();
                return (
                  <RevealItem key={plan.id} lift>
                    <div
                      className={`${cardBase} flex flex-col h-full`}
                      style={
                        isCurrent
                          ? { borderColor: '#00D4AA', borderWidth: '2px' }
                          : undefined
                      }
                    >
                      {isCurrent && (
                        <div className="mb-2">
                          <StatusPill
                            label="CURRENT"
                            color="#00897a"
                            bg="rgba(0,212,170,0.1)"
                            dot={false}
                          />
                        </div>
                      )}
                      <div className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-text-muted">
                        {plan.name}
                      </div>
                      <div className="mt-2 font-mono text-[22px] font-semibold text-navy leading-tight">
                        UGX {plan.price_ugx.toLocaleString()}
                        <span className="text-[13px] font-normal text-text-muted"> /mo</span>
                      </div>
                      <ul className="mt-3 space-y-1.5 flex-1">
                        <li className="flex items-center gap-1.5">
                          <CheckCircle2
                            className="h-3.5 w-3.5 flex-shrink-0"
                            style={{ color: '#00D4AA' }}
                            aria-hidden
                          />
                          <span className="text-[12px] text-text-muted">
                            {plan.messages_per_month < 0 ? (
                              'Unlimited messages'
                            ) : (
                              <>
                                <span className="font-mono">
                                  {plan.messages_per_month.toLocaleString()}
                                </span>{' '}
                                messages / month
                              </>
                            )}
                          </span>
                        </li>
                        <li className="flex items-center gap-1.5">
                          <CheckCircle2
                            className="h-3.5 w-3.5 flex-shrink-0"
                            style={{ color: '#00D4AA' }}
                            aria-hidden
                          />
                          <span className="text-[12px] text-text-muted">
                            Batch size:{' '}
                            <span className="font-mono">{plan.batch_size.toLocaleString()}</span>
                          </span>
                        </li>
                      </ul>
                      <button
                        type="button"
                        disabled={isCurrent}
                        onClick={() =>
                          router.push(`/dashboard/billing/checkout?plan=${plan.id}`)
                        }
                        className="btn-primary mt-5 w-full disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isCurrent ? 'Current plan' : 'Choose plan'}
                      </button>
                    </div>
                  </RevealItem>
                );
              })}
            </RevealGroup>
          )}
        </div>
      </Reveal>

      {/* ── Invoices & receipts ───────────────────────────────────────────── */}
      <Reveal delay={0.15}>
        <div className={cardBase}>
          <div className="mb-3 font-display text-[14px] font-bold text-navy">
            Invoices &amp; receipts
          </div>

          {loadingInvoices ? (
            <div className="space-y-3 py-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-bg" />
              ))}
            </div>
          ) : invoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ background: 'var(--bg)', color: 'var(--navy)' }}
              >
                <FileText className="h-5 w-5" aria-hidden />
              </div>
              <p className="mt-3 text-[12px] text-text-muted">
                No invoices yet. They appear here after your first payment.
              </p>
            </div>
          ) : (
            <DataTable<InvoiceOut>
              columns={invoiceColumns}
              rows={invoices}
              rowKey={(inv) => inv.id}
            />
          )}
        </div>
      </Reveal>

      {/* ── Payment history ───────────────────────────────────────────────── */}
      <Reveal delay={0.2}>
        <div className={cardBase}>
          <div className="mb-3 font-display text-[14px] font-bold text-navy">
            Payment history
          </div>

          {loadingHistory ? (
            <div className="space-y-3 py-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-bg" />
              ))}
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ background: 'var(--bg)', color: 'var(--navy)' }}
              >
                <CreditCard className="h-5 w-5" aria-hidden />
              </div>
              <p className="mt-3 text-[12px] text-text-muted">No payments yet.</p>
            </div>
          ) : (
            <DataTable<PaymentOut>
              columns={historyColumns}
              rows={history}
              rowKey={(p) => p.id}
            />
          )}
        </div>
      </Reveal>

    </div>
  );
}
