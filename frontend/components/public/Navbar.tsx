"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowRight } from 'lucide-react'

const navLinks = [
  { href: '/features', label: 'Features' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/faq', label: 'FAQs' },
]

export default function Navbar() {
  const pathname = usePathname()

  return (
    <header
      className="sticky top-0 z-50 border-b"
      style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
    >
      <div className="h-16 px-4 md:px-12 flex items-center justify-between max-w-[1300px] mx-auto w-full">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <div className="w-[30px] h-[30px] rounded-[7px] bg-navy flex items-center justify-center">
            <svg width="17" height="13" fill="none" viewBox="0 0 17 13" aria-hidden="true">
              <rect x=".5" y=".5" width="16" height="12" rx="2.5" fill="#00D4AA" />
              <path d="M.5 3.5L8.5 8l8-4.5" stroke="#0D0F2E" strokeWidth="1.5" />
            </svg>
          </div>
          <span className="font-display text-[17px] font-extrabold text-navy">BulkReach</span>
        </Link>

        {/* Center nav links */}
        <nav className="hidden md:flex items-center gap-6" aria-label="Main navigation">
          {navLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`font-sans font-medium text-[13.5px] transition-colors hover:text-navy ${
                pathname === href ? 'text-navy' : ''
              }`}
              style={pathname !== href ? { color: 'var(--text-md)' } : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Right buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/login"
            className="border-[1.5px] bg-transparent text-[13px] rounded-full px-[18px] py-2 transition hover:border-navy"
            style={{ borderColor: 'var(--border)', color: 'var(--text-md)' }}
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="bg-teal text-navy font-display font-bold px-[18px] py-2 rounded-full inline-flex items-center gap-1.5 text-[13px] transition hover:opacity-90"
          >
            Get started
            <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    </header>
  )
}
