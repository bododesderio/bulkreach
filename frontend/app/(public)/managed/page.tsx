import type { Metadata } from 'next'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { seedTestimonials } from '@/lib/seed-data'
import TestimonialCard from '@/components/public/TestimonialCard'
import { getSeo } from '@/lib/public-content'
import { pageMetadata } from '@/lib/seo'

export async function generateMetadata(): Promise<Metadata> {
  const seo = await getSeo('managed', {
    title: 'Managed Service',
    description:
      'Brief us, approve the copy, and receive a branded report. BulkReach handles contact import, message copywriting, dispatch, and analytics — end to end.',
  })
  return pageMetadata({ title: seo.title, description: seo.description, path: '/managed' })
}

const included = [
  'Dedicated account manager',
  'Contact import & validation',
  'Message copywriting',
  'Campaign dispatch',
  'Analytics PDF',
  'Branded client success report',
]

const managedStages = [
  {
    num: 1,
    title: 'Briefed',
    desc: 'Client submits brief (objective, audience, send date). Account manager notified.',
  },
  {
    num: 2,
    title: 'Copy approved',
    desc: 'Account manager writes/edits message copy. Client reviews and signs off.',
  },
  {
    num: 3,
    title: 'Scheduled',
    desc: 'Contacts imported, campaign created, send time confirmed.',
  },
  {
    num: 4,
    title: 'Sending',
    desc: 'Messages dispatching in real time. Progress visible to both sides.',
  },
  {
    num: 5,
    title: 'Complete',
    desc: 'All messages dispatched. Delivery stats finalised.',
  },
  {
    num: 6,
    title: 'Report issued',
    desc: 'Analytics PDF generated. Branded client success report emailed.',
  },
]

export default function ManagedPage() {
  return (
    <>
      {/* ── HERO ── */}
      <section className="bg-navy-dark py-16 px-4 md:px-10 text-center">
        <div className="max-w-[1100px] mx-auto">
          <p className="text-teal text-[11px] font-bold uppercase tracking-[0.1em] mb-3">
            MANAGED SERVICE
          </p>
          <h1
            className="font-display font-extrabold text-white mb-4"
            style={{ fontSize: 'clamp(32px, 3.5vw, 52px)' }}
          >
            Let us handle your campaign end to end.
          </h1>
          <p
            className="text-[16px] max-w-[520px] mx-auto"
            style={{ color: 'rgba(255,255,255,0.52)' }}
          >
            Brief us, approve the copy, and receive a branded report. We handle everything in
            between.
          </p>
        </div>
      </section>

      {/* ── WHAT'S INCLUDED ── */}
      <section className="bg-white py-20 px-4 md:px-10">
        <div className="max-w-[1100px] mx-auto">
          <p className="text-teal text-[11px] font-bold uppercase tracking-[0.1em] mb-2.5">
            WHAT&apos;S INCLUDED
          </p>
          <h2
            className="font-display font-extrabold text-navy mb-8"
            style={{ fontSize: 'clamp(22px, 2.5vw, 36px)' }}
          >
            Everything done for you.
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {included.map((item) => (
              <div
                key={item}
                className="bg-bg border rounded-xl p-5 flex items-start gap-3"
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: 'var(--teal-light)' }}
                >
                  <Check size={15} className="text-teal" />
                </div>
                <p className="font-display font-bold text-[14px] text-navy mt-1">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 6-STAGE TIMELINE ── */}
      <section className="bg-bg py-20 px-4 md:px-10">
        <div className="max-w-[1100px] mx-auto">
          <p className="text-teal text-[11px] font-bold uppercase tracking-[0.1em] mb-2.5">
            THE PROCESS
          </p>
          <h2
            className="font-display font-extrabold text-navy mb-11"
            style={{ fontSize: 'clamp(22px, 2.5vw, 36px)' }}
          >
            Six stages from brief to report.
          </h2>
          <div className="max-w-[600px]">
            {managedStages.map((stage, i) => (
              <div key={stage.num} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-teal flex items-center justify-center text-navy-dark font-display font-extrabold text-[13px] shrink-0">
                    {stage.num}
                  </div>
                  {i < managedStages.length - 1 && (
                    <div
                      className="w-px flex-1 mt-1.5"
                      style={{ background: 'var(--border)', minHeight: '24px' }}
                    />
                  )}
                </div>
                <div className={`${i < managedStages.length - 1 ? 'pb-7' : ''}`}>
                  <p className="font-display font-bold text-navy text-[14px] mb-1 leading-none mt-1">
                    {stage.title}
                  </p>
                  <p className="text-[13px] leading-[1.65]" style={{ color: 'var(--text-md)' }}>
                    {stage.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING + CTA ── */}
      <section className="bg-white py-16 px-4 md:px-10 text-center">
        <div className="max-w-[1100px] mx-auto">
          <p className="font-display font-extrabold text-navy text-[22px] mb-2">
            Custom quote per project
          </p>
          <p className="text-[14px] mb-8" style={{ color: 'var(--text-muted)' }}>
            Up to 20,000 recipients per campaign &middot; Minimum spend may apply
          </p>
          <Link
            href="/signup"
            className="bg-teal text-navy-dark font-display font-bold text-[14px] px-[30px] py-[13px] rounded-full inline-flex items-center gap-2 transition hover:opacity-90"
          >
            Request a quote
          </Link>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className="bg-bg py-20 px-4 md:px-10">
        <div className="max-w-[1100px] mx-auto">
          <p className="text-teal text-[11px] font-bold uppercase tracking-[0.1em] mb-2.5">
            WHAT CLIENTS SAY
          </p>
          <h2
            className="font-display font-extrabold text-navy mb-11"
            style={{ fontSize: 'clamp(22px, 2.5vw, 36px)' }}
          >
            Real results from Ugandan businesses.
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-[18px]">
            {seedTestimonials.map((t) => (
              <TestimonialCard key={t.name} {...t} />
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
