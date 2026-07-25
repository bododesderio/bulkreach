import type { Metadata } from 'next'
import { seedFAQ } from '@/lib/seed-data'
import FaqAccordion from '@/components/public/FaqAccordion'

export const metadata: Metadata = {
  title: 'FAQ — BulkReach',
  description:
    'Answers to common questions about BulkReach — contact formats, pricing, compliance, SMS limits, scheduling, and data retention.',
}

const extraFAQ = [
  {
    q: 'Do I need recipients to have opted in before I can send?',
    a: 'Yes. All campaigns must comply with Uganda Communications Commission (UCC) regulations. Recipients must have opted in to receive bulk messages. BulkReach enforces opt-in acknowledgement at the campaign creation step and logs consent records for audit purposes.',
  },
  {
    q: 'What happens when my SMS is longer than 160 characters?',
    a: 'Standard SMS messages are 160 characters. Longer messages are automatically split into concatenated parts (up to 3 parts, 456 characters total) and billed as separate messages. BulkReach shows you the live character count and message-part count as you compose, so you always know your cost before you send.',
  },
  {
    q: 'What happens to my data after I close my account?',
    a: 'Contact data, campaign records, and analytics reports are retained for 90 days after account closure, then permanently and irreversibly deleted. You can export all your data at any time from your account settings before closing.',
  },
  {
    q: 'Can I schedule campaigns in advance?',
    a: 'Yes. You can schedule any campaign for a future date and time. The system uses East Africa Time (EAT, UTC+3). Scheduled campaigns can be edited or cancelled up to 15 minutes before the send time. You will receive a dashboard notification and email confirmation when the campaign starts dispatching.',
  },
]

const allFAQ = [...seedFAQ, ...extraFAQ]

export default function FaqPage() {
  return (
    <>
      {/* ── HERO ── */}
      <section className="bg-navy-dark py-16 px-4 md:px-10 text-center">
        <div className="max-w-[1100px] mx-auto">
          <p className="text-teal text-[11px] font-bold uppercase tracking-[0.1em] mb-3">FAQ</p>
          <h1
            className="font-display font-extrabold text-white mb-4"
            style={{ fontSize: 'clamp(32px, 3.5vw, 52px)' }}
          >
            Frequently asked questions.
          </h1>
          <p
            className="text-[16px] max-w-[480px] mx-auto"
            style={{ color: 'rgba(255,255,255,0.52)' }}
          >
            Everything you need to know about BulkReach — from file formats to compliance.
          </p>
        </div>
      </section>

      {/* ── ACCORDION ── */}
      <section className="bg-white py-20 px-4 md:px-10">
        <div className="max-w-[760px] mx-auto">
          <FaqAccordion items={allFAQ} />
        </div>
      </section>
    </>
  )
}
