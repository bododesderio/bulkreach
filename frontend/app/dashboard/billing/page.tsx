'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, CreditCard, Loader2, Phone, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/store/auth';

// ── types ─────────────────────────────────────────────────────────────────────

interface Plan {
  id: string;
  name: string;
  price_ugx: number;
  messages_per_month: number;
  batch_size: number;
  features: Record<string, unknown>;
}

interface PaymentMethod {
  method: 'mtn_momo' | 'airtel_money' | 'card';
  provider: string;
  provider_name: string;
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

// ── constants ─────────────────────────────────────────────────────────────────

const TERMINAL: PayStatus[] = ['successful', 'failed', 'timeout'];
const MAX_POLL_ATTEMPTS = 24;
const POLL_INTERVAL_MS = 4000;

// ── helpers ───────────────────────────────────────────────────────────────────

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

function MethodLogo({ method }: { method: string }) {
  if (method === 'card') {
    return (
      <div className="flex items-center gap-1" aria-label="Visa and Mastercard">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/payments/visa.svg" alt="Visa" style={{ height: '20px', objectFit: 'contain' }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/payments/mastercard.svg" alt="Mastercard" style={{ height: '20px', objectFit: 'contain' }} />
      </div>
    );
  }
  const slug = method === 'mtn_momo' ? 'mtn_momo' : 'airtel';
  const label = method === 'mtn_momo' ? 'MTN MoMo' : 'Airtel Money';
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/logos/payments/${slug}.svg`}
      alt={label}
      style={{ height: '24px', objectFit: 'contain', maxWidth: '70px' }}
    />
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const { account } = useAuth();

  // Plans + history
  const [plans, setPlans] = useState<Plan[]>([]);
  const [history, setHistory] = useState<PaymentOut[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Upgrade panel
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [methods, setMethods] = useState<PaymentMethod[] | null>(null);
  const [loadingMethods, setLoadingMethods] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<string>('');
  const [phone, setPhone] = useState('');
  const [paying, setPaying] = useState(false);

  // USSD polling
  const [pollState, setPollState] = useState<'idle' | 'pending' | 'successful' | 'failed'>('idle');
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── load initial data ─────────────────────────────────────────────────────

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
    return () => { active = false; };
  }, []);

  // ── upgrade panel logic ────────────────────────────────────────────────────

  async function openUpgrade(plan: Plan) {
    setSelectedPlan(plan);
    setSelectedMethod('');
    setPhone('');
    setPollState('idle');
    setMethods(null);
    setLoadingMethods(true);
    try {
      const m = await api<PaymentMethod[]>('/payments/methods', { auth: true });
      setMethods(m);
      if (m.length > 0) setSelectedMethod(m[0].method);
    } catch {
      setMethods([]);
    } finally {
      setLoadingMethods(false);
    }
  }

  function closePanel() {
    if (pollRef.current) clearTimeout(pollRef.current);
    setSelectedPlan(null);
    setPollState('idle');
  }

  function startPoll(txRef: string, attempt: number) {
    if (attempt >= MAX_POLL_ATTEMPTS) {
      setPollState('failed');
      return;
    }
    pollRef.current = setTimeout(async () => {
      try {
        const result = await api<PaymentOut>(`/payments/${txRef}/verify`, { auth: true });
        if (TERMINAL.includes(result.status)) {
          setPollState(result.status === 'successful' ? 'successful' : 'failed');
          if (result.status === 'successful') {
            // Refresh history on success
            api<PaymentOut[]>('/payments/history', { auth: true })
              .then(setHistory)
              .catch(() => {});
          }
        } else {
          startPoll(txRef, attempt + 1);
        }
      } catch {
        startPoll(txRef, attempt + 1);
      }
    }, POLL_INTERVAL_MS);
  }

  async function handlePay() {
    if (!selectedPlan) return;
    setPaying(true);
    try {
      const needsPhone = selectedMethod === 'mtn_momo' || selectedMethod === 'airtel_money';
      const body: Record<string, unknown> = {
        plan_id: selectedPlan.id,
        method: selectedMethod,
        purpose: 'subscription',
      };
      if (needsPhone && phone) body.phone = phone;

      const checkout = await api<{
        payment_id: string;
        tx_ref: string;
        status: string;
        redirect_url?: string | null;
      }>('/payments/checkout', {
        method: 'POST',
        auth: true,
        body: JSON.stringify(body),
      });

      if (checkout.redirect_url) {
        window.location.href = checkout.redirect_url;
        return;
      }

      // USSD push — show prompt and start polling
      setPollState('pending');
      startPoll(checkout.tx_ref, 0);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Payment failed. Please try again.');
    } finally {
      setPaying(false);
    }
  }

  // ── derived values ─────────────────────────────────────────────────────────

  const currentPlanName = account?.plan ?? '';
  const needsPhone = selectedMethod === 'mtn_momo' || selectedMethod === 'airtel_money';
  const canPay =
    !paying &&
    selectedMethod !== '' &&
    methods !== null &&
    methods.length > 0 &&
    (!needsPhone || phone.trim() !== '');

  // ── render ─────────────────────────────────────────────────────────────────

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
              <div
                key={i}
                className="h-44 animate-pulse rounded-xl border bg-card"
              />
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
                        <span className="font-mono">
                          {plan.messages_per_month.toLocaleString()}
                        </span>{' '}
                        messages / month
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
                    onClick={() => openUpgrade(plan)}
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
                  <tr key={p.id} className="border-b last:border-0 hover:bg-accent/40 transition-colors">
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

      {/* ── Upgrade panel (modal) ────────────────────────────────────────────── */}
      {selectedPlan && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: 'rgba(13,15,46,0.55)' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="upgrade-dialog-title"
        >
          <div className="w-full max-w-md rounded-[12px] bg-white p-6 shadow-2xl animate-fade-up">

            {/* USSD poll / result state */}
            {pollState !== 'idle' ? (
              <div className="flex flex-col items-center py-6 text-center">
                {pollState === 'pending' && (
                  <>
                    <Loader2
                      className="h-10 w-10 animate-spin"
                      style={{ color: '#00D4AA' }}
                      aria-hidden="true"
                    />
                    <h3 className="mt-4 text-lg font-semibold text-navy">
                      Waiting for approval
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground max-w-xs">
                      Check your phone for the mobile-money prompt and approve the
                      payment.
                    </p>
                  </>
                )}

                {pollState === 'successful' && (
                  <>
                    <CheckCircle2
                      className="h-10 w-10"
                      style={{ color: '#10B981' }}
                      aria-hidden="true"
                    />
                    <h3 className="mt-4 text-lg font-semibold text-navy">
                      Payment successful
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Your plan is now active.
                    </p>
                    <button
                      type="button"
                      onClick={closePanel}
                      className="btn-primary mt-6"
                    >
                      Done
                    </button>
                  </>
                )}

                {pollState === 'failed' && (
                  <>
                    <XCircle
                      className="h-10 w-10"
                      style={{ color: '#EF4444' }}
                      aria-hidden="true"
                    />
                    <h3 className="mt-4 text-lg font-semibold text-navy">
                      Payment not completed
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      The payment was declined or timed out. Please try again.
                    </p>
                    <button
                      type="button"
                      onClick={closePanel}
                      className="btn-outline mt-6"
                    >
                      Back to billing
                    </button>
                  </>
                )}
              </div>
            ) : (
              /* Payment selection UI */
              <>
                {/* Header */}
                <div className="flex items-start justify-between mb-5">
                  <div>
                    <h3
                      id="upgrade-dialog-title"
                      className="font-display font-bold text-[17px] text-navy leading-tight"
                    >
                      Upgrade to {selectedPlan.name}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      UGX{' '}
                      <span className="font-mono font-semibold">
                        {selectedPlan.price_ugx.toLocaleString()}
                      </span>{' '}
                      / month
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closePanel}
                    className="text-muted-foreground hover:text-foreground text-2xl leading-none -mt-1 ml-3"
                    aria-label="Close"
                  >
                    &times;
                  </button>
                </div>

                {/* Loading methods */}
                {loadingMethods && (
                  <div className="flex justify-center py-8">
                    <Loader2
                      className="h-6 w-6 animate-spin"
                      style={{ color: '#00D4AA' }}
                      aria-label="Loading payment methods"
                    />
                  </div>
                )}

                {/* No methods available */}
                {!loadingMethods && methods !== null && methods.length === 0 && (
                  <div
                    className="rounded-lg p-4 text-sm"
                    style={{
                      background: 'rgba(245,158,11,0.08)',
                      border: '1px solid rgba(245,158,11,0.25)',
                      color: '#92400E',
                    }}
                    role="alert"
                  >
                    No payment methods are enabled yet. Ask an admin to configure a
                    provider.
                  </div>
                )}

                {/* Method tiles + pay button */}
                {!loadingMethods && methods && methods.length > 0 && (
                  <>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                      Payment method
                    </p>
                    <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 mb-4">
                      {methods.map((m) => (
                        <button
                          key={m.method}
                          type="button"
                          onClick={() => {
                            setSelectedMethod(m.method);
                            setPhone('');
                          }}
                          className="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00D4AA]"
                          style={{
                            borderColor:
                              selectedMethod === m.method ? '#00D4AA' : undefined,
                            background:
                              selectedMethod === m.method
                                ? 'rgba(0,212,170,0.06)'
                                : undefined,
                          }}
                          aria-pressed={selectedMethod === m.method}
                        >
                          <MethodLogo method={m.method} />
                          <span className="text-sm font-medium text-navy">
                            {m.provider_name}
                          </span>
                        </button>
                      ))}
                    </div>

                    {/* Phone input for mobile money */}
                    {needsPhone && (
                      <div className="mb-4">
                        <label
                          htmlFor="billing-phone"
                          className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted mb-1.5"
                        >
                          Mobile number
                        </label>
                        <div className="relative">
                          <Phone
                            size={14}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                            aria-hidden="true"
                          />
                          <input
                            id="billing-phone"
                            type="tel"
                            className="input pl-9"
                            placeholder="+256 7XX XXX XXX"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            autoComplete="tel"
                          />
                        </div>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handlePay}
                      disabled={!canPay}
                      className="btn-primary w-full disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {paying ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                          Processing…
                        </>
                      ) : (
                        `Pay UGX ${selectedPlan.price_ugx.toLocaleString()}`
                      )}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
