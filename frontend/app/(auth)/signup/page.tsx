"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import AuthCard from "@/components/auth/AuthCard";
import StepDots from "@/components/auth/StepDots";
import InputField from "@/components/auth/InputField";
import PasswordField from "@/components/auth/PasswordField";
import PasswordStrengthMeter from "@/components/auth/PasswordStrengthMeter";

const schema = z.object({
  contact_name: z.string().min(2, "Enter your full name"),
  account_name: z.string().min(2, "Enter your company or organisation"),
  email: z.string().email("Enter a valid work email"),
  phone: z.string().optional(),
  password: z.string().min(8, "At least 8 characters"),
});
type Form = z.infer<typeof schema>;

const SIGNUP_KEY = "br_signup";

export default function SignupStep1() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) });

  const passwordValue = watch("password", "");

  function onSubmit(values: Form) {
    // Step 1 does NOT create the account — carry details to the consent step.
    sessionStorage.setItem(SIGNUP_KEY, JSON.stringify(values));
    router.push("/signup/consent");
  }

  return (
    <AuthCard variant="signup">
      <StepDots current={1} />
      <h1 className="font-display font-bold text-[24px] text-navy">Create your account</h1>
      <p className="mt-1.5 text-[14px] text-text-muted">500 free messages. No credit card required.</p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
        <InputField
          {...register("contact_name")}
          id="signup-contact_name"
          data-testid="contact_name"
          label="Full name"
          placeholder="Grace Nakato"
          error={errors.contact_name?.message}
        />
        <InputField
          {...register("account_name")}
          id="signup-account_name"
          data-testid="account_name"
          label="Company or organisation"
          placeholder="Grace Co Ltd"
          error={errors.account_name?.message}
        />
        <InputField
          {...register("email")}
          id="signup-email"
          data-testid="email"
          label="Work email"
          type="email"
          placeholder="you@company.com"
          error={errors.email?.message}
        />
        <InputField
          {...register("phone")}
          id="signup-phone"
          data-testid="phone"
          label="Phone (optional)"
          placeholder="+256 7XX XXX XXX"
          error={errors.phone?.message}
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

        <button
          type="submit"
          disabled={isSubmitting}
          data-testid="submit"
          className="btn-primary w-full text-[15px]"
          style={{ height: "var(--input-height)" }}
        >
          Continue →
        </button>
      </form>

      <p className="mt-5 text-center text-[14px] text-text-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-teal font-medium">Log in</Link>
      </p>
    </AuthCard>
  );
}
