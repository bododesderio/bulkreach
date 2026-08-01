/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { UserPlus, CreditCard, Megaphone, Cpu, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { StatusDot, DataState } from '@/components/ui';

type Kind = 'signup' | 'payment' | 'campaign' | 'system' | 'managed';

interface ActivityItem {
  id: string;
  kind: Kind;
  text: string;
  meta: string;
  when: string; // ISO
}

interface OverviewActivity {
  activity: ActivityItem[];
}

const KIND_META: Record<Kind, { icon: LucideIcon; color: string }> = {
  signup: { icon: UserPlus, color: '#00D4AA' },
  payment: { icon: CreditCard, color: '#10B981' },
  campaign: { icon: Megaphone, color: '#6366F1' },
  system: { icon: Cpu, color: '#9CA3AF' },
  managed: { icon: Zap, color: '#F59E0B' },
};

function fmtWhen(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

/** Live platform activity feed, sourced from the real `/admin/overview` events. */
export default function LiveTicker() {
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let alive = true;
    api<OverviewActivity>('/admin/overview?period=month', { auth: true })
      .then((res) => alive && setItems(res.activity ?? []))
      .catch((e) => alive && setError(e));
    return () => {
      alive = false;
    };
  }, []);

  const visible = (items ?? []).slice(0, 6);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <StatusDot color="#10B981" pulse />
        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-text-muted">
          Live activity
        </span>
      </div>

      <DataState
        loading={items === null && !error}
        error={error}
        empty={items !== null && visible.length === 0}
        emptyLabel="No activity recorded yet."
      >
        <div className="flex flex-col gap-1.5">
          <AnimatePresence initial={false}>
            {visible.map((item) => {
              const meta = KIND_META[item.kind] ?? KIND_META.system;
              const Icon = meta.icon;
              return (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.35 }}
                  className="flex items-start gap-2.5 rounded-[8px] px-2.5 py-2 hover:bg-bg transition-colors"
                >
                  <span
                    className="flex items-center justify-center rounded-[7px] flex-shrink-0 mt-0.5"
                    style={{ width: 26, height: 26, background: `${meta.color}1f` }}
                  >
                    <Icon size={13} color={meta.color} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-semibold text-navy leading-snug truncate">
                      {item.text}
                    </div>
                    <div className="text-[10.5px] text-text-muted">{item.meta}</div>
                  </div>
                  <span className="text-[10px] text-text-muted whitespace-nowrap mt-0.5">
                    {fmtWhen(item.when)}
                  </span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </DataState>
    </div>
  );
}
