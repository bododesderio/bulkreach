import type { LucideIcon } from 'lucide-react'

interface FeatureCardProps {
  icon: LucideIcon
  title: string
  desc: string
  chips?: string[]
}

export default function FeatureCard({ icon: Icon, title, desc, chips }: FeatureCardProps) {
  return (
    <div className="bg-white border rounded-xl p-[22px] transition hover:[border-color:rgba(0,212,170,0.4)]">
      <div
        className="w-[38px] h-[38px] rounded-lg flex items-center justify-center mb-3 text-teal"
        style={{ background: 'var(--teal-light)' }}
      >
        <Icon size={17} />
      </div>
      <h3 className="font-display text-[15px] font-bold text-navy mb-1.5">{title}</h3>
      <p className="text-[13px] leading-[1.7]" style={{ color: 'var(--text-md)' }}>
        {desc}
      </p>
      {chips && chips.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2.5">
          {chips.map((chip) => (
            <span
              key={chip}
              className="bg-bg border rounded-full text-[11px] font-medium px-2 py-0.5"
              style={{ color: 'var(--text-md)' }}
            >
              {chip}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
