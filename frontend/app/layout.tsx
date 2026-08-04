import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Montserrat } from "next/font/google";
import { Toaster } from "sonner";
import { Providers } from "./providers";
import { DEFAULT_DESCRIPTION, DEFAULT_TITLE, OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo";
import "./globals.css";

const montserrat = Montserrat({ subsets: ["latin"], weight: ["500", "600", "700", "800"], variable: "--font-display" });
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-sans" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-mono" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: DEFAULT_TITLE,
    template: `%s · ${SITE_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_UG",
    url: SITE_URL,
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: [OG_IMAGE.url],
  },
};

// Runs before first paint so the theme is resolved with zero flash: an explicit
// choice in localStorage wins, otherwise fall back to the OS preference.
const NO_FLASH_THEME = `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME }} />
      </head>
      <body className={`${montserrat.variable} ${inter.variable} ${mono.variable}`}>
        <Providers>{children}</Providers>
        <Toaster richColors position="top-right" theme="system" />
      </body>
    </html>
  );
}
