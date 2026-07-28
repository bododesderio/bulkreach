import type { Metadata } from 'next'
import { seedPlans } from '@/lib/seed-data'
import { getFaqs, getSections } from '@/lib/public-content'
import PlanCard from '@/components/public/PlanCard'
import FaqAccordion from '@/components/public/FaqAccordion'

export const metadata: Metadata = {
  title: 'Pricing — BulkReach',
  description:
    'Simple Ugandan pricing in UGX. Pay via MTN Mobile Money, Airtel Money, Visa, or Mastercard. 500 messages free on trial.',
}

const paymentMethods = ['MTN Mobile Money', 'Airtel Money', 'Visa', 'Mastercard']

const HERO_FALLBACK = {
  hero_eyebrow: 'PRICING',
  hero_title: 'Simple, Ugandan pricing.',
  hero_subtitle: 'All prices in UGX. No hidden fees. Cancel anytime.',
}

export default async function PricingPage() {
  const [faqs, hero] = await Promise.all([getFaqs(), getSections('pricing', HERO_FALLBACK)])
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

      {/* ── PLAN CARDS ── */}
      <section className="bg-pricing-bg py-20 px-4 md:px-10">
        <div className="max-w-[1100px] mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {seedPlans.map((plan) => (
              <PlanCard
                key={plan.name}
                {...plan}
                ctaHref={plan.managed ? '/managed' : '/signup'}
              />
            ))}
          </div>
          <p className="text-center text-[11.5px] mt-5" style={{ color: 'var(--text-muted)' }}>
            Overage: UGX 20/SMS and UGX 15/email beyond plan limit &middot; 500 messages free on
            trial — no credit card needed
          </p>
        </div>
      </section>

      {/* ── PAYMENT METHODS ── */}
      <section className="bg-white py-16 px-4 md:px-10 text-center">
        <div className="max-w-[1100px] mx-auto">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] mb-6" style={{ color: 'var(--text-muted)' }}>
            Accepted payment methods
          </p>
          <div className="flex flex-wrap justify-center gap-3 mb-10">
            {paymentMethods.map((m) => (
              <span
                key={m}
                className="bg-white border rounded-full px-[18px] py-2 text-[13px] font-semibold text-navy"
              >
                {m}
              </span>
            ))}
          </div>

          {/* Overage block */}
          <div
            className="max-w-[540px] mx-auto rounded-xl border p-5 mb-4 text-left"
            style={{ borderColor: 'var(--border)' }}
          >
            <p className="font-display font-bold text-[13px] text-navy mb-1">Overage charges</p>
            <p className="text-[13px]" style={{ color: 'var(--text-md)' }}>
              UGX 20 per SMS &middot; UGX 15 per email for usage beyond monthly plan limit. Charged
              at start of next billing cycle.
            </p>
          </div>

          {/* Free trial block */}
          <div
            className="max-w-[540px] mx-auto rounded-xl border p-5 text-left"
            style={{ borderColor: 'rgba(0,212,170,0.3)', background: 'rgba(0,212,170,0.04)' }}
          >
            <p className="font-display font-bold text-[13px] text-navy mb-1">Free trial</p>
            <p className="text-[13px]" style={{ color: 'var(--text-md)' }}>
              500 messages free on signup — no credit card required — full Growth features — expires
              after 14 days.
            </p>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="bg-bg py-20 px-4 md:px-10">
        <div className="max-w-[760px] mx-auto">
          <p className="text-teal text-[11px] font-bold uppercase tracking-[0.1em] mb-2.5">FAQ</p>
          <h2
            className="font-display font-extrabold text-navy mb-8"
            style={{ fontSize: 'clamp(22px, 2.5vw, 36px)' }}
          >
            Common questions about pricing.
          </h2>
          <FaqAccordion items={faqs} />
        </div>
      </section>
    </>
  )
}
