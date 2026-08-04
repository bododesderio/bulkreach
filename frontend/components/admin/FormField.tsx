/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
interface FormFieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
}

export default function FormField({ label, htmlFor, hint, children }: FormFieldProps) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-fg-muted mb-1.5"
      >
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-fg-muted mt-1">{hint}</p>}
    </div>
  );
}
