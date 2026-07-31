/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Terms of Service',
  description: 'BulkReach Terms of Service — the rules for using the platform fairly and legally.',
  path: '/terms-of-service',
});

const LAST_UPDATED = '2026-07-31';

export default function TermsOfServicePage() {
  return (
    <div className="max-w-[780px] mx-auto px-4 md:px-8 py-16">
      {/* Header */}
      <div className="mb-10 border-b pb-8">
        <p className="text-teal text-[11px] font-bold uppercase tracking-[0.1em] mb-2">Legal</p>
        <h1
          className="font-display font-extrabold text-navy mb-3"
          style={{ fontSize: 'clamp(28px, 3vw, 40px)' }}
        >
          Terms of Service
        </h1>
        <p className="text-[14px] text-text-muted">
          Last updated: <time dateTime={LAST_UPDATED}>{LAST_UPDATED}</time>
        </p>
        <p className="mt-3 text-[15px] text-text-md">
          These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of BulkReach,
          a bulk SMS and email marketing platform operated by Rooibok Technologies (&ldquo;we&rdquo;,
          &ldquo;us&rdquo;, or &ldquo;our&rdquo;), a company registered in Uganda.
          By creating an account or using the Service you agree to these Terms.
        </p>
      </div>

      <div className="prose-legal space-y-8 text-[15px] leading-relaxed text-text-md">

        <section>
          <h2 className="font-display font-extrabold text-navy text-[20px] mb-3">1. Eligibility</h2>
          <p>
            You must be at least 18 years old and capable of forming a binding contract to use BulkReach.
            By registering, you represent that all information you provide is accurate and that you have
            the legal authority to bind any organisation on whose behalf you operate the account.
          </p>
        </section>

        <section>
          <h2 className="font-display font-extrabold text-navy text-[20px] mb-3">2. Your Account</h2>
          <p>
            You are responsible for maintaining the confidentiality of your account credentials and for
            all activity that occurs under your account. Notify us immediately at{' '}
            <a href="mailto:support@bulkreach.app" className="text-teal underline">
              support@bulkreach.app
            </a>{' '}
            if you suspect unauthorised access. We reserve the right to suspend or terminate accounts
            that violate these Terms.
          </p>
        </section>

        <section>
          <h2 className="font-display font-extrabold text-navy text-[20px] mb-3">3. Acceptable Use</h2>
          <p>You agree not to use BulkReach to:</p>
          <ul className="mt-2 list-disc list-inside space-y-1">
            <li>Send unsolicited commercial messages (spam) in violation of applicable law.</li>
            <li>Transmit unlawful, defamatory, harassing, or fraudulent content.</li>
            <li>Harvest or collect contact data without the recipient&apos;s consent.</li>
            <li>Circumvent rate limits, access controls, or security features.</li>
            <li>Resell or sublicense the Service without our written permission.</li>
            <li>Violate any applicable Ugandan law or international regulation.</li>
          </ul>
          <p className="mt-3">
            We reserve the right to investigate and terminate accounts found to be in violation of
            this policy without prior notice.
          </p>
        </section>

        <section>
          <h2 className="font-display font-extrabold text-navy text-[20px] mb-3">4. Subscription and Billing</h2>
          <p>
            BulkReach offers a free trial of 500 messages. Paid plans are billed in advance on a
            monthly or annual cycle. All fees are non-refundable except where required by law.
            We may change pricing with 30 days&apos; notice. Failure to pay may result in service
            suspension.
          </p>
        </section>

        <section>
          <h2 className="font-display font-extrabold text-navy text-[20px] mb-3">5. Intellectual Property</h2>
          <p>
            BulkReach and its underlying software, trademarks, and documentation are owned by
            Rooibok Technologies. You retain ownership of content you upload (contacts, message
            templates, and campaign materials). By uploading content you grant us a limited licence
            to process it solely for the purpose of delivering the Service.
          </p>
        </section>

        <section>
          <h2 className="font-display font-extrabold text-navy text-[20px] mb-3">6. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by Ugandan law, Rooibok Technologies shall not be liable
            for any indirect, incidental, or consequential damages arising from your use of the Service,
            including loss of data, revenue, or business opportunity. Our aggregate liability for any
            claim shall not exceed the amount you paid us in the three months preceding the claim.
          </p>
        </section>

        <section>
          <h2 className="font-display font-extrabold text-navy text-[20px] mb-3">7. Termination</h2>
          <p>
            Either party may terminate the agreement at any time. You may close your account via the
            Settings page. We may terminate or suspend your access for breach of these Terms, failure
            to pay, or for legal or regulatory reasons. Upon termination your data is retained for 30
            days before deletion, in accordance with our{' '}
            <a href="/data-retention-policy" className="text-teal underline">
              Data Retention Policy
            </a>.
          </p>
        </section>

        <section>
          <h2 className="font-display font-extrabold text-navy text-[20px] mb-3">8. Governing Law</h2>
          <p>
            These Terms are governed by the laws of the Republic of Uganda. Any disputes shall be
            subject to the exclusive jurisdiction of the courts of Kampala, Uganda.
          </p>
        </section>

        <section>
          <h2 className="font-display font-extrabold text-navy text-[20px] mb-3">9. Changes to These Terms</h2>
          <p>
            We may update these Terms from time to time. We will notify registered users by email at
            least 14 days before material changes take effect. Your continued use of the Service after
            the effective date constitutes acceptance of the revised Terms.
          </p>
        </section>

        <section>
          <h2 className="font-display font-extrabold text-navy text-[20px] mb-3">10. Contact</h2>
          <p>
            Questions about these Terms? Contact us at{' '}
            <a href="mailto:legal@bulkreach.app" className="text-teal underline">
              legal@bulkreach.app
            </a>{' '}
            or write to: Rooibok Technologies, Lira City, Northern Uganda.
          </p>
        </section>

      </div>
    </div>
  );
}
