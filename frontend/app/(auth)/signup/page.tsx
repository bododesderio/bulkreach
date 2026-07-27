"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import AuthCard from "@/components/auth/AuthCard";
import InputField from "@/components/auth/InputField";
import PasswordField from "@/components/auth/PasswordField";
import PasswordStrengthMeter from "@/components/auth/PasswordStrengthMeter";

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
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) });

  // Watch password to drive the strength meter
  const passwordValue = watch("password", "");

  // Submit logic preserved exactly — only presentation changed
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
    <AuthCard variant="signup">
      <h1 className="font-display font-bold text-[24px] text-navy">
        Create your account
      </h1>
      <p className="mt-1.5 text-[14px] text-text-muted">
        500 free messages. No credit card required.
      </p>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="mt-6 space-y-4"
        noValidate
      >
        <InputField
          {...register("account_name")}
          id="signup-account_name"
          data-testid="account_name"
          label="Business name"
          placeholder="Grace Co Ltd"
          error={errors.account_name?.message}
        />

        <InputField
          {...register("email")}
          id="signup-email"
          data-testid="email"
          label="Email"
          type="email"
          placeholder="you@company.com"
          error={errors.email?.message}
        />

        <div>
          <PasswordField
            {...register("password")}
            id="signup-password"
            data-testid="password"
            label="Password"
            placeholder="••••••••"
            error={errors.password?.message}
          />
          <PasswordStrengthMeter password={passwordValue} />
        </div>

        {/* Consent checkboxes — kept exactly as-is (testids preserved) */}
        <div className="space-y-2.5 pt-1">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              {...register("accept_terms")}
              data-testid="accept_terms"
              type="checkbox"
              className="accent-teal mt-0.5"
            />
            <span className="text-[13px] text-text-md">
              I accept the Terms of Service
            </span>
          </label>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              {...register("accept_privacy")}
              data-testid="accept_privacy"
              type="checkbox"
              className="accent-teal mt-0.5"
            />
            <span className="text-[13px] text-text-md">
              I accept the Privacy Policy
            </span>
          </label>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              {...register("accept_data_retention")}
              data-testid="accept_data_retention"
              type="checkbox"
              className="accent-teal mt-0.5"
            />
            <span className="text-[13px] text-text-md">
              I accept the Data Retention Policy
            </span>
          </label>
          {consentError && (
            <p className="text-error text-[13px]">{consentError}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          data-testid="submit"
          className="btn-primary w-full text-[15px]"
          style={{ height: "var(--input-height)" }}
        >
          {isSubmitting ? "Creating account…" : "Create free account"}
        </button>
      </form>

      <p className="mt-5 text-center text-[14px] text-text-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-teal font-medium">
          Log in
        </Link>
      </p>
    </AuthCard>
  );
}
