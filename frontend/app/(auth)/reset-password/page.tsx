/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "@/lib/api";
import AuthCard from "@/components/auth/AuthCard";
import PasswordField from "@/components/auth/PasswordField";

const schema = z
  .object({
    password: z.string().min(8, "At least 8 characters"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });
type Form = z.infer<typeof schema>;

function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) });

  async function onSubmit(values: Form) {
    try {
      await api("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, new_password: values.password }),
      });
      toast.success("Password updated — please log in.");
      router.push("/login");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reset link is invalid or expired");
    }
  }

  if (!token) {
    return (
      <>
        <h1 className="font-display font-bold text-[24px] text-navy">Invalid reset link</h1>
        <p className="mt-1.5 text-[14px] text-text-muted">
          This link is missing its token or has already been used. Request a new one.
        </p>
        <p className="mt-6 text-center text-[14px] text-text-muted">
          <Link href="/forgot-password" className="text-teal font-medium">Send a new reset link →</Link>
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="font-display font-bold text-[24px] text-navy">Set a new password</h1>
      <p className="mt-1.5 text-[14px] text-text-muted">Choose a strong password you don&apos;t use elsewhere.</p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
        <PasswordField
          {...register("password")}
          id="reset-password"
          data-testid="password"
          label="New password"
          autoComplete="new-password"
          placeholder="••••••••"
          error={errors.password?.message}
        />
        <PasswordField
          {...register("confirm")}
          id="reset-confirm"
          data-testid="confirm"
          label="Confirm password"
          autoComplete="new-password"
          placeholder="••••••••"
          error={errors.confirm?.message}
        />
        <button
          type="submit"
          disabled={isSubmitting}
          data-testid="submit"
          className="btn-primary w-full text-[15px]"
          style={{ height: "var(--input-height)" }}
        >
          {isSubmitting ? "Updating…" : "Update password"}
        </button>
      </form>

      <p className="mt-6 text-center text-[14px] text-text-muted">
        <Link href="/login" className="text-teal font-medium">← Back to log in</Link>
      </p>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthCard variant="forgot">
      <Suspense fallback={<p className="text-[14px] text-text-muted">Loading…</p>}>
        <ResetForm />
      </Suspense>
    </AuthCard>
  );
}
