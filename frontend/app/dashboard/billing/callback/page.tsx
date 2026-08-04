/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { api } from '@/lib/api';

// ── types ─────────────────────────────────────────────────────────────────────

type PayStatus = 'created' | 'pending' | 'successful' | 'failed' | 'timeout';

interface PaymentOut {
  id: string;
  tx_ref: string;
  status: PayStatus;
}

const TERMINAL: PayStatus[] = ['successful', 'failed', 'timeout'];
const MAX_ATTEMPTS = 20;
const POLL_INTERVAL_MS = 3000;

// ── inner component (uses useSearchParams — must be inside <Suspense>) ────────

function CallbackInner() {
  const params = useSearchParams();
  const txRef = params.get('tx_ref') ?? '';

  const [status, setStatus] = useState<PayStatus | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;

    if (!txRef) {
      setStatus('failed');
      return;
    }

    function poll(attempt: number) {
      if (!activeRef.current) return;
      if (attempt >= MAX_ATTEMPTS) {
        setStatus('timeout');
        return;
      }
      pollRef.current = setTimeout(async () => {
        if (!activeRef.current) return;
        try {
          const result = await api<PaymentOut>(`/payments/${txRef}/verify`, {
            auth: true,
          });
          if (!activeRef.current) return;
          if (TERMINAL.includes(result.status)) {
            setStatus(result.status);
          } else {
            poll(attempt + 1);
          }
        } catch {
          if (activeRef.current) poll(attempt + 1);
        }
      }, POLL_INTERVAL_MS);
    }

    poll(0);

    return () => {
      activeRef.current = false;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [txRef]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="bg-surface border rounded-[11px] p-8 w-full max-w-sm text-center animate-fade-up">
        {/* Verifying */}
        {!status && (
          <>
            <Loader2
              className="mx-auto h-10 w-10 animate-spin"
              style={{ color: '#00D4AA' }}
              aria-label="Verifying payment"
            />
            <h2 className="mt-4 font-display text-[20px] font-extrabold text-fg">
              Verifying payment&hellip;
            </h2>
            <p className="mt-2 text-[12px] text-fg-muted">
              Please wait while we confirm your transaction.
            </p>
          </>
        )}

        {/* Success */}
        {status === 'successful' && (
          <>
            <CheckCircle2
              className="mx-auto h-10 w-10"
              style={{ color: '#10B981' }}
              aria-hidden="true"
            />
            <h2 className="mt-4 font-display text-[20px] font-extrabold text-fg">
              Payment successful
            </h2>
            <p className="mt-2 text-[12px] text-fg-muted">
              Your plan is now active.
            </p>
            <Link href="/dashboard/billing" className="btn-primary mt-6 inline-flex">
              Back to billing
            </Link>
          </>
        )}

        {/* Failure */}
        {(status === 'failed' || status === 'timeout') && (
          <>
            <XCircle
              className="mx-auto h-10 w-10"
              style={{ color: '#EF4444' }}
              aria-hidden="true"
            />
            <h2 className="mt-4 font-display text-[20px] font-extrabold text-fg">
              {status === 'timeout' ? 'Payment timed out' : 'Payment failed'}
            </h2>
            <p className="mt-2 text-[12px] text-fg-muted">
              {status === 'timeout'
                ? 'We could not confirm your payment in time. Check your history or contact support.'
                : 'The payment was not completed. Please try again.'}
            </p>
            <Link href="/dashboard/billing" className="btn-primary mt-6 inline-flex">
              Back to billing
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

// ── page (Suspense boundary required for useSearchParams in Next 14) ───────────

export default function CallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2
            className="h-8 w-8 animate-spin"
            style={{ color: '#00D4AA' }}
            aria-label="Loading"
          />
        </div>
      }
    >
      <CallbackInner />
    </Suspense>
  );
}
