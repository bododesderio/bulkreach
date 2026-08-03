/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  Loader2,
  Phone,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { useApiQuery } from '@/lib/hooks';
import { DataState } from '@/components/ui';

// ── Flutterwave global declaration ────────────────────────────────────────────

declare global {
  interface Window {
    FlutterwaveCheckout?: (config: unknown) => void;
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Plan {
  id: string;
  name: string;
  price_ugx: number;
  messages_per_month: number;
  batch_size: number;
  features: { bullets?: string[]; [key: string]: unknown };
  period: string;
  featured: boolean;
}

interface PaymentMethod {
  method: 'mtn_momo' | 'airtel_money' | 'card';
  provider: string;
  provider_name: string;
}

interface InlinePayload {
  provider: 'flutterwave';
  public_key: string;
  tx_ref: string;
  amount: number;
  currency: string;
  email: string;
  name: string;
  phone: string;
}

interface CheckoutResponse {
  payment_id: string;
  tx_ref: string;
  status: string;
  mode: 'simulated' | 'ussd_push' | 'inline' | 'redirect';
  redirect_url?: string | null;
  inline?: InlinePayload | null;
}

interface Proration {
  plan_id: string;
  base_price_ugx: number;
  credit_ugx: number;
  amount_due_ugx: number;
  days_remaining: number;
  applies: boolean;
}

type PayStatus = 'created' | 'pending' | 'successful' | 'failed' | 'timeout';

interface VerifyResponse {
  id: string;
  tx_ref: string;
  status: PayStatus;
}

type CheckoutState = 'form' | 'processing' | 'awaiting_phone' | 'success' | 'failed' | 'timeout';

// ── Constants ─────────────────────────────────────────────────────────────────

const TERMINAL: PayStatus[] = ['successful', 'failed', 'timeout'];
const PHONE_RE = /^\+?\d{9,15}$/;

// ── Helper components ─────────────────────────────────────────────────────────

function MethodLogo({ method }: { method: string }) {
  if (method === 'card') {
    return (
      <div className="flex items-center gap-1" aria-label="Visa and Mastercard">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logos/payments/visa.svg"
          alt="Visa"
          style={{ height: '20px', objectFit: 'contain' }}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logos/payments/mastercard.svg"
          alt="Mastercard"
          style={{ height: '20px', objectFit: 'contain' }}
        />
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
      style={{ height: '24px', objectFit: 'contain', maxWidth: '72px' }}
    />
  );
}

// ── Full-page state panels ────────────────────────────────────────────────────

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="bg-white border rounded-[11px] p-8 w-full max-w-sm text-center animate-fade-up">
        {children}
      </div>
    </div>
  );
}

// ── Inner component (must be wrapped in Suspense for useSearchParams) ─────────

function CheckoutInner() {
  const params = useSearchParams();
  const planId = params.get('plan') ?? '';

  // Data — plans + enabled payment methods, loaded in parallel.
  const { data: loadData, isLoading: loading, refetch } = useApiQuery(
    ['dashboard', 'checkout', planId],
    async () => {
      // Track a plans-fetch failure so a transient outage shows retry instead of
      // the misleading "Plan not found" dead-end.
      const [plansRes, methods] = await Promise.all([
        api<Plan[]>('/payments/plans', { auth: true }).then(
          (v) => ({ ok: true as const, v }),
          () => ({ ok: false as const, v: [] as Plan[] }),
        ),
        api<PaymentMethod[]>('/payments/methods', { auth: true }).catch(
          () => [] as PaymentMethod[],
        ),
      ]);
      return { plans: plansRes.v, plansFailed: !plansRes.ok, methods };
    },
    { enabled: !!planId },
  );
  const plans = loadData?.plans ?? [];
  const plansFailed = loadData?.plansFailed ?? false;
  const methods = loadData?.methods ?? [];

  // Proration: if the account is upgrading mid-cycle, the server credits unused time.
  const { data: proration } = useApiQuery(
    ['dashboard', 'proration', planId],
    () =>
      api<Proration>(`/billing/proration-preview?plan_id=${planId}`, {
        auth: true,
      }).catch(() => null),
    { enabled: !!planId },
  );

  // Form — selection falls back to the first available method until the user picks.
  const [selectedMethodState, setSelectedMethod] = useState<string>('');
  const selectedMethod = selectedMethodState || methods[0]?.method || '';
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Checkout flow
  const [checkoutState, setCheckoutState] = useState<CheckoutState>('form');
  const [activeTxRef, setActiveTxRef] = useState<string>('');
  const [failReason, setFailReason] = useState<string>('');

  // Poll management: generation counter avoids stale callbacks after cancel/remount
  const mountedRef = useRef(true);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollGenRef = useRef(0);

  // Inject Flutterwave script once
  useEffect(() => {
    if (typeof window !== 'undefined' && !window.FlutterwaveCheckout) {
      const script = document.createElement('script');
      script.src = 'https://checkout.flutterwave.com/v3.js';
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  // Track mount so in-flight poll callbacks never setState after unmount.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  const plan = plans.find((p) => p.id === planId) ?? null;

  // ── Poll helper ─────────────────────────────────────────────────────────────

  function startPoll(
    txRef: string,
    intervalMs: number,
    maxAttempts: number,
    attempt: number,
    gen: number,
  ) {
    if (!mountedRef.current || pollGenRef.current !== gen) return;
    if (attempt >= maxAttempts) {
      setCheckoutState('timeout');
      return;
    }
    pollRef.current = setTimeout(async () => {
      if (!mountedRef.current || pollGenRef.current !== gen) return;
      try {
        const result = await api<VerifyResponse>(`/payments/${txRef}/verify`, { auth: true });
        if (!mountedRef.current || pollGenRef.current !== gen) return;
        if (TERMINAL.includes(result.status)) {
          if (result.status === 'successful') setCheckoutState('success');
          else if (result.status === 'timeout') setCheckoutState('timeout');
          else setCheckoutState('failed');
        } else {
          startPoll(txRef, intervalMs, maxAttempts, attempt + 1, gen);
        }
      } catch {
        if (mountedRef.current && pollGenRef.current === gen) {
          startPoll(txRef, intervalMs, maxAttempts, attempt + 1, gen);
        }
      }
    }, intervalMs);
  }

  function cancelPoll() {
    pollGenRef.current += 1;
    if (pollRef.current) clearTimeout(pollRef.current);
  }

  // ── Pay handler ─────────────────────────────────────────────────────────────

  async function handlePay() {
    if (!plan) return;

    // Cancel any stale poll before starting
    pollGenRef.current += 1;
    const gen = pollGenRef.current;
    if (pollRef.current) clearTimeout(pollRef.current);

    setSubmitting(true);
    setFailReason('');

    try {
      const isMobileMoney = selectedMethod === 'mtn_momo' || selectedMethod === 'airtel_money';
      const body: Record<string, unknown> = {
        plan_id: plan.id,
        method: selectedMethod,
        purpose: 'subscription',
      };
      if (isMobileMoney && phone) body.phone = phone;

      const checkout = await api<CheckoutResponse>('/payments/checkout', {
        method: 'POST',
        auth: true,
        body: JSON.stringify(body),
      });

      setActiveTxRef(checkout.tx_ref);

      switch (checkout.mode) {
        case 'simulated':
          setCheckoutState('processing');
          startPoll(checkout.tx_ref, 3000, 20, 0, gen);
          break;

        case 'ussd_push':
          setCheckoutState('awaiting_phone');
          startPoll(checkout.tx_ref, 4000, 24, 0, gen);
          break;

        case 'inline': {
          if (!checkout.inline) {
            toast.error('Missing inline payment data. Please try again.');
            break;
          }
          const { public_key, tx_ref, amount, currency, email, name, phone: custPhone } =
            checkout.inline;

          // Wait up to 5s for the Flutterwave script to be ready
          let waited = 0;
          while (typeof window !== 'undefined' && !window.FlutterwaveCheckout && waited < 5000) {
            await new Promise<void>((r) => setTimeout(r, 200));
            waited += 200;
          }
          if (!window.FlutterwaveCheckout) {
            toast.error('Could not load card checkout. Check your connection and try again.');
            break;
          }

          window.FlutterwaveCheckout({
            public_key,
            tx_ref,
            amount,
            currency,
            payment_options: 'card',
            customer: { email, name, phone_number: custPhone },
            customizations: {
              title: 'BulkReach',
              description: 'Plan upgrade',
            },
            callback: async () => {
              try {
                const result = await api<VerifyResponse>(`/payments/${tx_ref}/verify`, {
                  auth: true,
                });
                if (result.status === 'successful') {
                  setCheckoutState('success');
                } else {
                  setFailReason('Card payment was not confirmed.');
                  setCheckoutState('failed');
                }
              } catch {
                setFailReason('Could not verify card payment. Check your payment history.');
                setCheckoutState('failed');
              }
            },
            onclose: () => {
              // User dismissed the Flutterwave overlay — back to form
              setCheckoutState('form');
            },
          });
          break;
        }

        case 'redirect':
          if (checkout.redirect_url) {
            window.location.href = checkout.redirect_url;
          } else {
            toast.error('Redirect URL missing. Please try again.');
          }
          break;

        default:
          toast.error('Unknown payment mode. Please contact support.');
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Payment failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Derived values ──────────────────────────────────────────────────────────

  const isMobileMoney = selectedMethod === 'mtn_momo' || selectedMethod === 'airtel_money';
  const phoneValid = !isMobileMoney || PHONE_RE.test(phone.replace(/\s/g, ''));
  const canPay = !submitting && selectedMethod !== '' && methods.length > 0 && phoneValid;
  const mobileMethods = methods.filter((m) => m.method === 'mtn_momo' || m.method === 'airtel_money');
  const cardMethods = methods.filter((m) => m.method === 'card');

  // ── State: loading ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2
          className="h-8 w-8 animate-spin"
          style={{ color: '#00D4AA' }}
          aria-label="Loading checkout"
        />
      </div>
    );
  }

  // ── State: plan not found ───────────────────────────────────────────────────

  if (!planId || !plan) {
    return (
      <div className="space-y-[18px]">
        <Link
          href="/dashboard/billing"
          className="inline-flex items-center gap-1.5 text-[12px] text-text-muted hover:text-navy transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Billing
        </Link>
        {plansFailed ? (
          <div className="bg-white border rounded-[11px] p-6">
            <DataState error="Couldn't load plans. Check your connection and retry." onRetry={() => refetch()} />
          </div>
        ) : (
        <div className="bg-white border rounded-[11px] p-12 text-center">
          <h3 className="font-display text-[20px] font-extrabold text-navy">Plan not found</h3>
          <p className="mt-1 text-[12px] text-text-muted">
            The selected plan is unavailable. Go back and choose a plan.
          </p>
          <Link href="/dashboard/billing" className="btn-primary mt-6 inline-flex">
            Back to billing
          </Link>
        </div>
        )}
      </div>
    );
  }

  // ── State: success ──────────────────────────────────────────────────────────

  if (checkoutState === 'success') {
    return (
      <CenteredCard>
        <CheckCircle2
          className="mx-auto h-12 w-12"
          style={{ color: '#10B981' }}
          aria-hidden="true"
        />
        <h2 className="mt-4 font-display text-[20px] font-extrabold text-navy">
          You&apos;re all set!
        </h2>
        <p className="mt-2 text-[12px] text-text-muted">
          Your <strong>{plan.name}</strong> plan is now active.
        </p>
        <Link href="/dashboard" className="btn-primary mt-6 inline-flex">
          Go to dashboard
        </Link>
      </CenteredCard>
    );
  }

  // ── State: failed / timeout ─────────────────────────────────────────────────

  if (checkoutState === 'failed' || checkoutState === 'timeout') {
    const isTimeout = checkoutState === 'timeout';
    return (
      <CenteredCard>
        <XCircle
          className="mx-auto h-12 w-12"
          style={{ color: '#EF4444' }}
          aria-hidden="true"
        />
        <h2 className="mt-4 font-display text-[20px] font-extrabold text-navy">
          {isTimeout ? 'Payment timed out' : 'Payment not completed'}
        </h2>
        <p className="mt-2 text-[12px] text-text-muted">
          {failReason ||
            (isTimeout
              ? 'We could not confirm your payment in time. Check your history or contact support.'
              : 'The payment was declined or not completed.')}
        </p>
        <div className="mt-6 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => {
              setCheckoutState('form');
              setFailReason('');
            }}
            className="btn-primary w-full"
          >
            Try again
          </button>
          {isTimeout && activeTxRef && (
            <button
              type="button"
              onClick={async () => {
                try {
                  const r = await api<VerifyResponse>(`/payments/${activeTxRef}/verify`, {
                    auth: true,
                  });
                  if (r.status === 'successful') {
                    setCheckoutState('success');
                  } else {
                    toast.info(`Payment status: ${r.status}`);
                  }
                } catch {
                  toast.error('Could not check payment status.');
                }
              }}
              className="btn-outline w-full"
            >
              Check status
            </button>
          )}
          <Link href="/dashboard/billing" className="btn-outline w-full text-center">
            Back to billing
          </Link>
        </div>
      </CenteredCard>
    );
  }

  // ── State: processing (simulated mode) ─────────────────────────────────────

  if (checkoutState === 'processing') {
    return (
      <CenteredCard>
        <Loader2
          className="mx-auto h-12 w-12 animate-spin"
          style={{ color: '#00D4AA' }}
          aria-hidden="true"
        />
        <h2 className="mt-4 font-display text-[20px] font-extrabold text-navy">
          Processing payment&hellip;
        </h2>
        <p className="mt-2 text-[12px] text-text-muted">
          Please wait while we process your payment.
        </p>
        <div
          className="mt-5 flex items-center justify-center gap-1.5"
          aria-hidden="true"
        >
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-2 w-2 rounded-full animate-dot-pulse"
              style={{
                background: '#00D4AA',
                animationDelay: `${i * 0.3}s`,
              }}
            />
          ))}
        </div>
      </CenteredCard>
    );
  }

  // ── State: awaiting_phone (USSD push / STK) ─────────────────────────────────

  if (checkoutState === 'awaiting_phone') {
    return (
      <CenteredCard>
        <div
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-full"
          style={{ background: 'rgba(0,212,170,0.12)' }}
          aria-hidden="true"
        >
          <Phone className="h-8 w-8" style={{ color: '#00D4AA' }} />
        </div>
        <h2 className="mt-4 font-display text-[20px] font-extrabold text-navy">
          Check your phone
        </h2>
        <p className="mt-2 text-[12px] text-text-muted">
          We sent a payment request to{' '}
          <span className="font-mono font-semibold text-navy">{phone}</span>. Open
          it and enter your Mobile Money PIN to approve.
        </p>
        <div
          className="mt-5 flex items-center justify-center gap-1.5"
          aria-hidden="true"
        >
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-2 w-2 rounded-full animate-dot-pulse"
              style={{
                background: '#00D4AA',
                animationDelay: `${i * 0.35}s`,
              }}
            />
          ))}
        </div>
        <p className="mt-3 text-[11px] text-text-muted">Waiting for confirmation&hellip;</p>
        <button
          type="button"
          onClick={() => {
            cancelPoll();
            setCheckoutState('form');
          }}
          className="btn-outline mt-6 w-full"
        >
          Cancel
        </button>
      </CenteredCard>
    );
  }

  // ── State: form (default) ───────────────────────────────────────────────────

  const bullets: string[] =
    Array.isArray(plan.features?.bullets) && plan.features.bullets.length > 0
      ? plan.features.bullets
      : [
          plan.messages_per_month < 0
            ? 'Unlimited messages / month'
            : `${plan.messages_per_month.toLocaleString()} messages / month`,
          `Batch size: ${plan.batch_size.toLocaleString()}`,
        ];

  return (
    <div className="space-y-[18px]">
      {/* Back nav */}
      <Link
        href="/dashboard/billing"
        className="inline-flex items-center gap-1.5 text-[12px] text-text-muted hover:text-navy transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Billing
      </Link>

      <h2 className="font-display text-[20px] font-extrabold text-navy">
        Complete your purchase
      </h2>

      <div className="grid grid-cols-1 gap-[18px] md:grid-cols-2">
        {/* ── LEFT: Order summary ──────────────────────────────────────────── */}
        <div className="flex flex-col gap-4 bg-white border rounded-[11px] p-5">
          {/* BulkReach lockup */}
          <div className="flex items-center gap-2">
            <span
              className="font-display text-lg font-bold"
              style={{ color: '#00D4AA' }}
            >
              BulkReach
            </span>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{ background: 'rgba(0,212,170,0.12)', color: '#00897a' }}
            >
              Checkout
            </span>
          </div>

          {/* Plan name + price */}
          <div>
            <div className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-text-muted">
              {plan.name} plan
            </div>
            <div className="mt-1 font-mono text-[26px] font-semibold text-navy">
              UGX {plan.price_ugx.toLocaleString()}
              <span className="text-[12px] font-normal text-text-muted">
                {' '}/ {plan.period || 'month'}
              </span>
            </div>
          </div>

          {/* Proration: credit for unused time on the current plan */}
          {proration?.applies && (
            <div className="rounded-[8px] border p-3 text-[12px]" style={{ borderColor: 'rgba(0,212,170,0.35)', background: 'rgba(0,212,170,0.06)' }}>
              <div className="flex items-center justify-between text-text-muted">
                <span>Plan price</span>
                <span className="font-mono">UGX {proration.base_price_ugx.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between" style={{ color: '#00897a' }}>
                <span>Upgrade credit ({proration.days_remaining}d left)</span>
                <span className="font-mono">− UGX {proration.credit_ugx.toLocaleString()}</span>
              </div>
              <div className="mt-1.5 flex items-center justify-between border-t pt-1.5 font-semibold text-navy">
                <span>Due today</span>
                <span className="font-mono">UGX {proration.amount_due_ugx.toLocaleString()}</span>
              </div>
            </div>
          )}

          {/* Feature bullets */}
          <ul className="space-y-2 text-[12px] text-text-muted">
            {bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-2">
                <CheckCircle2
                  className="mt-0.5 h-4 w-4 flex-shrink-0"
                  style={{ color: '#00D4AA' }}
                  aria-hidden="true"
                />
                <span>{b}</span>
              </li>
            ))}
          </ul>

          {/* Trust line */}
          <div className="mt-auto flex items-center gap-1.5 border-t pt-4 text-[11px] text-text-muted">
            <ShieldCheck className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
            <span>Secured payment&nbsp;&middot;&nbsp;You can cancel anytime.</span>
          </div>
        </div>

        {/* ── RIGHT: Payment card ──────────────────────────────────────────── */}
        <div className="flex flex-col gap-5 bg-white border rounded-[11px] p-5">
          <h3 className="font-display text-[14px] font-bold text-navy">
            Payment method
          </h3>

          {/* No methods */}
          {methods.length === 0 && (
            <div
              className="flex flex-col items-center gap-3 rounded-[8px] p-6 text-center text-[12px]"
              style={{
                background: 'rgba(245,158,11,0.06)',
                border: '1px solid rgba(245,158,11,0.22)',
              }}
              role="alert"
            >
              <CreditCard className="h-6 w-6" style={{ color: '#F59E0B' }} aria-hidden="true" />
              <p style={{ color: '#92400E' }}>
                No payment methods are enabled &mdash; contact support.
              </p>
            </div>
          )}

          {/* Mobile Money group */}
          {mobileMethods.length > 0 && (
            <div>
              <p className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.06em] text-text-muted">
                Mobile Money
              </p>
              <div className="grid gap-2">
                {mobileMethods.map((m) => (
                  <button
                    key={m.method}
                    type="button"
                    onClick={() => {
                      setSelectedMethod(m.method);
                      setPhone('');
                    }}
                    className="flex items-center gap-3 rounded-[8px] border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00D4AA]"
                    style={{
                      borderColor: selectedMethod === m.method ? '#00D4AA' : undefined,
                      background:
                        selectedMethod === m.method ? 'rgba(0,212,170,0.06)' : undefined,
                    }}
                    aria-pressed={selectedMethod === m.method}
                  >
                    <MethodLogo method={m.method} />
                    <span className="text-[13px] font-medium text-navy">
                      {m.provider_name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Card group */}
          {cardMethods.length > 0 && (
            <div>
              <p className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.06em] text-text-muted">
                Card
              </p>
              <div className="grid gap-2">
                {cardMethods.map((m) => (
                  <button
                    key={m.method}
                    type="button"
                    onClick={() => {
                      setSelectedMethod(m.method);
                      setPhone('');
                    }}
                    className="flex items-center gap-3 rounded-[8px] border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00D4AA]"
                    style={{
                      borderColor: selectedMethod === m.method ? '#00D4AA' : undefined,
                      background:
                        selectedMethod === m.method ? 'rgba(0,212,170,0.06)' : undefined,
                    }}
                    aria-pressed={selectedMethod === m.method}
                  >
                    <MethodLogo method={m.method} />
                    <span className="text-[13px] font-medium text-navy">
                      {m.provider_name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Phone input for mobile money methods */}
          {isMobileMoney && (
            <div>
              <label
                htmlFor="checkout-phone"
                className="mb-1.5 block text-[10.5px] font-bold uppercase tracking-[0.06em] text-text-muted"
              >
                Mobile Money number
              </label>
              <div className="relative">
                <Phone
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                  aria-hidden="true"
                />
                <input
                  id="checkout-phone"
                  type="tel"
                  className="input pl-9"
                  placeholder="+256 7XX XXX XXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                  aria-describedby={phone && !phoneValid ? 'phone-error' : undefined}
                />
              </div>
              {phone && !phoneValid && (
                <p
                  id="phone-error"
                  className="mt-1 text-[11px]"
                  style={{ color: '#EF4444' }}
                  role="alert"
                >
                  Enter a valid phone number (9–15 digits, optional +).
                </p>
              )}
            </div>
          )}

          {/* Pay button */}
          {methods.length > 0 && (
            <>
              <button
                type="button"
                onClick={handlePay}
                disabled={!canPay}
                className="btn-primary mt-auto w-full py-3 text-base disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    Processing&hellip;
                  </>
                ) : (
                  `Pay UGX ${(proration?.applies ? proration.amount_due_ugx : plan.price_ugx).toLocaleString()}`
                )}
              </button>
              <p className="text-center text-[11px] text-text-muted">
                By paying you agree to our terms of service.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page export — Suspense required for useSearchParams in Next.js App Router ─

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2
            className="h-8 w-8 animate-spin"
            style={{ color: '#00D4AA' }}
            aria-label="Loading checkout"
          />
        </div>
      }
    >
      <CheckoutInner />
    </Suspense>
  );
}
