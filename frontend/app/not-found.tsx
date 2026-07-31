/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
import Link from 'next/link';

export default function NotFound() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-4 text-center"
      style={{ background: 'var(--bg)' }}
    >
      {/* Large 404 numeral */}
      <div
        className="font-display font-extrabold leading-none select-none"
        style={{ fontSize: 'clamp(80px, 15vw, 160px)', color: 'var(--teal)', opacity: 0.15 }}
        aria-hidden="true"
      >
        404
      </div>

      <div className="-mt-4">
        <h1
          className="font-display font-extrabold text-navy"
          style={{ fontSize: 'clamp(24px, 3vw, 36px)' }}
        >
          Page not found
        </h1>
        <p className="mt-3 max-w-[420px] text-[15px] text-text-muted">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="btn-primary inline-flex items-center gap-2"
          >
            Go home
          </Link>
          <Link
            href="/login"
            className="btn-outline inline-flex items-center gap-2"
          >
            Log in
          </Link>
        </div>
      </div>
    </div>
  );
}
