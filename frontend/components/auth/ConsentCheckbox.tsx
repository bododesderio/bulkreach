"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

interface ConsentCheckboxProps {
  label: string;
  description?: string;
  href?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  required?: boolean;
}

export default function ConsentCheckbox({
  label,
  description,
  href,
  checked,
  onChange,
  required,
}: ConsentCheckboxProps) {
  return (
    // label wraps the checkbox so clicking anywhere in the card toggles it
    <label
      className={cn(
        "flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer",
        "transition-all duration-150 select-none",
        checked
          ? "border-teal bg-teal-light"
          : "border-[var(--border)] bg-white hover:border-teal/40"
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        required={required}
        aria-label={label}
        className="mt-0.5 w-4 h-4 accent-teal shrink-0"
      />
      <div className="flex-1 min-w-0">
        <span
          className="text-[13px] font-medium leading-snug"
          style={{ color: "var(--auth-panel-dark)" }}
        >
          {href ? (
            <Link
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-teal underline underline-offset-2 hover:opacity-80"
              // stopPropagation so link navigation doesn't also toggle the checkbox
              onClick={(e) => e.stopPropagation()}
            >
              {label}
            </Link>
          ) : (
            label
          )}
          {required && (
            <span className="text-error ml-0.5" aria-hidden="true">
              *
            </span>
          )}
        </span>
        {description && (
          <p className="text-[12px] mt-0.5 text-text-muted leading-snug">
            {description}
          </p>
        )}
      </div>
    </label>
  );
}
