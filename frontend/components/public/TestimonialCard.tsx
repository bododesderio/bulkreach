interface TestimonialCardProps {
  quote: string
  name: string
  role: string
}

export default function TestimonialCard({ quote, name, role }: TestimonialCardProps) {
  return (
    <div className="bg-bg border rounded-xl p-[22px]">
      <span className="font-display text-[34px] text-teal block mb-[5px] leading-none">&ldquo;</span>
      <p className="text-[13.5px] leading-[1.75] italic mb-[18px]" style={{ color: 'var(--text-md)' }}>
        {quote}
      </p>
      <p className="font-display font-bold text-[13px] text-navy">{name}</p>
      <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
        {role}
      </p>
    </div>
  )
}
