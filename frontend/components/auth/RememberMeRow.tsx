"use client";

import Link from "next/link";

interface RememberMeRowProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export default function RememberMeRow({ checked, onChange }: RememberMeRowProps) {
  return (
    <div className="flex items-center justify-between">
      <label
        className="flex items-center gap-2 cursor-pointer select-none"
        htmlFor="remember-me"
      >
        {/* Visually hidden native checkbox — handles keyboard and a11y */}
        <input
          type="checkbox"
          id="remember-me"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />
        {/* Custom teal checkbox visual */}
        <span
          aria-hidden="true"
          className="flex items-center justify-center w-4 h-4 rounded transition-colors shrink-0"
          style={{
            border: `1.5px solid ${checked ? "var(--teal)" : "var(--border)"}`,
            background: checked ? "var(--teal)" : "transparent",
          }}
        >
          {checked && (
            <svg width="9" height="7" fill="none" viewBox="0 0 9 7">
              <path
                d="M1 3.5l2.5 2.5 4.5-5"
                stroke="#0D0F2E"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </span>
        <span className="text-[13px] text-text-md">Remember me for 30 days</span>
      </label>

      <Link
        href="/forgot-password"
        className="text-[13px] font-medium text-teal hover:opacity-80 transition-opacity"
      >
        Forgot password?
      </Link>
    </div>
  );
}
