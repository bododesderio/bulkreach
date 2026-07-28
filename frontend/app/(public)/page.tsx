import type { Metadata } from 'next'
import Link from 'next/link'
import { Users, Check, FileText, Upload, Code, LayoutGrid, BarChart2, Award, Clock, ArrowRight } from 'lucide-react'
import { seedPlans } from '@/lib/seed-data'
import { getFeatures, getTestimonials, getSeo } from '@/lib/public-content'
import { JsonLd } from '@/components/seo/JsonLd'
import { organizationSchema, softwareApplicationSchema, pageMetadata, websiteSchema, DEFAULT_DESCRIPTION, DEFAULT_TITLE } from '@/lib/seo'
import BroadcastAnimation from '@/components/public/BroadcastAnimation'
import FeatureCard from '@/components/public/FeatureCard'
import PlanCard from '@/components/public/PlanCard'
import TestimonialCard from '@/components/public/TestimonialCard'
import StepItem from '@/components/public/StepItem'

export async function generateMetadata(): Promise<Metadata> {
  const seo = await getSeo('home', { title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION })
  return pageMetadata({ title: seo.title, description: seo.description, path: '/', titleAbsolute: true })
}

const iconMap = { Upload, Code, LayoutGrid, BarChart2, Award, Clock }

// Decorative chips are keyed by feature title (not stored in the CMS).
const CHIPS: Record<string, string[]> = {
  'Any contact format': ['CSV', 'Excel', 'Word', 'PDF', 'Paste'],
}

const steps = [
  {
    num: '01',
    title: 'Upload contacts',
    desc: 'Drop in a CSV, Excel, Word doc, or PDF. Columns detected automatically.',
  },
  {
    num: '02',
    title: 'Write your message',
    desc: 'Compose SMS, email, or both. Insert merge tags. Preview per-recipient rendering.',
  },
  {
    num: '03',
    title: 'Send or schedule',
    desc: 'Hit send now or pick a time. Progress streams live to your dashboard.',
  },
  {
    num: '04',
    title: 'Download your report',
    desc: 'PDF analytics report auto-generated on completion. Delivery stats, charts, failure analysis.',
  },
]

export default async function HomePage() {
  const [features, testimonials] = await Promise.all([getFeatures(), getTestimonials()])
  return (
    <>
      <JsonLd data={[organizationSchema(), websiteSchema(), softwareApplicationSchema()]} />
      {/* ── HERO ── */}
      <section className="bg-navy-dark py-16 px-4 md:px-10">
        <div className="max-w-[1100px] mx-auto flex items-center gap-10 flex-wrap">
          {/* Left */}
          <div className="flex-1 min-w-0 max-w-[490px]">
            {/* Eyebrow pill */}
            <div
              className="inline-flex items-center gap-2 rounded-full px-3.5 py-[5px] mb-5 border"
              style={{
                background: 'rgba(0,212,170,0.1)',
                borderColor: 'rgba(0,212,170,0.22)',
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-teal animate-dot-pulse" />
              <span className="text-teal text-[11px] font-bold uppercase tracking-[0.06em]">
                Live on MTN &amp; Airtel Uganda
              </span>
            </div>

            {/* H1 */}
            <h1
              className="font-display font-extrabold leading-[1.1] tracking-[-0.02em] text-white mb-4"
              style={{ fontSize: 'clamp(36px, 4.5vw, 58px)' }}
            >
              Your message.
              <br />
              <span className="text-teal">20,000 inboxes.</span>
              <br />
              One send.
            </h1>

            {/* Subtitle */}
            <p
              className="text-[15.5px] leading-[1.75] max-w-[420px] mb-[30px]"
              style={{ color: 'rgba(255,255,255,0.52)' }}
            >
              Professional bulk SMS &amp; email campaigns for Uganda&apos;s businesses —
              personalised merge tags, auto-generated PDF reports, and a fully managed option.
            </p>

            {/* CTA row */}
            <div className="flex gap-2.5 mb-9 flex-wrap">
              <Link
                href="/signup"
                className="font-display font-bold text-[14.5px] bg-teal text-navy-dark px-[30px] py-[13px] rounded-full inline-flex gap-[7px] items-center transition hover:opacity-90"
              >
                Start free trial
                <ArrowRight size={16} />
              </Link>
              <Link
                href="/managed"
                className="text-[14.5px] font-semibold px-[26px] py-3 rounded-full border-[1.5px] transition hover:opacity-80"
                style={{
                  borderColor: 'rgba(255,255,255,0.18)',
                  color: 'rgba(255,255,255,0.75)',
                }}
              >
                Request managed service
              </Link>
            </div>

            {/* Proof pills */}
            <div className="flex gap-3 flex-wrap">
              {[
                { num: '500', label: 'free messages on signup' },
                { num: '98.4%', label: 'delivery rate' },
                { num: '0', label: 'credit card required' },
              ].map(({ num, label }) => (
                <div
                  key={num}
                  className="rounded-[10px] px-[15px] py-2.5 border"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    borderColor: 'rgba(255,255,255,0.1)',
                  }}
                >
                  <p className="font-mono text-[21px] font-semibold text-teal">{num}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.38)' }}>
                    {label}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Right — animation (hidden on mobile) */}
          <div className="hidden md:flex flex-1 items-center justify-center">
            <BroadcastAnimation />
          </div>
        </div>
      </section>

      {/* ── STATS STRIP ── */}
      <section className="bg-white border-b">
        <div className="max-w-[1100px] mx-auto grid grid-cols-1 md:grid-cols-3">
          {[
            { Icon: Users, num: '20,000', label: 'recipients per campaign batch' },
            { Icon: Check, num: '98.4%', label: 'average SMS delivery rate' },
            { Icon: FileText, num: 'Auto PDF', label: 'report after every campaign' },
          ].map(({ Icon, num, label }, i) => (
            <div
              key={num}
              className={`flex items-center gap-3.5 px-9 py-[22px] ${
                i < 2 ? 'md:border-r' : ''
              }`}
            >
              <div
                className="w-[42px] h-[42px] rounded-[10px] flex items-center justify-center text-teal shrink-0"
                style={{ background: 'var(--teal-light)' }}
              >
                <Icon size={19} />
              </div>
              <div>
                <p className="font-mono text-[24px] font-semibold text-navy leading-none">{num}</p>
                <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {label}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="py-20 px-4 md:px-10 bg-bg">
        <div className="max-w-[1100px] mx-auto">
          <p className="text-teal text-[11px] font-bold uppercase tracking-[0.1em] mb-2.5">
            PLATFORM FEATURES
          </p>
          <h2
            className="font-display font-extrabold text-navy mb-3"
            style={{ fontSize: 'clamp(26px, 3vw, 42px)' }}
          >
            Everything to send campaigns that actually land.
          </h2>
          <p className="text-[15px] mb-11" style={{ color: 'var(--text-md)' }}>
            From a CSV upload to 20,000 personalised messages — all in the browser in minutes.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {features.map((f) => (
              <FeatureCard
                key={f.title}
                icon={iconMap[f.icon as keyof typeof iconMap]}
                title={f.title}
                desc={f.desc}
                chips={CHIPS[f.title]}
              />
            ))}
          </div>
          <Link
            href="/features"
            className="text-teal text-[14px] font-semibold inline-flex gap-1 items-center mt-6 hover:opacity-80 transition-opacity"
          >
            See all features <ArrowRight size={15} />
          </Link>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="py-20 px-4 md:px-10 bg-white">
        <div className="max-w-[1100px] mx-auto">
          <p className="text-teal text-[11px] font-bold uppercase tracking-[0.1em] mb-2.5">
            HOW IT WORKS
          </p>
          <h2
            className="font-display font-extrabold text-navy mb-11"
            style={{ fontSize: 'clamp(26px, 3vw, 42px)' }}
          >
            From upload to report in four steps.
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 relative">
            {/* Connector line */}
            <div
              className="hidden md:block absolute top-[22px] h-px"
              style={{
                left: 'calc(12.5% + 18px)',
                right: 'calc(12.5% + 18px)',
                background: 'var(--border)',
              }}
            />
            {steps.map((s) => (
              <StepItem key={s.num} {...s} />
            ))}
          </div>

          {/* Managed callout */}
          <div
            className="mt-[26px] rounded-xl px-[22px] py-[18px] flex flex-col md:flex-row items-start md:items-center gap-3.5 border"
            style={{
              background: 'rgba(245,158,11,0.06)',
              borderColor: 'rgba(245,158,11,0.2)',
            }}
          >
            <Users size={20} className="text-amber shrink-0" />
            <div className="flex-1">
              <p className="font-display text-[13.5px] font-bold text-navy mb-1">
                Need us to handle everything?
              </p>
              <p className="text-[12.5px]" style={{ color: 'var(--text-md)' }}>
                Brief the BulkReach team. We handle contacts, message copy, dispatch, and report
                delivery — with a dedicated account manager at every stage.
              </p>
            </div>
            <Link
              href="/managed"
              className="bg-teal text-navy-dark font-display font-bold text-[13px] px-[18px] py-[9px] rounded-full shrink-0 transition hover:opacity-90"
            >
              Request managed →
            </Link>
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section className="py-20 px-4 md:px-10 bg-pricing-bg">
        <div className="max-w-[1100px] mx-auto">
          <p className="text-teal text-[11px] font-bold uppercase tracking-[0.1em] mb-2.5">
            PRICING
          </p>
          <h2
            className="font-display font-extrabold text-navy mb-2"
            style={{ fontSize: 'clamp(26px, 3vw, 42px)' }}
          >
            Simple, Ugandan pricing.
          </h2>
          <p className="text-[15px]" style={{ color: 'var(--text-md)' }}>
            All prices in UGX. Pay via MTN Mobile Money, Airtel Money, Visa, or Mastercard.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-11">
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

      {/* ── TESTIMONIALS ── */}
      <section className="py-20 px-4 md:px-10 bg-white">
        <div className="max-w-[1100px] mx-auto">
          <p className="text-teal text-[11px] font-bold uppercase tracking-[0.1em] mb-2.5">
            WHAT CLIENTS SAY
          </p>
          <h2
            className="font-display font-extrabold text-navy mb-11"
            style={{ fontSize: 'clamp(26px, 3vw, 42px)' }}
          >
            Real results from Ugandan businesses.
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-[18px]">
            {testimonials.map((t) => (
              <TestimonialCard key={t.name} {...t} />
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA BANNER ── */}
      <section className="py-[68px] px-4 md:px-10 text-center bg-navy-dark">
        <div className="max-w-[1100px] mx-auto">
          <h2
            className="font-display font-extrabold text-white mb-4"
            style={{ fontSize: 'clamp(24px, 3.5vw, 44px)' }}
          >
            Start reaching your audience{' '}
            <span className="text-teal">in the next 10 minutes.</span>
          </h2>
          <p className="text-[14.5px] mb-7" style={{ color: 'rgba(255,255,255,0.42)' }}>
            500 messages free on signup. No credit card. Full Growth features during trial.
          </p>
          <Link
            href="/signup"
            className="bg-teal text-navy-dark font-display font-bold text-[14px] px-[30px] py-[13px] rounded-full inline-flex items-center gap-2 mx-auto transition hover:opacity-90"
          >
            Create free account →
          </Link>
          <p className="text-[11.5px] mt-[13px]" style={{ color: 'rgba(255,255,255,0.22)' }}>
            Trusted by businesses across Kampala, Gulu, Jinja, and Mbarara.
          </p>
        </div>
      </section>
    </>
  )
}
