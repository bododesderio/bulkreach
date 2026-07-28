import type { Metadata } from 'next'
import FaqAccordion from '@/components/public/FaqAccordion'
import { getFaqs, getSections } from '@/lib/public-content'

export const metadata: Metadata = {
  title: 'FAQ — BulkReach',
  description:
    'Answers to common questions about BulkReach — contact formats, pricing, compliance, SMS limits, scheduling, and data retention.',
}

const HERO_FALLBACK = {
  hero_eyebrow: 'FAQ',
  hero_title: 'Frequently asked questions.',
  hero_subtitle: 'Everything you need to know about BulkReach — from file formats to compliance.',
}

export default async function FaqPage() {
  const [faqs, hero] = await Promise.all([getFaqs(), getSections('faq', HERO_FALLBACK)])

  return (
    <>
      {/* ── HERO ── */}
      <section className="bg-navy-dark py-16 px-4 md:px-10 text-center">
        <div className="max-w-[1100px] mx-auto">
          <p className="text-teal text-[11px] font-bold uppercase tracking-[0.1em] mb-3">
            {hero.hero_eyebrow}
          </p>
          <h1
            className="font-display font-extrabold text-white mb-4"
            style={{ fontSize: 'clamp(32px, 3.5vw, 52px)' }}
          >
            {hero.hero_title}
          </h1>
          <p
            className="text-[16px] max-w-[480px] mx-auto"
            style={{ color: 'rgba(255,255,255,0.52)' }}
          >
            {hero.hero_subtitle}
          </p>
        </div>
      </section>

      {/* ── ACCORDION ── */}
      <section className="bg-white py-20 px-4 md:px-10">
        <div className="max-w-[760px] mx-auto">
          <FaqAccordion items={faqs} />
        </div>
      </section>
    </>
  )
}
