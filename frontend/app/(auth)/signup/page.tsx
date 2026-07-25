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
  account_name: z.string().min(2, "Enter your business name"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "At least 8 characters"),
  accept_terms: z.literal(true, {
    errorMap: () => ({ message: "You must accept all policies to continue" }),
  }),
  accept_privacy: z.literal(true, {
    errorMap: () => ({ message: "You must accept all policies to continue" }),
  }),
  accept_data_retention: z.literal(true, {
    errorMap: () => ({ message: "You must accept all policies to continue" }),
  }),
});

type Form = z.infer<typeof schema>;

export default function SignupPage() {
  const router = useRouter();
  const afterAuth = useAuth((s) => s.afterAuth);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) });

  async function onSubmit(values: Form) {
    try {
      const res = await api<{ access_token: string }>("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          account_name: values.account_name,
          email: values.email,
          password: values.password,
          accept_terms: true,
          accept_privacy: true,
          accept_data_retention: true,
        }),
      });
      await afterAuth(res.access_token);
      toast.success("Welcome to BulkReach!");
      router.push("/dashboard");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Registration failed");
    }
  }

  const consentError =
    errors.accept_terms?.message ||
    errors.accept_privacy?.message ||
    errors.accept_data_retention?.message;

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
        <h1 className="font-display font-bold text-[22px] text-navy">Create your account</h1>
        <p className="mt-1.5 text-[14px] text-text-muted">
          Start with 500 free messages. No credit card required.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
          {/* Business name */}
          <div>
            <label
              htmlFor="signup-account_name"
              className="block text-[13px] font-medium text-text-md mb-1.5"
            >
              Business name
            </label>
            <input
              {...register("account_name")}
              id="signup-account_name"
              data-testid="account_name"
              className="input"
              placeholder="Grace Co Ltd"
            />
            {errors.account_name && (
              <p className="text-error text-[13px] mt-1">{errors.account_name.message}</p>
            )}
          </div>

          {/* Email */}
          <div>
            <label
              htmlFor="signup-email"
              className="block text-[13px] font-medium text-text-md mb-1.5"
            >
              Email
            </label>
            <input
              {...register("email")}
              id="signup-email"
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
            <label
              htmlFor="signup-password"
              className="block text-[13px] font-medium text-text-md mb-1.5"
            >
              Password
            </label>
            <input
              {...register("password")}
              id="signup-password"
              data-testid="password"
              type="password"
              className="input"
              placeholder="••••••••"
            />
            <p className="text-[12px] text-text-muted mt-1">At least 8 characters</p>
            {errors.password && (
              <p className="text-error text-[13px] mt-1">{errors.password.message}</p>
            )}
          </div>

          {/* Consent checkboxes */}
          <div className="space-y-2.5 pt-1">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                {...register("accept_terms")}
                data-testid="accept_terms"
                type="checkbox"
                className="accent-[#00D4AA] mt-0.5"
              />
              <span className="text-[13px] text-text-md">I accept the Terms of Service</span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                {...register("accept_privacy")}
                data-testid="accept_privacy"
                type="checkbox"
                className="accent-[#00D4AA] mt-0.5"
              />
              <span className="text-[13px] text-text-md">I accept the Privacy Policy</span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                {...register("accept_data_retention")}
                data-testid="accept_data_retention"
                type="checkbox"
                className="accent-[#00D4AA] mt-0.5"
              />
              <span className="text-[13px] text-text-md">I accept the Data Retention Policy</span>
            </label>
            {consentError && (
              <p className="text-error text-[13px]">{consentError}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            data-testid="submit"
            className="btn-primary w-full py-3 text-[15px]"
          >
            {isSubmitting ? "Creating account…" : "Create free account"}
          </button>
        </form>

        <p className="text-[12px] text-text-muted text-center mt-2.5">
          500 free messages. No credit card.
        </p>

        <p className="mt-4 text-center text-[14px] text-text-muted">
          Already have an account?{" "}
          <Link href="/login" className="text-teal font-medium">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
