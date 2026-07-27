"use client";

import React, { useState } from "react";
import { AlertCircle, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PasswordFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "id" | "type"> {
  label: string;
  id: string;
  error?: string;
  hint?: string;
}

const PasswordField = React.forwardRef<HTMLInputElement, PasswordFieldProps>(
  ({ label, id, error, hint, className, ...rest }, ref) => {
    const [show, setShow] = useState(false);

    return (
      <div>
        <label
          htmlFor={id}
          className="block text-[13px] font-semibold mb-1.5"
          style={{ color: "var(--auth-panel-dark)" }}
        >
          {label}
        </label>
        <div className="relative">
          <input
            ref={ref}
            id={id}
            type={show ? "text" : "password"}
            className={cn(
              "auth-input pr-12",
              error && "auth-input-error",
              className
            )}
            aria-invalid={error ? "true" : undefined}
            aria-describedby={
              error ? `${id}-error` : hint ? `${id}-hint` : undefined
            }
            {...rest}
          />
          {/* 44×44 px tap target for WCAG 2.1 SC 2.5.5 */}
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Hide password" : "Show password"}
            className="absolute right-0 inset-y-0 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal rounded-r-[var(--input-radius)]"
            style={{ width: "44px" }}
          >
            {show ? (
              <EyeOff size={18} className="text-text-muted" aria-hidden="true" />
            ) : (
              <Eye size={18} className="text-text-muted" aria-hidden="true" />
            )}
          </button>
        </div>
        {hint && !error && (
          <p id={`${id}-hint`} className="text-[12px] mt-1 text-text-muted">
            {hint}
          </p>
        )}
        {error && (
          <p
            id={`${id}-error`}
            role="alert"
            className="flex items-center gap-1 text-[12px] mt-1"
            style={{ color: "var(--error)" }}
          >
            <AlertCircle size={12} aria-hidden="true" />
            {error}
          </p>
        )}
      </div>
    );
  }
);
PasswordField.displayName = "PasswordField";

export default PasswordField;
