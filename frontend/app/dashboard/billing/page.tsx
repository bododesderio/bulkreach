'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, CreditCard, Download, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, apiDownload } from '@/lib/api';
import { useAuth } from '@/store/auth';

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

function StatusBadge({ status }: { status: PayStatus }) {
  const cfg: Record<PayStatus, { bg: string; color: string; label: string }> = {
    successful: { bg: 'rgba(16,185,129,0.1)', color: '#10B981', label: 'Successful' },
    pending: { bg: 'rgba(245,158,11,0.1)', color: '#F59E0B', label: 'Pending' },
    created: { bg: 'rgba(245,158,11,0.1)', color: '#F59E0B', label: 'Processing' },
    failed: { bg: 'rgba(239,68,68,0.1)', color: '#EF4444', label: 'Failed' },
    timeout: { bg: 'rgba(239,68,68,0.1)', color: '#EF4444', label: 'Timeout' },
  };
  const s = cfg[status] ?? { bg: 'rgba(0,0,0,0.06)', color: '#6B7280', label: status };
  return (
    <span
      className="inline-flex items-center rounded-full font-semibold"
      style={{ background: s.bg, color: s.color, padding: '2px 10px', fontSize: '11px' }}
    >
      {s.label}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const { account } = useAuth();
  const router = useRouter();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [history, setHistory] = useState<PaymentOut[]>([]);
  const [invoices, setInvoices] = useState<InvoiceOut[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionState | null>(null);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [savingRenew, setSavingRenew] = useState(false);

  useEffect(() => {
    let active = true;
    api<Plan[]>('/payments/plans', { auth: true })
      .then((d) => active && setPlans(d))
      .catch(() => {})
      .finally(() => active && setLoadingPlans(false));
    api<PaymentOut[]>('/payments/history', { auth: true })
      .then((d) => active && setHistory(d))
      .catch(() => {})
      .finally(() => active && setLoadingHistory(false));
    api<InvoiceOut[]>('/billing/invoices', { auth: true })
      .then((d) => active && setInvoices(d))
      .catch(() => {})
      .finally(() => active && setLoadingInvoices(false));
    api<SubscriptionState>('/billing/subscription', { auth: true })
      .then((d) => active && setSubscription(d))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

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

  async function toggleAutoRenew(next: boolean) {
    setSavingRenew(true);
    try {
      const s = await api<SubscriptionState>('/billing/auto-renew', {
        method: 'PATCH',
        auth: true,
        body: JSON.stringify({ auto_renew: next }),
      });
      setSubscription(s);
      toast.success(next ? 'Auto-renewal enabled' : 'Auto-renewal turned off');
    } catch {
      toast.error('Could not update auto-renewal.');
    } finally {
      setSavingRenew(false);
    }
  }

  const currentPlanName = account?.plan ?? '';

  return (
    <div>
      {/* Page header */}
      <div>
        <h2 className="text-2xl font-bold">Billing</h2>
        <p className="mt-1 text-muted-foreground">
          Manage your subscription plan and view payment history.
        </p>
      </div>

      {/* Past-due / dunning banner */}
      {subscription?.status === 'past_due' && (
        <div
          className="mt-6 flex items-start gap-3 rounded-xl border p-4 animate-fade-up"
          style={{ borderColor: 'rgba(245,158,11,0.35)', background: 'rgba(245,158,11,0.08)' }}
          role="alert"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" style={{ color: '#B45309' }} />
          <div className="text-sm" style={{ color: '#92400E' }}>
            <p className="font-semibold">Your subscription payment is overdue.</p>
            <p className="mt-0.5">
              Renew now to keep your account active
              {subscription.grace_until
                ? ` — access is suspended after ${fmtDate(subscription.grace_until)}.`
                : '.'}
            </p>
          </div>
        </div>
      )}

      {/* Current plan */}
      {account && (
        <div className="mt-6 rounded-xl border bg-card p-5 animate-fade-up">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">
            Current plan
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-2xl font-bold capitalize">{account.plan}</span>
            <span
              className="rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize"
              style={{
                background:
                  account.status === 'active'
                    ? 'rgba(16,185,129,0.1)'
                    : 'rgba(245,158,11,0.1)',
                color: account.status === 'active' ? '#10B981' : '#F59E0B',
              }}
            >
              {account.status}
            </span>
          </div>
          {account.trial_messages_remaining > 0 && (
            <p className="mt-1.5 text-sm text-muted-foreground">
              <span className="font-mono font-semibold">
                {account.trial_messages_remaining.toLocaleString()}
              </span>{' '}
              trial messages remaining
            </p>
          )}
          {/* Auto-renewal toggle (only for a real subscription) */}
          {subscription && subscription.status !== 'none' && (
            <div className="mt-4 flex items-center justify-between border-t pt-4">
              <div>
                <div className="text-sm font-medium">Auto-renewal</div>
                <div className="text-xs text-muted-foreground">
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
                  style={{ transform: subscription.auto_renew ? 'translateX(24px)' : 'translateX(4px)' }}
                />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Plan cards */}
      <div className="mt-8">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Available plans
        </h3>

        {loadingPlans ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-44 animate-pulse rounded-xl border bg-card" />
            ))}
          </div>
        ) : plans.length === 0 ? (
          <p className="text-sm text-muted-foreground">No plans available.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan, i) => {
              const isCurrent =
                currentPlanName.toLowerCase() === plan.name.toLowerCase();
              return (
                <div
                  key={plan.id}
                  className="rounded-xl border bg-card p-5 flex flex-col animate-fade-up"
                  style={{
                    animationDelay: `${i * 0.05}s`,
                    borderColor: isCurrent ? '#00D4AA' : undefined,
                    borderWidth: isCurrent ? '2px' : undefined,
                  }}
                >
                  {isCurrent && (
                    <span
                      className="self-start rounded-full font-semibold mb-2"
                      style={{
                        background: 'rgba(0,212,170,0.1)',
                        color: '#00897a',
                        padding: '2px 10px',
                        fontSize: '10px',
                      }}
                    >
                      CURRENT
                    </span>
                  )}
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {plan.name}
                  </div>
                  <div className="mt-2 font-mono text-2xl font-bold">
                    UGX {plan.price_ugx.toLocaleString()}
                    <span className="text-sm font-normal text-muted-foreground"> /mo</span>
                  </div>
                  <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground flex-1">
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                      <span>
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
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                      <span>
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
              );
            })}
          </div>
        )}
      </div>

      {/* Invoices & receipts */}
      <div className="mt-10">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Invoices &amp; receipts
        </h3>

        {loadingInvoices ? (
          <div className="h-24 animate-pulse rounded-xl border bg-card" />
        ) : invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border bg-card p-10 text-center animate-fade-up">
            <FileText className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 text-sm text-muted-foreground">
              No invoices yet. They appear here after your first payment.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto overflow-hidden rounded-xl border bg-card animate-fade-up">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  {['Invoice', 'Date', 'Plan', 'VAT (UGX)', 'Total (UGX)', ''].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-b last:border-0 hover:bg-accent/40 transition-colors">
                    <td className="px-5 py-3.5 font-mono text-xs whitespace-nowrap">{inv.number}</td>
                    <td className="px-5 py-3.5 text-muted-foreground text-xs whitespace-nowrap">
                      {fmtDate(inv.issued_at)}
                    </td>
                    <td className="px-5 py-3.5 capitalize text-muted-foreground">
                      {inv.plan_name ?? '—'}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-muted-foreground whitespace-nowrap">
                      {inv.vat_ugx.toLocaleString()}
                    </td>
                    <td className="px-5 py-3.5 font-mono font-semibold whitespace-nowrap">
                      {inv.total_ugx.toLocaleString()}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => downloadInvoice(inv)}
                        disabled={downloading === inv.id}
                        className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
                        aria-label={`Download invoice ${inv.number}`}
                      >
                        {downloading === inv.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Download className="h-3.5 w-3.5" />
                        )}
                        PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payment history */}
      <div className="mt-10">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Payment history
        </h3>

        {loadingHistory ? (
          <div className="h-24 animate-pulse rounded-xl border bg-card" />
        ) : history.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border bg-card p-10 text-center animate-fade-up">
            <CreditCard className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 text-sm text-muted-foreground">No payments yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto overflow-hidden rounded-xl border bg-card animate-fade-up">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  {['Date', 'Amount (UGX)', 'Method', 'Provider', 'Status'].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b last:border-0 hover:bg-accent/40 transition-colors"
                  >
                    <td className="px-5 py-3.5 text-muted-foreground text-xs whitespace-nowrap">
                      {fmtDate(p.created_at)}
                    </td>
                    <td className="px-5 py-3.5 font-mono font-semibold whitespace-nowrap">
                      {p.amount_ugx.toLocaleString()}
                    </td>
                    <td className="px-5 py-3.5 capitalize text-muted-foreground">
                      {p.method.replace(/_/g, ' ')}
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground">{p.provider}</td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={p.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
