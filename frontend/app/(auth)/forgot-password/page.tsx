/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "@/lib/api";
import AuthCard from "@/components/auth/AuthCard";
import InputField from "@/components/auth/InputField";

const schema = z.object({ email: z.string().email("Enter a valid email") });
type Form = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) });

  async function onSubmit(values: Form) {
    try {
      // The backend always returns the same non-revealing message; we mirror that.
      await api("/auth/forgot-password", { method: "POST", body: JSON.stringify(values) });
      setSent(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send reset link");
    }
  }

  return (
    <AuthCard variant="forgot">
      {sent ? (
        <>
          <h1 className="font-display font-bold text-[24px] text-navy">Check your inbox</h1>
          <p className="mt-1.5 text-[14px] text-text-muted">
            If an account exists for <span className="font-semibold text-navy">{getValues("email")}</span>,
            we&apos;ve sent a password-reset link. It expires in 1 hour.
          </p>
          <p className="mt-6 text-center text-[14px] text-text-muted">
            <Link href="/login" className="text-teal font-medium">← Back to log in</Link>
          </p>
        </>
      ) : (
        <>
          <h1 className="font-display font-bold text-[24px] text-navy">Forgot your password?</h1>
          <p className="mt-1.5 text-[14px] text-text-muted">
            Enter your account email and we&apos;ll send you a reset link.
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
            <InputField
              {...register("email")}
              id="forgot-email"
              data-testid="email"
              label="Email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              error={errors.email?.message}
            />
            <button
              type="submit"
              disabled={isSubmitting}
              data-testid="submit"
              className="btn-primary w-full text-[15px]"
              style={{ height: "var(--input-height)" }}
            >
              {isSubmitting ? "Sending…" : "Send reset link"}
            </button>
          </form>

          <p className="mt-6 text-center text-[14px] text-text-muted">
            Remembered it?{" "}
            <Link href="/login" className="text-teal font-medium">Log in →</Link>
          </p>
        </>
      )}
    </AuthCard>
  );
}
