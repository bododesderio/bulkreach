/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
import * as Sentry from '@sentry/nextjs';

// No-op unless a browser DSN is configured. Blank DSN => no init, no network.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_ENVIRONMENT || 'production',
    tracesSampleRate: 0.1,
    // Session replay intentionally disabled to keep the client bundle light.
  });
}
