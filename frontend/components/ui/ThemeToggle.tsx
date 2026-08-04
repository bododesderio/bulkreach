/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Moon/sun theme switch. The pre-paint script in the root layout resolves the
 * initial theme (localStorage → OS) with no flash; this only flips `.dark` on
 * <html> and persists the explicit choice. Reads the real DOM state on mount so
 * it stays in sync no matter which route mounted it, and renders theme-neutral
 * until mounted to avoid a hydration mismatch.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [mounted, setMounted] = useState(false);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setMounted(true);
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  const toggle = () => {
    const el = document.documentElement;
    const next = !el.classList.contains('dark');
    el.classList.toggle('dark', next);
    try {
      localStorage.setItem('theme', next ? 'dark' : 'light');
    } catch {
      /* private mode — the class still applies for this session */
    }
    setDark(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={mounted ? (dark ? 'Switch to light mode' : 'Switch to dark mode') : 'Toggle theme'}
      title={mounted ? (dark ? 'Light mode' : 'Dark mode') : undefined}
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-[7px] border border-line bg-transparent text-fg-muted transition-colors',
        'hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
        className,
      )}
    >
      {/* Render an icon only after mount so SSR and first client paint match. */}
      {mounted ? dark ? <Sun size={15} /> : <Moon size={15} /> : <span className="h-[15px] w-[15px]" />}
    </button>
  );
}
