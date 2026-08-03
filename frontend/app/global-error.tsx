/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 *
 * Root error boundary. Unlike app/error.tsx, this catches errors thrown in the
 * root layout itself, so it must render its own <html>/<body>. Reports to Sentry
 * (no-op without a DSN) — this is the file Next.js/Sentry want for React render
 * errors in the App Router.
 */
"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, sans-serif",
          background: "#F7F8FC",
          color: "#1B1F4A",
          textAlign: "center",
          padding: "1rem",
        }}
      >
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>Something went wrong</h1>
        <p style={{ maxWidth: 420, color: "#64748B", fontSize: 15 }}>
          An unexpected error occurred. We&apos;ve logged it — try again in a moment.
        </p>
        {error.digest && (
          <p style={{ fontFamily: "monospace", fontSize: 11, color: "#94A3B8" }}>
            Error ID: {error.digest}
          </p>
        )}
        <button
          onClick={reset}
          style={{
            marginTop: 16,
            padding: "10px 20px",
            borderRadius: 999,
            border: "none",
            background: "#00D4AA",
            color: "#0D0F2E",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
