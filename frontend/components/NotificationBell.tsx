/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useApiQuery } from '@/lib/hooks';

interface NotificationItem {
  id: string;
  type: string;
  level: 'info' | 'success' | 'warning' | 'error';
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

const LEVEL_DOT: Record<string, string> = {
  info: '#6366F1',
  success: '#00D4AA',
  warning: '#F59E0B',
  error: '#EF4444',
};

function timeAgo(iso: string): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Poll the unread count on a 30s interval. Errors are held in query state (not
  // thrown), so the bell never breaks the page — it just falls back to 0.
  const { data: unreadData, refetch: refetchUnread } = useApiQuery(
    ['notifications', 'unread-count'],
    () => api<{ count: number }>('/notifications/unread-count', { auth: true }),
    { refetchInterval: 30000 },
  );
  const unread = unreadData?.count ?? 0;

  // Notification list — fetched when the dropdown is open.
  const {
    data: itemsData,
    isLoading: itemsLoading,
    refetch: refetchItems,
  } = useApiQuery(
    ['notifications', 'list'],
    () => api<NotificationItem[]>('/notifications?limit=15', { auth: true }),
    { enabled: open },
  );
  const items = itemsLoading ? null : (itemsData ?? []);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  function toggle() {
    // Opening enables the list query, which fetches (or serves cached) items.
    setOpen((o) => !o);
  }

  async function openItem(n: NotificationItem) {
    if (!n.read_at) {
      try {
        await api(`/notifications/${n.id}/read`, { method: 'POST', auth: true });
        await Promise.all([refetchItems(), refetchUnread()]);
      } catch {
        /* ignore */
      }
    }
    if (n.link) {
      setOpen(false);
      router.push(n.link);
    }
  }

  async function markAll() {
    try {
      await api('/notifications/read-all', { method: 'POST', auth: true });
      await Promise.all([refetchItems(), refetchUnread()]);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={toggle}
        data-testid="notification-bell"
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ''}`}
        aria-haspopup="true"
        aria-expanded={open}
        className="relative rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span
            data-testid="notification-badge"
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
            style={{ background: '#EF4444' }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border bg-card shadow-lg animate-fade-up"
          style={{ maxHeight: '70vh' }}
        >
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="text-sm font-semibold">Notifications</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAll}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {items === null ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : items.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                You&apos;re all caught up.
              </div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => openItem(n)}
                  className={`flex w-full gap-3 border-b px-4 py-3 text-left last:border-0 hover:bg-accent/50 ${
                    n.read_at ? 'opacity-70' : ''
                  }`}
                >
                  <span
                    className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full"
                    style={{ background: n.read_at ? '#CBD5E1' : LEVEL_DOT[n.level] ?? '#6366F1' }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium leading-snug">{n.title}</span>
                    {n.body && (
                      <span className="mt-0.5 block text-xs text-muted-foreground line-clamp-2">{n.body}</span>
                    )}
                    <span className="mt-1 block text-[11px] text-muted-foreground">{timeAgo(n.created_at)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
