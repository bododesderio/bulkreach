/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
import Navbar from '@/components/public/Navbar'
import Footer from '@/components/public/Footer'

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  // The marketing site is a fixed-brand light experience with no theme toggle;
  // `force-light` keeps it consistent even if the visitor enabled dark mode in
  // the app (the global `.dark` class would otherwise half-invert these pages).
  return (
    <div className="force-light min-h-screen bg-[var(--bg)]">
      <Navbar />
      <main>{children}</main>
      <Footer />
    </div>
  )
}
