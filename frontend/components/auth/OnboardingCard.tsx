"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface OnboardingCardProps {
  icon: ReactNode;
  label: string;
  selected: boolean;
  onClick: () => void;
}

export default function OnboardingCard({
  icon,
  label,
  selected,
  onClick,
}: OnboardingCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex flex-col items-center gap-2 p-4 w-full",
        "rounded-[12px] border-2",
        "transition-all duration-150",
        "hover:-translate-y-0.5 hover:shadow-md",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2",
        selected
          ? "border-teal bg-teal-light"
          : "border-[var(--border)] bg-white hover:border-teal/40"
      )}
    >
      <span
        className={cn(
          "transition-colors duration-150",
          selected ? "text-teal" : "text-text-muted"
        )}
        aria-hidden="true"
      >
        {icon}
      </span>
      <span
        className={cn(
          "text-[12px] font-medium text-center leading-tight",
          selected ? "text-teal" : "text-navy"
        )}
      >
        {label}
      </span>
    </button>
  );
}
