/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
import React from 'react';
import { cn } from '@/lib/utils';

/** Shared token-backed control styling: focus ring, error state, dark-ready. */
const control =
  'w-full rounded-[10px] border border-line bg-surface px-3.5 text-sm text-fg outline-none transition ' +
  'placeholder:text-fg-muted focus:border-brand focus:ring-[3px] focus:ring-[var(--brand-050)] ' +
  'disabled:cursor-not-allowed disabled:opacity-60';
const invalid = 'border-danger focus:border-danger focus:ring-[color:rgba(239,68,68,0.15)]';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { error?: boolean }>(
  function Input({ error, className, ...rest }, ref) {
    return <input ref={ref} aria-invalid={error || undefined} className={cn(control, 'h-10', error && invalid, className)} {...rest} />;
  },
);

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: boolean }>(
  function Textarea({ error, className, ...rest }, ref) {
    return <textarea ref={ref} aria-invalid={error || undefined} className={cn(control, 'py-2.5 min-h-[96px] resize-y', error && invalid, className)} {...rest} />;
  },
);

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { error?: boolean }>(
  function Select({ error, className, children, ...rest }, ref) {
    return (
      <select ref={ref} aria-invalid={error || undefined} className={cn(control, 'h-10 pr-8', error && invalid, className)} {...rest}>
        {children}
      </select>
    );
  },
);

interface FieldProps {
  label: string;
  /** Associates the label with the control; set the same id on the input. */
  htmlFor?: string;
  hint?: React.ReactNode;
  /** Inline validation message (e.g. from react-hook-form). */
  error?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

/**
 * Label + control + hint/error wrapper. Pair with the `Input`/`Select`/`Textarea`
 * primitives (pass their `error` prop when `error` is set here). Presentational
 * so it drops straight into react-hook-form.
 */
export function Field({ label, htmlFor, hint, error, required, children, className }: FieldProps) {
  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.04em] text-fg-muted">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-[11px] font-medium text-danger">{error}</p>
      ) : (
        hint && <p className="mt-1 text-[11px] text-fg-muted">{hint}</p>
      )}
    </div>
  );
}
