/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Privacy Policy',
  description: 'BulkReach Privacy Policy — how we collect, use, and protect your personal data.',
  path: '/privacy-policy',
});

const LAST_UPDATED = '2026-07-31';

export default function PrivacyPolicyPage() {
  return (
    <div className="max-w-[780px] mx-auto px-4 md:px-8 py-16">
      {/* Header */}
      <div className="mb-10 border-b pb-8">
        <p className="text-teal text-[11px] font-bold uppercase tracking-[0.1em] mb-2">Legal</p>
        <h1
          className="font-display font-extrabold text-navy mb-3"
          style={{ fontSize: 'clamp(28px, 3vw, 40px)' }}
        >
          Privacy Policy
        </h1>
        <p className="text-[14px] text-text-muted">
          Last updated: <time dateTime={LAST_UPDATED}>{LAST_UPDATED}</time>
        </p>
        <p className="mt-3 text-[15px] text-text-md">
          Rooibok Technologies (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;) operates
          BulkReach. This Privacy Policy explains how we collect, use, share, and protect information
          about you when you use our platform. We are committed to your privacy and comply with
          Uganda&apos;s Data Protection and Privacy Act 2019.
        </p>
      </div>

      <div className="space-y-8 text-[15px] leading-relaxed text-text-md">

        <section>
          <h2 className="font-display font-extrabold text-navy text-[20px] mb-3">1. Information We Collect</h2>
          <p>We collect the following categories of personal data:</p>
          <ul className="mt-2 list-disc list-inside space-y-1">
            <li>
              <strong>Account data:</strong> your name, business name, email address, phone number,
              and password (stored as a salted hash).
            </li>
            <li>
              <strong>Campaign data:</strong> message templates, contact lists, and delivery reports
              you upload or create.
            </li>
            <li>
              <strong>Usage data:</strong> pages visited, features used, browser type, IP address,
              and session timestamps.
            </li>
            <li>
              <strong>Payment data:</strong> transaction references and payment method tokens.
              We do not store raw card numbers — payments are processed by PCI-compliant gateways.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-display font-extrabold text-navy text-[20px] mb-3">2. How We Use Your Data</h2>
          <p>We use your data to:</p>
          <ul className="mt-2 list-disc list-inside space-y-1">
            <li>Provide, operate, and improve the BulkReach platform.</li>
            <li>Process transactions and send billing communications.</li>
            <li>Send service-critical notifications (security, compliance, quota warnings).</li>
            <li>Send optional product updates and promotional emails where you have opted in.</li>
            <li>Detect fraud, abuse, and security threats.</li>
            <li>Meet our legal and regulatory obligations under Ugandan law.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display font-extrabold text-navy text-[20px] mb-3">3. Legal Basis for Processing</h2>
          <p>
            We process your personal data on the following bases: performance of a contract (to
            deliver the Service), legitimate interests (security and fraud prevention), your consent
            (marketing communications), and compliance with legal obligations.
          </p>
        </section>

        <section>
          <h2 className="font-display font-extrabold text-navy text-[20px] mb-3">4. Sharing Your Data</h2>
          <p>
            We do not sell your personal data. We share it only with:
          </p>
          <ul className="mt-2 list-disc list-inside space-y-1">
            <li>
              <strong>Service providers:</strong> cloud infrastructure, payment processors, and SMS/email
              gateway partners, all bound by data processing agreements.
            </li>
            <li>
              <strong>Legal authorities:</strong> when required by a valid court order or applicable law.
            </li>
            <li>
              <strong>Business transfers:</strong> in the event of a merger or acquisition, with
              appropriate notice to you.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-display font-extrabold text-navy text-[20px] mb-3">5. Data Retention</h2>
          <p>
            We retain your account data for the duration of your subscription plus 30 days after
            closure, unless a longer retention is required by law. Contact data in your campaigns is
            subject to the schedule in our{' '}
            <a href="/data-retention-policy" className="text-teal underline">
              Data Retention Policy
            </a>.
          </p>
        </section>

        <section>
          <h2 className="font-display font-extrabold text-navy text-[20px] mb-3">6. Your Rights</h2>
          <p>Under Uganda&apos;s Data Protection and Privacy Act 2019, you have the right to:</p>
          <ul className="mt-2 list-disc list-inside space-y-1">
            <li>Access the personal data we hold about you.</li>
            <li>Correct inaccurate data.</li>
            <li>Request erasure of your data (subject to legal holds).</li>
            <li>Object to processing based on legitimate interests.</li>
            <li>Withdraw consent for marketing communications at any time.</li>
          </ul>
          <p className="mt-3">
            To exercise these rights, email{' '}
            <a href="mailto:privacy@bulkreach.app" className="text-teal underline">
              privacy@bulkreach.app
            </a>. We will respond within 30 days.
          </p>
        </section>

        <section>
          <h2 className="font-display font-extrabold text-navy text-[20px] mb-3">7. Security</h2>
          <p>
            We implement industry-standard safeguards including TLS encryption in transit, AES-256
            encryption at rest, access controls, and regular security audits. No system is 100%
            secure; please use a strong, unique password and enable multi-factor authentication
            where available.
          </p>
        </section>

        <section>
          <h2 className="font-display font-extrabold text-navy text-[20px] mb-3">8. Cookies</h2>
          <p>
            BulkReach uses session cookies essential for authentication and security. We do not use
            third-party advertising cookies. You may disable cookies in your browser, but this will
            prevent you from logging in.
          </p>
        </section>

        <section>
          <h2 className="font-display font-extrabold text-navy text-[20px] mb-3">9. Changes to This Policy</h2>
          <p>
            We may update this Policy from time to time. We will notify you by email at least 14 days
            before material changes take effect. The &ldquo;Last updated&rdquo; date at the top of
            this page reflects the most recent revision.
          </p>
        </section>

        <section>
          <h2 className="font-display font-extrabold text-navy text-[20px] mb-3">10. Contact</h2>
          <p>
            Questions or concerns about this Privacy Policy? Contact our Data Protection Officer at{' '}
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
