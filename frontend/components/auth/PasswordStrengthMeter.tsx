"use client";

interface Requirement {
  label: string;
  test: (p: string) => boolean;
}

const REQUIREMENTS: Requirement[] = [
  { label: "At least 8 characters", test: (p) => p.length >= 8 },
  { label: "One uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { label: "One number", test: (p) => /[0-9]/.test(p) },
  { label: "One special character", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

// score: 0–4
function getScore(password: string): number {
  return REQUIREMENTS.reduce(
    (n, req) => n + (req.test(password) ? 1 : 0),
    0
  );
}

const LABELS = ["", "Weak", "Fair", "Good", "Strong"] as const;
// Segment fill colors indexed by score (0 = unfilled)
const SEGMENT_COLORS = [
  "var(--border)",       // 0 — unfilled
  "var(--error)",        // 1 — Weak
  "var(--amber)",        // 2 — Fair
  "rgba(0,212,170,0.5)", // 3 — Good
  "var(--teal)",         // 4 — Strong
] as const;

interface PasswordStrengthMeterProps {
  password: string;
}

export default function PasswordStrengthMeter({
  password,
}: PasswordStrengthMeterProps) {
  const hasInput = password.length > 0;
  const score = getScore(password);
  const activeColor = SEGMENT_COLORS[score];

  return (
    <div className="mt-2 space-y-1.5" aria-live="polite" aria-label="Password strength">
      {/* 4-segment bar */}
      <div className="flex gap-1" role="presentation">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 h-1 rounded-full transition-all duration-300"
            style={{
              background:
                hasInput && i < score ? activeColor : "var(--border)",
            }}
          />
        ))}
      </div>

      {/* Score label */}
      {hasInput && (
        <p
          className="text-[12px] font-medium"
          style={{ color: activeColor }}
        >
          {LABELS[score]}
        </p>
      )}

      {/* Requirements — visible after first keystroke */}
      {hasInput && (
        <ul className="space-y-1 pt-0.5">
          {REQUIREMENTS.map((req) => {
            const met = req.test(password);
            return (
              <li
                key={req.label}
                className="flex items-center gap-1.5 text-[12px]"
                style={{ color: met ? "var(--teal)" : "var(--text-muted)" }}
              >
                <svg
                  width="10"
                  height="8"
                  fill="none"
                  viewBox="0 0 10 8"
                  aria-hidden="true"
                >
                  <path
                    d="M1 4l3 3 5-6"
                    stroke={met ? "var(--teal)" : "var(--text-muted)"}
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>{req.label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
