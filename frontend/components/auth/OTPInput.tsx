/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
"use client";

import {
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ClipboardEvent,
} from "react";
import { cn } from "@/lib/utils";

interface OTPInputProps {
  onComplete: (code: string) => void;
  error?: boolean;
}

export default function OTPInput({ onComplete, error = false }: OTPInputProps) {
  const [values, setValues] = useState<string[]>(["", "", "", "", "", ""]);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  function focusAt(i: number) {
    inputRefs.current[i]?.focus();
  }

  function handleChange(i: number, e: ChangeEvent<HTMLInputElement>) {
    // Strip non-digits; take the last digit (handles "old+new" value strings)
    const digit = e.target.value.replace(/\D/g, "").slice(-1);
    const next = [...values];
    next[i] = digit;
    setValues(next);
    if (digit && i < 5) focusAt(i + 1);
    if (digit && next.every((v) => v !== "")) onComplete(next.join(""));
  }

  function handleKeyDown(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      e.preventDefault(); // prevent onChange double-fire
      const next = [...values];
      if (next[i]) {
        next[i] = "";
        setValues(next);
      } else if (i > 0) {
        next[i - 1] = "";
        setValues(next);
        focusAt(i - 1);
      }
    } else if (e.key === "ArrowLeft" && i > 0) {
      focusAt(i - 1);
    } else if (e.key === "ArrowRight" && i < 5) {
      focusAt(i + 1);
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    // charAt returns "" for out-of-range indices — no undefined
    const next = Array.from({ length: 6 }, (_, idx) => pasted.charAt(idx));
    setValues(next);
    focusAt(Math.min(pasted.length, 5));
    if (pasted.length === 6) onComplete(pasted);
  }

  return (
    <div>
      <div
        role="group"
        aria-label="6-digit verification code"
        className="flex gap-2 sm:gap-3"
      >
      {values.map((val, i) => (
        <input
          key={i}
          ref={(el) => {
            inputRefs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          value={val}
          aria-label={`Digit ${i + 1} of 6`}
          aria-invalid={error}
          aria-describedby={error ? "otp-error" : undefined}
          autoComplete={i === 0 ? "one-time-code" : "off"}
          className={cn(
            // Sizing — mobile first, then sm:
            "w-[44px] h-[56px] sm:w-[52px] sm:h-[64px]",
            // Typography
            "text-center text-[22px] font-mono font-bold",
            // Base shape
            "border-2 rounded-lg bg-white",
            // Focus ring
            "focus:outline-none focus:ring-2 focus:ring-offset-0 transition-all duration-150",
            // State variants
            error
              ? "border-error text-error focus:ring-error/20"
              : val
              ? "border-teal bg-teal-light text-navy focus:ring-teal/20"
              : "border-[var(--border)] text-navy focus:border-teal focus:ring-teal/20"
          )}
          onChange={(e) => handleChange(i, e)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
        />
      ))}
      </div>
      {error && (
        <p id="otp-error" role="alert" className="mt-2 text-[12px] font-medium text-error">
          That code isn&apos;t right. Check the 6 digits and try again.
        </p>
      )}
    </div>
  );
}
