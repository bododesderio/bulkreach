import type { Metadata } from 'next'
import StepItem from '@/components/public/StepItem'

export const metadata: Metadata = {
  title: 'How It Works — BulkReach',
  description:
    'From CSV upload to PDF report in four steps. Or brief our managed team and receive a branded report — we handle everything in between.',
}

const selfServiceSteps = [
  {
    num: '01',
    title: 'Upload contacts',
    desc: 'Drop in a CSV, Excel (.xlsx/.xls), Word (.docx), or PDF file — or paste a comma/newline-separated list directly. Phone and email columns are detected automatically from headers or by sampling values. No reformatting needed.',
  },
  {
    num: '02',
    title: 'Write your message',
    desc: 'Compose SMS, email, or both channels in one campaign. Insert {{merge_tags}} from your column headers. Preview exactly how each recipient\'s message will look before you send — no surprises.',
  },
  {
    num: '03',
    title: 'Send or schedule',
    desc: 'Hit send now, or pick a future date and time (East Africa Time). Watch progress stream live on your dashboard as messages dispatch in real time. Failed messages are retried automatically up to 3×.',
  },
  {
    num: '04',
    title: 'Download your report',
    desc: 'A PDF analytics report is auto-generated the moment your campaign completes. Delivery rates, open rates, time-series charts, and full failure analysis — ready to share with your client or leadership.',
  },
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

export default function HowItWorksPage() {
  return (
    <>
      {/* ── HERO ── */}
      <section className="bg-navy-dark py-16 px-4 md:px-10 text-center">
        <div className="max-w-[1100px] mx-auto">
          <p className="text-teal text-[11px] font-bold uppercase tracking-[0.1em] mb-3">
            HOW IT WORKS
          </p>
          <h1
            className="font-display font-extrabold text-white mb-4"
            style={{ fontSize: 'clamp(32px, 3.5vw, 52px)' }}
          >
            From upload to report in four steps.
          </h1>
          <p
            className="text-[16px] max-w-[520px] mx-auto"
            style={{ color: 'rgba(255,255,255,0.52)' }}
          >
            Self-service in minutes, or hand it to our team and receive a branded client report —
            your choice.
          </p>
        </div>
      </section>

      {/* ── SELF-SERVICE STEPS (expanded) ── */}
      <section className="bg-white py-20 px-4 md:px-10">
        <div className="max-w-[1100px] mx-auto">
          <p className="text-teal text-[11px] font-bold uppercase tracking-[0.1em] mb-2.5">
            SELF-SERVICE
          </p>
          <h2
            className="font-display font-extrabold text-navy mb-11"
            style={{ fontSize: 'clamp(22px, 2.5vw, 36px)' }}
          >
            You&apos;re in control from start to finish.
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
            {selfServiceSteps.map((s) => (
              <StepItem key={s.num} {...s} />
            ))}
          </div>
        </div>
      </section>

      {/* ── MANAGED WORKFLOW ── */}
      <section className="bg-bg py-20 px-4 md:px-10">
        <div className="max-w-[1100px] mx-auto">
          <p className="text-teal text-[11px] font-bold uppercase tracking-[0.1em] mb-2.5">
            MANAGED SERVICE
          </p>
          <h2
            className="font-display font-extrabold text-navy mb-11"
            style={{ fontSize: 'clamp(22px, 2.5vw, 36px)' }}
          >
            Six stages from brief to report.
          </h2>

          {/* Vertical timeline */}
          <div className="max-w-[600px]">
            {managedStages.map((stage, i) => (
              <div key={stage.num} className="flex gap-4">
                {/* Timeline spine */}
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-teal flex items-center justify-center text-navy-dark font-display font-extrabold text-[13px] shrink-0">
                    {stage.num}
                  </div>
                  {i < managedStages.length - 1 && (
                    <div
                      className="w-px flex-1 mt-1.5 mb-0"
                      style={{ background: 'var(--border)', minHeight: '24px' }}
                    />
                  )}
                </div>
                {/* Content */}
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
    </>
  )
}
