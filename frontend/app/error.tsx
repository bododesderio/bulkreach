/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log to error-monitoring service if wired up
    console.error("[BulkReach] Unhandled error:", error);
  }, [error]);

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-4 text-center"
      style={{ background: "var(--bg)" }}
    >
      <div
        className="font-display font-extrabold leading-none select-none"
        style={{ fontSize: "clamp(64px, 12vw, 120px)", color: "var(--error, #EF4444)", opacity: 0.12 }}
        aria-hidden="true"
      >
        500
      </div>

      <div className="-mt-2">
        <h1
          className="font-display font-extrabold text-navy"
          style={{ fontSize: "clamp(22px, 3vw, 32px)" }}
        >
          Something went wrong
        </h1>
        <p className="mt-3 max-w-[420px] text-[15px] text-text-muted">
          An unexpected error occurred. We&apos;ve logged it and will look into it.
          Try refreshing the page — it often clears up on its own.
        </p>

        {error.digest && (
          <p className="mt-2 font-mono text-[11px] text-text-muted opacity-60">
            Error ID: {error.digest}
          </p>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={reset}
            className="btn-primary inline-flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            Try again
          </button>
          <Link href="/" className="btn-outline inline-flex items-center gap-2">
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
