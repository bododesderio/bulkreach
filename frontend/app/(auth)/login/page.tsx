/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import AuthCard from "@/components/auth/AuthCard";
import InputField from "@/components/auth/InputField";
import PasswordField from "@/components/auth/PasswordField";
import RememberMeRow from "@/components/auth/RememberMeRow";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});
type Form = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const afterAuth = useAuth((s) => s.afterAuth);
  const [rememberMe, setRememberMe] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) });

  // Submit logic preserved exactly — only presentation changed
  async function onSubmit(values: Form) {
    try {
      const res = await api<{ access_token: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify(values),
      });
      await afterAuth(res.access_token);
      toast.success("Welcome back!");
      // Role-based landing: superadmins go to the admin portal.
      const role = useAuth.getState().user?.role;
      router.push(role === "superadmin" ? "/admin" : "/dashboard");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Login failed");
    }
  }

  return (
    <AuthCard variant="login">
      <h1 className="font-display font-bold text-[24px] text-navy">
        Welcome back
      </h1>
      <p className="mt-1.5 text-[14px] text-text-muted">
        Log in to your BulkReach account.
      </p>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="mt-6 space-y-4"
        noValidate
      >
        <InputField
          {...register("email")}
          id="login-email"
          data-testid="email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          error={errors.email?.message}
        />

        <PasswordField
          {...register("password")}
          id="login-password"
          data-testid="password"
          label="Password"
          autoComplete="current-password"
          placeholder="••••••••"
          error={errors.password?.message}
        />

        <RememberMeRow checked={rememberMe} onChange={setRememberMe} />

        <button
          type="submit"
          disabled={isSubmitting}
          data-testid="submit"
          className="btn-primary w-full text-[15px]"
          style={{ height: "var(--input-height)" }}
        >
          {isSubmitting ? "Logging in…" : "Log in"}
        </button>
      </form>

      <p className="mt-6 text-center text-[14px] text-text-muted">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="text-teal font-medium">
          Get started →
        </Link>
      </p>
    </AuthCard>
  );
}
