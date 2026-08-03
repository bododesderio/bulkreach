"use client"

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

interface FaqItem {
  q: string
  a: string
}

interface FaqAccordionProps {
  items: FaqItem[]
}

export default function FaqAccordion({ items }: FaqAccordionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <div>
      {items.map((item, i) => (
        <div key={i} className="bg-white border rounded-xl mb-2.5">
          <button
            id={`faq-q-${i}`}
            className="w-full flex justify-between items-center p-4 text-left gap-3"
            onClick={() => setOpenIndex(openIndex === i ? null : i)}
            aria-expanded={openIndex === i}
            aria-controls={`faq-a-${i}`}
          >
            <span className="font-display font-bold text-[15px] text-navy">{item.q}</span>
            <ChevronDown
              size={16}
              className={`text-navy shrink-0 transition-transform duration-200 ${
                openIndex === i ? 'rotate-180' : ''
              }`}
            />
          </button>
          {openIndex === i && (
            <div
              id={`faq-a-${i}`}
              role="region"
              aria-labelledby={`faq-q-${i}`}
              className="text-[13.5px] leading-[1.7] px-4 pb-4"
              style={{ color: 'var(--text-md)' }}
            >
              {item.a}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
