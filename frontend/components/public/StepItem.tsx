interface StepItemProps {
  num: string
  title: string
  desc: string
}

export default function StepItem({ num, title, desc }: StepItemProps) {
  return (
    <div className="text-center px-3.5">
      <div className="w-11 h-11 rounded-full bg-navy flex items-center justify-center mx-auto mb-4 font-display text-[15px] font-extrabold text-white relative z-[1]">
        {num}
      </div>
      <h3 className="font-display text-[14px] font-bold text-navy mb-1.5">{title}</h3>
      <p className="text-[12.5px] leading-[1.65]" style={{ color: 'var(--text-md)' }}>
        {desc}
      </p>
    </div>
  )
}
