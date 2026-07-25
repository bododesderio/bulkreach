import Link from 'next/link'
import { Check } from 'lucide-react'

interface PlanCardProps {
  name: string
  price: string
  period: string
  featured?: boolean
  badge?: string
  features: string[]
  cta: string
  managed?: boolean
  ctaHref?: string
}

export default function PlanCard({
  name,
  price,
  period,
  featured = false,
  badge,
  features,
  cta,
  managed = false,
  ctaHref = '/signup',
}: PlanCardProps) {
  return (
    <div
      className={`rounded-[13px] p-[22px] flex flex-col ${
        featured ? 'bg-navy border-2 border-navy' : 'bg-white border'
      }`}
    >
      {featured && badge && (
        <span className="bg-teal text-navy-dark text-[10px] font-bold px-2.5 py-[3px] rounded-full mb-3 self-start">
          {badge}
        </span>
      )}

      <p className={`font-display text-[18px] font-extrabold ${featured ? 'text-white' : 'text-navy'}`}>
        {name}
      </p>

      <p
        className={`font-mono font-semibold ${
          managed
            ? 'text-[19px] text-navy'
            : featured
            ? 'text-[24px] text-teal'
            : 'text-[24px] text-navy'
        }`}
      >
        {price}
      </p>

      <p
        className={`text-[12px] mb-4 ${featured ? 'text-white/[0.38]' : ''}`}
        style={!featured ? { color: 'var(--text-muted)' } : undefined}
      >
        {period}
      </p>

      <hr
        className={`my-3.5 border-0 border-t ${featured ? 'border-white/10' : ''}`}
        style={!featured ? { borderColor: 'var(--border)' } : undefined}
      />

      <ul className="flex-1">
        {features.map((feature) => (
          <li
            key={feature}
            className={`flex gap-[7px] text-[12px] mb-[9px] items-start ${
              featured ? 'text-white/[0.72]' : ''
            }`}
            style={!featured ? { color: 'var(--text-md)' } : undefined}
          >
            <Check size={13} className="text-teal shrink-0 mt-0.5" />
            {feature}
          </li>
        ))}
      </ul>

      <Link
        href={ctaHref}
        className={`mt-[18px] w-full text-center rounded-full text-[13px] font-display font-bold py-2.5 inline-block transition hover:opacity-90 ${
          featured
            ? 'bg-teal text-navy-dark'
            : managed
            ? 'border-[1.5px]'
            : 'border-[1.5px] border-teal bg-transparent text-teal'
        }`}
        style={
          managed && !featured
            ? { borderColor: 'var(--border)', color: 'var(--text-muted)' }
            : undefined
        }
      >
        {cta}
      </Link>
    </div>
  )
}
