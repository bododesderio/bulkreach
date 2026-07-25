import Link from 'next/link'
import { MapPin } from 'lucide-react'

const productLinks = [
  { href: '/features', label: 'Features' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/managed', label: 'Managed service' },
  { href: '#', label: 'API docs' },
]

const legalLinks = [
  { href: '#', label: 'Privacy policy' },
  { href: '#', label: 'Terms of service' },
  { href: '#', label: 'Data retention' },
  { href: '#', label: 'Cookie notice' },
]

const companyLinks = [
  { href: '#', label: 'About' },
  { href: '#', label: 'Contact' },
  { href: '#', label: 'Support' },
  { href: '#', label: 'Status' },
]

function FooterLinkGroup({
  heading,
  links,
}: {
  heading: string
  links: { href: string; label: string }[]
}) {
  return (
    <div>
      <p
        className="font-display font-bold text-[10px] uppercase tracking-[0.08em] mb-3"
        style={{ color: 'rgba(255,255,255,0.8)' }}
      >
        {heading}
      </p>
      {links.map(({ href, label }) => (
        <Link
          key={label}
          href={href}
          className="block mb-2 text-[13px] transition-colors hover:text-teal"
          style={{ color: 'rgba(255,255,255,0.35)' }}
        >
          {label}
        </Link>
      ))}
    </div>
  )
}

export default function Footer() {
  return (
    <footer
      className="border-t"
      style={{ background: '#0D0F2E', borderColor: 'rgba(255,255,255,0.07)' }}
    >
      <div className="max-w-[1100px] mx-auto px-6 md:px-12 pt-10 pb-6">
        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr] gap-9 mb-[30px]">
          {/* Brand col */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-[30px] h-[30px] rounded-[7px] bg-navy flex items-center justify-center">
                <svg width="17" height="13" fill="none" viewBox="0 0 17 13" aria-hidden="true">
                  <rect x=".5" y=".5" width="16" height="12" rx="2.5" fill="#00D4AA" />
                  <path d="M.5 3.5L8.5 8l8-4.5" stroke="#0D0F2E" strokeWidth="1.5" />
                </svg>
              </div>
              <span className="font-display text-[16px] font-extrabold text-white">BulkReach</span>
            </div>
            <p
              className="text-[13px] leading-[1.7] max-w-[250px]"
              style={{ color: 'rgba(255,255,255,0.32)' }}
            >
              Uganda&apos;s professional bulk SMS &amp; email platform. Direct MTN and Airtel
              connections. Built in Kampala for East Africa.
            </p>
          </div>

          <FooterLinkGroup heading="Product" links={productLinks} />
          <FooterLinkGroup heading="Legal" links={legalLinks} />
          <FooterLinkGroup heading="Company" links={companyLinks} />
        </div>

        {/* Bottom bar */}
        <div
          className="border-t pt-[18px] flex flex-col md:flex-row justify-between items-start md:items-center gap-2"
          style={{ borderColor: 'rgba(255,255,255,0.06)' }}
        >
          <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
            &copy; 2025 BulkReach &middot; Kampala, Uganda &middot; bulkreach.ug
          </span>
          <div
            className="flex items-center gap-1.5 text-[11px]"
            style={{ color: 'rgba(255,255,255,0.2)' }}
          >
            <MapPin size={12} />
            Uganda &middot; East Africa
          </div>
        </div>
      </div>
    </footer>
  )
}
