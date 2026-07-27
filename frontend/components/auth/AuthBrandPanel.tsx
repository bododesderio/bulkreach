export type AuthVariant = "login" | "signup" | "forgot";

interface VariantContent {
  tagline: string;
  valueProps: string[];
  quote: string;
  author: string;
}

const content: Record<AuthVariant, VariantContent> = {
  login: {
    tagline: "Reach Uganda.\nOne send.",
    valueProps: [
      "20,000 recipients per batch",
      "98.4% delivery rate",
      "PDF analytics after every campaign",
    ],
    quote:
      "BulkReach cut our outreach time by 80%. Our members actually see our messages now.",
    author: "Sarah K., NGO Director",
  },
  signup: {
    tagline: "Start reaching your\naudience today.",
    valueProps: [
      "500 free messages on signup",
      "No credit card required",
      "Full Growth features during trial",
    ],
    quote:
      "Went from spreadsheets to 5,000 SMS blasts in one afternoon. Remarkable.",
    author: "James O., Marketing Lead",
  },
  forgot: {
    tagline: "We've got\nyou covered.",
    valueProps: [
      "Reset takes under 2 minutes",
      "Link expires in 1 hour",
      "Your data stays safe",
    ],
    quote:
      "BulkReach's support team helped me recover access in minutes. Great experience.",
    author: "Grace A., Business Owner",
  },
};

// Inline teal check icon — no external dependency needed
function CheckCircle() {
  return (
    <span
      aria-hidden="true"
      className="mt-0.5 shrink-0 w-5 h-5 rounded-full flex items-center justify-center"
      style={{ background: "rgba(0,212,170,0.15)" }}
    >
      <svg width="10" height="8" fill="none" viewBox="0 0 10 8">
        <path
          d="M1 4l3 3 5-6"
          stroke="#00D4AA"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

interface AuthBrandPanelProps {
  variant: AuthVariant;
}

export default function AuthBrandPanel({ variant }: AuthBrandPanelProps) {
  const { tagline, valueProps, quote, author } = content[variant];

  return (
    <div
      className="hidden md:flex flex-col justify-between shrink-0 p-12 md:min-h-[560px]"
      style={{ width: "42%", background: "var(--auth-panel-dark)" }}
    >
      {/* Top: logo + tagline + value props */}
      <div>
        {/* Logo row */}
        <div className="flex items-center gap-2.5 mb-10">
          <div
            className="w-[30px] h-[30px] flex items-center justify-center shrink-0"
            style={{ borderRadius: "7px", background: "#1B1F4A" }}
          >
            <svg width="17" height="13" fill="none" viewBox="0 0 17 13" aria-hidden="true">
              <rect x=".5" y=".5" width="16" height="12" rx="2.5" fill="#00D4AA" />
              <path d="M.5 3.5L8.5 8l8-4.5" stroke="#0D0F2E" strokeWidth="1.5" />
            </svg>
          </div>
          <span className="font-display font-extrabold text-[20px] text-white leading-none">
            BulkReach
          </span>
        </div>

        {/* Tagline */}
        <h2
          className="font-display font-extrabold text-[26px] text-white leading-tight mb-8"
          style={{ whiteSpace: "pre-line" }}
        >
          {tagline}
        </h2>

        {/* Value props */}
        <ul className="space-y-4" aria-label="Key features">
          {valueProps.map((prop) => (
            <li key={prop} className="flex items-start gap-3">
              <CheckCircle />
              <span className="text-[14px]" style={{ color: "rgba(255,255,255,0.78)" }}>
                {prop}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Bottom: testimonial */}
      <blockquote className="mt-10">
        <p className="italic text-[14px] leading-relaxed mb-3" style={{ color: "rgba(255,255,255,0.5)" }}>
          <span
            aria-hidden="true"
            className="not-italic text-[20px] leading-none mr-0.5 align-bottom"
            style={{ color: "rgba(0,212,170,0.5)" }}
          >
            &ldquo;
          </span>
          {quote}
        </p>
        <footer
          className="text-[12px] font-semibold"
          style={{ color: "var(--teal)" }}
        >
          — {author}
        </footer>
      </blockquote>
    </div>
  );
}
