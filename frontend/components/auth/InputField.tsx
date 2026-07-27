"use client";

import React from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// id is required for a11y label association
export interface InputFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  id: string;
  error?: string;
  hint?: string;
}

const InputField = React.forwardRef<HTMLInputElement, InputFieldProps>(
  ({ label, id, error, hint, className, ...rest }, ref) => {
    return (
      <div>
        <label
          htmlFor={id}
          className="block text-[13px] font-semibold mb-1.5"
          style={{ color: "var(--auth-panel-dark)" }}
        >
          {label}
        </label>
        <input
          ref={ref}
          id={id}
          className={cn(
            "auth-input",
            error && "auth-input-error",
            className
          )}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          {...rest}
        />
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
InputField.displayName = "InputField";

export default InputField;
