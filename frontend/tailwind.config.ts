import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  darkMode: ["class"],
  theme: {
    container: { center: true, padding: "1.5rem", screens: { "2xl": "1200px" } },
    extend: {
      colors: {
        // BulkReach approved palette (also available as CSS vars)
        navy: "#1B1F4A",
        "navy-dark": "#0D0F2E",
        teal: "#00D4AA",
        "teal-light": "rgba(0,212,170,0.12)",
        amber: "#F59E0B",
        bg: "#F7F8FC",
        text: "#1A1D2E",
        "text-md": "#4B5563",
        "text-muted": "#9CA3AF",
        "sidebar-bg": "#0F1326",
        success: "#10B981",
        warning: "#F59E0B",
        danger: "#EF4444",
        info: "#3EC9D6",
        error: "#EF4444",
        "pricing-bg": "#EEF0FA",
        // Theme-aware semantic surfaces (driven by CSS vars → auto light/dark).
        // Prefer these on re-skinned pages so dark mode is free.
        brand: { DEFAULT: "var(--brand)", 600: "var(--brand-600)", fg: "var(--brand-fg)" },
        surface: { DEFAULT: "var(--surface)", 2: "var(--surface-2)" },
        line: "var(--line)",
        fg: { DEFAULT: "var(--fg)", muted: "var(--fg-muted)" },
        // shadcn semantic tokens (client dashboard)
        border: "hsl(var(--border-hsl))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Inter", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Montserrat", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "monospace"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "calc(var(--radius) + 4px)",
      },
      boxShadow: {
        // Soft, layered shadows from the design system (theme-aware via tokens).
        "soft-sm": "var(--shadow-sm)",
        soft: "var(--shadow)",
        "soft-lg": "var(--shadow-lg)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: { "fade-up": "fade-up 0.5s ease-out both" },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
