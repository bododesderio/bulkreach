'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { UserPlus, CreditCard, Megaphone, Cpu, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { seedActivity } from '@/lib/seed-data';
import { StatusDot } from './StatusPill';

type Kind = (typeof seedActivity)[number]['kind'];

const KIND_META: Record<Kind, { icon: LucideIcon; color: string }> = {
  signup: { icon: UserPlus, color: '#00D4AA' },
  payment: { icon: CreditCard, color: '#10B981' },
  campaign: { icon: Megaphone, color: '#6366F1' },
  system: { icon: Cpu, color: '#9CA3AF' },
  managed: { icon: Zap, color: '#F59E0B' },
};

/** Rotating "live" activity feed. Cycles the seed items so it feels alive
 *  without fabricating events — the freshest item animates in at the top. */
export default function LiveTicker({ interval = 3500 }: { interval?: number }) {
  const [items, setItems] = useState(seedActivity);

  useEffect(() => {
    const t = setInterval(() => {
      setItems((prev) => {
        const next = [...prev];
        const last = next.pop();
        if (last) next.unshift(last);
        return next;
      });
    }, interval);
    return () => clearInterval(t);
  }, [interval]);

  const visible = items.slice(0, 6);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <StatusDot color="#10B981" pulse />
        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-text-muted">
          Live activity
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <AnimatePresence initial={false}>
          {visible.map((item) => {
            const meta = KIND_META[item.kind];
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
                  {item.ago}
                </span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
