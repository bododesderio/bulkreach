/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
'use client';

import Link from 'next/link';
import { Info } from 'lucide-react';
import Topbar from '@/components/admin/Topbar';
import FormGrid, { FormCard } from '@/components/admin/FormGrid';
import FormField from '@/components/admin/FormField';
import { Reveal } from '@/components/admin/Reveal';

// Deploy-time platform configuration. These values are set via environment at
// deploy time (see infra/OPERATIONS.md) and are shown here read-only; the pieces
// that ARE editable at runtime live on their own admin pages (linked below).
const CONFIG: { label: string; value: string; hint: string }[] = [
  { label: 'Platform name', value: 'BulkReach', hint: 'Shown in emails and branded reports (PROJECT_NAME).' },
  { label: 'Support email', value: 'support@bulkreach.ug', hint: 'Reply-to for automated emails (SUPPORT_EMAIL).' },
  { label: 'Default SMS sender ID', value: 'BULKREACH', hint: 'Max 11 alphanumeric chars (DEFAULT_SMS_SENDER).' },
  { label: 'Mailgun domain', value: 'mg.bulkreach.ug', hint: 'Verified Mailgun sending domain (MAILGUN_DOMAIN).' },
];

const RUNTIME_CONTROLS: { label: string; href: string; desc: string }[] = [
  { label: 'Payment providers', href: '/admin/settings/payments', desc: 'Enable providers, switch test/live mode, set keys.' },
  { label: 'Plans', href: '/admin/settings/plans', desc: 'Create and price subscription plans.' },
  { label: 'Data archive', href: '/admin/archive', desc: 'Retention windows, legal holds, erasure.' },
  { label: 'Marketing content', href: '/admin/settings/content', desc: 'Public-site copy, FAQs, testimonials.' },
];

export default function SettingsPage() {
  return (
    <>
      <Topbar title="Settings" subtitle="Platform configuration" showPeriod={false} />

      <div className="p-[18px] space-y-[18px]">
        <Reveal>
          <div
            className="flex items-start gap-2 rounded-[11px] border p-4 text-[12px] text-fg-muted"
            style={{ background: 'var(--surface-2)' }}
          >
            <Info size={16} className="mt-0.5 shrink-0 text-teal" aria-hidden />
            <p>
              These platform values are configured at deploy time via environment
              variables (see <code>infra/OPERATIONS.md</code>) and are shown here
              read-only. Settings that can be changed at runtime have their own
              pages, linked below.
            </p>
          </div>
        </Reveal>

        <Reveal>
          <FormCard>
            <FormGrid columns={2}>
              {CONFIG.map((c) => (
                <FormField key={c.label} label={c.label} hint={c.hint}>
                  <input
                    type="text"
                    className="input"
                    value={c.value}
                    readOnly
                    disabled
                    aria-readonly
                  />
                </FormField>
              ))}
            </FormGrid>
          </FormCard>
        </Reveal>

        <Reveal>
          <FormCard>
            <div className="font-display text-[14px] font-bold text-fg mb-1">
              Runtime configuration
            </div>
            <div className="text-[11px] text-fg-muted mb-3">
              Editable without a redeploy.
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {RUNTIME_CONTROLS.map((r) => (
                <Link
                  key={r.href}
                  href={r.href}
                  className="group block rounded-[10px] border p-3 transition-all hover:border-teal/60 hover:shadow-[0_8px_20px_-12px_rgba(27,31,74,0.25)]"
                >
                  <div className="text-[12.5px] font-semibold text-fg group-hover:text-teal">
                    {r.label} →
                  </div>
                  <div className="text-[11px] text-fg-muted mt-0.5">{r.desc}</div>
                </Link>
              ))}
            </div>
          </FormCard>
        </Reveal>
      </div>
    </>
  );
}
