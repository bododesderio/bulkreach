"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface StepDotsProps {
  current: 1 | 2 | 3 | 4;
}

export default function StepDots({ current }: StepDotsProps) {
  return (
    <div className="flex flex-col items-center gap-1.5 mb-5">
      <div className="flex items-center gap-2.5" role="list" aria-label="Signup progress">
        {([1, 2, 3, 4] as const).map((step) => {
          const completed = step < current;
          const active = step === current;
          return (
            <div
              key={step}
              role="listitem"
              aria-label={
                completed
                  ? `Step ${step}, completed`
                  : active
                  ? `Step ${step}, current`
                  : `Step ${step}`
              }
              className={cn(
                "w-3 h-3 rounded-full flex items-center justify-center transition-all duration-200",
                completed || active
                  ? "bg-teal"
                  : "bg-transparent border-2 border-[var(--border)]"
              )}
            >
              {completed && (
                <Check
                  size={7}
                  strokeWidth={3.5}
                  color="white"
                  aria-hidden="true"
                />
              )}
            </div>
          );
        })}
      </div>
      {/* Mobile-only label */}
      <p className="text-[11px] text-text-muted md:hidden" aria-live="polite">
        Step {current} of 4
      </p>
    </div>
  );
}
