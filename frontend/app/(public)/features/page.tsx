import type { Metadata } from 'next'
import { Upload, Code, LayoutGrid, BarChart2, Award, Clock, Check } from 'lucide-react'
import { seedFeatures } from '@/lib/seed-data'
import FeatureCard from '@/components/public/FeatureCard'

export const metadata: Metadata = {
  title: 'Features — BulkReach',
  description:
    'BulkReach handles contact import, personalisation, dispatch, reporting, and compliance — so you can focus on the message.',
}

const iconMap = { Upload, Code, LayoutGrid, BarChart2, Award, Clock }

const fileFormats = [
  {
    format: 'CSV',
    ext: '.csv',
    library: 'pandas / csv',
    notes: 'Encoding auto-detected, delimiter sniffed',
  },
  {
    format: 'Excel',
    ext: '.xlsx / .xls',
    library: 'openpyxl via pandas',
    notes: 'First sheet used',
  },
  {
    format: 'Word',
    ext: '.docx',
    library: 'python-docx',
    notes: 'First table extracted',
  },
  {
    format: 'PDF',
    ext: '.pdf',
    library: 'pdfplumber',
    notes: 'Tables from all pages, concatenated',
  },
  {
    format: 'Paste text',
    ext: '—',
    library: 'Custom split',
    notes: 'No column headers — personalisation unavailable',
  },
]

const mergeExamples = [
  {
    template: 'Dear {{first_name}}, your balance is UGX {{amount}}.',
    rendered: 'Dear Grace, your balance is UGX 450,000.',
  },
  {
    template: '{{first_name}} {{last_name}} — ref {{reference}}',
    rendered: 'Grace Nakato — ref REF-00124',
  },
  {
    template: 'Invoice {{invoice_no}} due {{due_date}}',
    rendered: 'Invoice INV-2025-001 due Friday',
  },
]

const selfServiceItems = [
  'Upload contacts from CSV, Excel, Word, PDF, or paste',
  'Write SMS, email, or both in the browser',
  'Insert merge tags and preview per-recipient',
  'Schedule for a future date or send immediately',
  'Track send progress live in the dashboard',
  'Download auto-generated PDF analytics report',
]

const managedItems = [
  'Submit a brief — audience, objective, send date',
  'Account manager assigned within 2 hours',
  'Contacts imported and validated by our team',
  'Message copy written, reviewed, and approved',
  'Campaign dispatched with real-time monitoring',
  'Branded client success report emailed on completion',
]

export default function FeaturesPage() {
  return (
    <>
      {/* ── HERO ── */}
      <section className="bg-navy-dark py-16 px-4 md:px-10 text-center">
        <div className="max-w-[1100px] mx-auto">
          <p className="text-teal text-[11px] font-bold uppercase tracking-[0.1em] mb-3">
            PLATFORM FEATURES
          </p>
          <h1
            className="font-display font-extrabold text-white mb-4"
            style={{ fontSize: 'clamp(32px, 3.5vw, 52px)' }}
          >
            Every tool to send campaigns that actually land.
          </h1>
          <p
            className="text-[16px] max-w-[560px] mx-auto"
            style={{ color: 'rgba(255,255,255,0.52)' }}
          >
            BulkReach handles contact import, personalisation, dispatch, reporting, and compliance
            — so you can focus on the message.
          </p>
        </div>
      </section>

      {/* ── ALL FEATURE CARDS ── */}
      <section className="py-20 px-4 md:px-10 bg-white">
        <div className="max-w-[1100px] mx-auto grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {seedFeatures.map((f) => (
            <FeatureCard
              key={f.title}
              icon={iconMap[f.icon as keyof typeof iconMap]}
              title={f.title}
              desc={f.desc}
              chips={f.chips}
            />
          ))}
        </div>
      </section>

      {/* ── FILE FORMAT TABLE ── */}
      <section className="bg-white py-20 px-4 md:px-10">
        <div className="max-w-[700px] mx-auto">
          <p className="text-teal text-[11px] font-bold uppercase tracking-[0.1em] mb-2.5">
            CONTACT IMPORT
          </p>
          <h2
            className="font-display font-extrabold text-navy mb-8"
            style={{ fontSize: 'clamp(22px, 2.5vw, 36px)' }}
          >
            Upload contacts from anything.
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Format', 'Extension', 'Library', 'Notes'].map((h) => (
                    <th
                      key={h}
                      className="text-[10px] uppercase pb-2 pr-4 font-semibold"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fileFormats.map((row) => (
                  <tr key={row.format} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td className="text-[13px] py-3 pr-4 font-medium text-navy">{row.format}</td>
                    <td className="text-[13px] py-3 pr-4 font-mono" style={{ color: 'var(--text-md)' }}>
                      {row.ext}
                    </td>
                    <td className="text-[13px] py-3 pr-4" style={{ color: 'var(--text-md)' }}>
                      {row.library}
                    </td>
                    <td className="text-[13px] py-3" style={{ color: 'var(--text-muted)' }}>
                      {row.notes}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── MERGE TAGS ── */}
      <section className="bg-bg py-20 px-4 md:px-10">
        <div className="max-w-[1100px] mx-auto">
          <p className="text-teal text-[11px] font-bold uppercase tracking-[0.1em] mb-2.5">
            PERSONALISATION
          </p>
          <h2
            className="font-display font-extrabold text-navy mb-8"
            style={{ fontSize: 'clamp(22px, 2.5vw, 36px)' }}
          >
            Every message is rendered individually.
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {mergeExamples.map((ex, i) => (
              <div key={i} className="bg-white border rounded-xl p-5">
                <div className="bg-navy-dark rounded p-2 text-[12px] font-mono text-teal mb-3">
                  {ex.template}
                </div>
                <p className="text-[13px]" style={{ color: 'var(--text-md)' }}>
                  <span className="font-semibold text-navy">→ </span>
                  {ex.rendered}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SELF-SERVICE VS MANAGED ── */}
      <section className="bg-white py-20 px-4 md:px-10">
        <div className="max-w-[1100px] mx-auto">
          <p className="text-teal text-[11px] font-bold uppercase tracking-[0.1em] mb-2.5">
            SERVICE OPTIONS
          </p>
          <h2
            className="font-display font-extrabold text-navy mb-8"
            style={{ fontSize: 'clamp(22px, 2.5vw, 36px)' }}
          >
            Choose how you work.
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Self-service */}
            <div className="bg-bg border rounded-xl p-6">
              <h3 className="font-display font-extrabold text-[18px] text-navy mb-4">
                Self-service
              </h3>
              <ul className="space-y-2.5">
                {selfServiceItems.map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <Check size={14} className="text-teal shrink-0 mt-0.5" />
                    <span className="text-[13px]" style={{ color: 'var(--text-md)' }}>
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            {/* Managed */}
            <div className="bg-navy border rounded-xl p-6">
              <h3 className="font-display font-extrabold text-[18px] text-white mb-4">
                Managed service
              </h3>
              <ul className="space-y-2.5">
                {managedItems.map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <Check size={14} className="text-teal shrink-0 mt-0.5" />
                    <span className="text-[13px] text-white/[0.72]">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
