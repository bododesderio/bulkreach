"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});
type Form = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const afterAuth = useAuth((s) => s.afterAuth);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) });

  async function onSubmit(values: Form) {
    try {
      const res = await api<{ access_token: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify(values),
      });
      await afterAuth(res.access_token);
      toast.success("Welcome back!");
      router.push("/dashboard");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Login failed");
    }
  }

  return (
    <div className="w-full max-w-[420px] mx-auto animate-fade-up">
      {/* Logo */}
      <div className="flex items-center justify-center gap-2.5 mb-7">
        <div className="w-[30px] h-[30px] rounded-[7px] bg-navy flex items-center justify-center shrink-0">
          <svg width="17" height="13" fill="none" viewBox="0 0 17 13" aria-hidden="true">
            <rect x=".5" y=".5" width="16" height="12" rx="2.5" fill="#00D4AA" />
            <path d="M.5 3.5L8.5 8l8-4.5" stroke="#0D0F2E" strokeWidth="1.5" />
          </svg>
        </div>
        <span className="font-display font-extrabold text-[22px] text-navy leading-none">
          BulkReach
        </span>
      </div>

      {/* Card */}
      <div className="bg-white border rounded-xl p-10">
        <h1 className="font-display font-bold text-[22px] text-navy">Welcome back</h1>
        <p className="mt-1.5 text-[14px] text-text-muted">
          Log in to your BulkReach account.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
          {/* Email */}
          <div>
            <label
              htmlFor="login-email"
              className="block text-[13px] font-medium text-text-md mb-1.5"
            >
              Email
            </label>
            <input
              {...register("email")}
              id="login-email"
              data-testid="email"
              type="email"
              className="input"
              placeholder="you@company.com"
            />
            {errors.email && (
              <p className="text-error text-[13px] mt-1">{errors.email.message}</p>
            )}
          </div>

          {/* Password */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="login-password"
                className="text-[13px] font-medium text-text-md"
              >
                Password
              </label>
              <a href="#" className="text-teal text-[13px]">
                Forgot password?
              </a>
            </div>
            <input
              {...register("password")}
              id="login-password"
              data-testid="password"
              type="password"
              className="input"
              placeholder="••••••••"
            />
            {errors.password && (
              <p className="text-error text-[13px] mt-1">{errors.password.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            data-testid="submit"
            className="btn-primary w-full py-3 text-[15px]"
          >
            {isSubmitting ? "Logging in…" : "Log in"}
          </button>
        </form>

        <p className="mt-6 text-center text-[14px] text-text-muted">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-teal font-medium">
            Start free trial →
          </Link>
        </p>
      </div>
    </div>
  );
}
