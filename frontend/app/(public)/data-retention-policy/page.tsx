/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Data Retention Policy',
  description: 'BulkReach Data Retention Policy — how long we keep your campaign and contact data.',
  path: '/data-retention-policy',
});

const LAST_UPDATED = '2026-07-31';

const SCHEDULE = [
  { category: 'Account profile data', period: '30 days after account closure', notes: 'Extended if required by a legal hold.' },
  { category: 'Campaign records (sent messages)', period: '24 months', notes: 'Anonymised after 24 months; raw logs deleted.' },
  { category: 'Contact lists', period: 'Until deleted by you, or 90 days after account closure', notes: 'Export via Settings → Data archive before closing.' },
  { category: 'Delivery reports & analytics', period: '24 months', notes: 'Aggregate statistics retained indefinitely.' },
  { category: 'Billing and payment records', period: '7 years', notes: 'Required by Ugandan tax law.' },
  { category: 'Audit and security logs', period: '12 months', notes: 'Access events, login history, and admin actions.' },
  { category: 'Support tickets', period: '3 years', notes: 'May be anonymised after 12 months.' },
];

export default function DataRetentionPolicyPage() {
  return (
    <div className="max-w-[780px] mx-auto px-4 md:px-8 py-16">
      {/* Header */}
      <div className="mb-10 border-b pb-8">
        <p className="text-teal text-[11px] font-bold uppercase tracking-[0.1em] mb-2">Legal</p>
        <h1
          className="font-display font-extrabold text-navy mb-3"
          style={{ fontSize: 'clamp(28px, 3vw, 40px)' }}
        >
          Data Retention Policy
        </h1>
        <p className="text-[14px] text-text-muted">
          Last updated: <time dateTime={LAST_UPDATED}>{LAST_UPDATED}</time>
        </p>
        <p className="mt-3 text-[15px] text-text-md">
          This Data Retention Policy explains how long Rooibok Technologies retains different
          categories of data processed through BulkReach, and what happens to your data when
          retention periods expire or your account is closed.
        </p>
      </div>

      <div className="space-y-8 text-[15px] leading-relaxed text-text-md">

        <section>
          <h2 className="font-display font-extrabold text-navy text-[20px] mb-3">1. Why We Have a Retention Policy</h2>
          <p>
            We retain data only as long as necessary to deliver the Service, meet legal obligations,
            resolve disputes, and prevent fraud. We comply with Uganda&apos;s Data Protection and
            Privacy Act 2019 and applicable sector regulations governing electronic communications.
          </p>
        </section>

        <section>
          <h2 className="font-display font-extrabold text-navy text-[20px] mb-3">2. Retention Schedule</h2>
          <p className="mb-4">
            The following table sets out the retention period for each category of data we process.
          </p>
          <div className="overflow-x-auto rounded-[10px] border">
            <table className="min-w-full text-[13px]">
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  <th className="px-4 py-3 text-left font-bold text-navy text-[11.5px] uppercase tracking-[0.06em]">
                    Data category
                  </th>
                  <th className="px-4 py-3 text-left font-bold text-navy text-[11.5px] uppercase tracking-[0.06em]">
                    Retention period
                  </th>
                  <th className="px-4 py-3 text-left font-bold text-navy text-[11.5px] uppercase tracking-[0.06em]">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {SCHEDULE.map(({ category, period, notes }) => (
                  <tr key={category} className="hover:bg-bg/40 transition-colors">
                    <td className="px-4 py-3 font-semibold text-navy">{category}</td>
                    <td className="px-4 py-3 text-text-md">{period}</td>
                    <td className="px-4 py-3 text-text-muted">{notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="font-display font-extrabold text-navy text-[20px] mb-3">3. Deletion and Anonymisation</h2>
          <p>
            When a retention period expires, data is either securely deleted (using cryptographic
            erasure for cloud-stored objects) or anonymised so it can no longer be linked to an
            individual or organisation. Aggregate statistics derived from anonymised data may be
            retained indefinitely.
          </p>
        </section>

        <section>
          <h2 className="font-display font-extrabold text-navy text-[20px] mb-3">4. Account Closure</h2>
          <p>
            When you close your BulkReach account, we initiate a 30-day grace period during which
            your data remains intact in case of accidental closure. After the grace period, all
            personal data is deleted or anonymised in accordance with the schedule above, except
            where a longer period is legally required.
          </p>
          <p className="mt-3">
            You can export your data at any time before closing your account via{' '}
            <strong>Settings → Danger → Close account</strong> — or contact us to request an
            export.
          </p>
        </section>

        <section>
          <h2 className="font-display font-extrabold text-navy text-[20px] mb-3">5. Legal Holds</h2>
          <p>
            If we are subject to a legal obligation, regulatory investigation, or court order
            requiring us to preserve certain data beyond its normal retention period, we will do so
            and notify you to the extent permitted by law.
          </p>
        </section>

        <section>
          <h2 className="font-display font-extrabold text-navy text-[20px] mb-3">6. Your Erasure Rights</h2>
          <p>
            You may request erasure of your personal data at any time, subject to our legal retention
            obligations. Erasure requests for data subject to a mandatory retention period (e.g.
            billing records) will be partially fulfilled — data will be anonymised where erasure is
            not legally possible. See our{' '}
            <a href="/privacy-policy" className="text-teal underline">
              Privacy Policy
            </a>{' '}
            for details on how to exercise this right.
          </p>
        </section>

        <section>
          <h2 className="font-display font-extrabold text-navy text-[20px] mb-3">7. Changes to This Policy</h2>
          <p>
            We may update this Policy. We will notify registered users by email at least 14 days
            before any material change takes effect.
          </p>
        </section>

        <section>
          <h2 className="font-display font-extrabold text-navy text-[20px] mb-3">8. Contact</h2>
          <p>
            Questions about data retention? Email{' '}
            <a href="mailto:privacy@bulkreach.app" className="text-teal underline">
              privacy@bulkreach.app
            </a>{' '}
            or write to: Rooibok Technologies, Lira City, Northern Uganda.
          </p>
        </section>

      </div>
    </div>
  );
}
