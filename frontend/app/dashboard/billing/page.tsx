'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, CreditCard, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
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
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);

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
    return () => {
      active = false;
    };
  }, []);

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
