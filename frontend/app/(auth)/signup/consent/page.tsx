"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/store/auth";
import AuthCard from "@/components/auth/AuthCard";
import StepDots from "@/components/auth/StepDots";
import ConsentCheckbox from "@/components/auth/ConsentCheckbox";

const SIGNUP_KEY = "br_signup";

interface Step1 {
  contact_name: string;
  account_name: string;
  email: string;
  phone?: string;
  password: string;
}

interface CompleteResponse {
  access_token: string;
  email: string;
  dev_code: string | null;
}

export default function SignupConsent() {
  const router = useRouter();
  const afterAuth = useAuth((s) => s.afterAuth);
  const [step1, setStep1] = useState<Step1 | null>(null);
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [retention, setRetention] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem(SIGNUP_KEY);
    if (!raw) {
      router.replace("/signup");
      return;
    }
    setStep1(JSON.parse(raw) as Step1);
  }, [router]);

  const canSubmit = terms && privacy && retention && !submitting;

  async function createAccount() {
    if (!step1 || !canSubmit) return;
    setSubmitting(true);
    try {
      const res = await api<CompleteResponse>("/auth/signup/complete", {
        method: "POST",
        body: JSON.stringify({
          account_name: step1.account_name,
          contact_name: step1.contact_name,
          email: step1.email,
          phone: step1.phone || null,
          password: step1.password,
          accept_terms: true,
          accept_privacy: true,
          accept_data_retention: true,
          accept_marketing: marketing,
        }),
      });
      await afterAuth(res.access_token);
      sessionStorage.setItem(
        "br_verify",
        JSON.stringify({ email: res.email, dev_code: res.dev_code }),
      );
      sessionStorage.removeItem(SIGNUP_KEY);
      router.push("/signup/verify");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not create account");
    } finally {
      setSubmitting(false);
    }
  }

  if (!step1) return null;

  return (
    <AuthCard variant="signup">
      <StepDots current={2} />
      <h1 className="font-display font-bold text-[24px] text-navy">Before you get started</h1>
      <p className="mt-1.5 text-[14px] text-text-muted">
        BulkReach handles campaign and contact data on your behalf. Please read and accept the following.
      </p>

      <div className="mt-6 space-y-2.5">
        <ConsentCheckbox
          required
          label="Terms of Service"
          description="The rules for using BulkReach fairly and legally."
          href="/terms-of-service"
          checked={terms}
          onChange={setTerms}
        />
        <ConsentCheckbox
          required
          label="Privacy Policy"
          description="How we collect, use, and protect your personal data."
          href="/privacy-policy"
          checked={privacy}
          onChange={setPrivacy}
        />
        <ConsentCheckbox
          required
          label="Data Retention Policy"
          description="How long we keep your campaign and contact data."
          href="/data-retention-policy"
          checked={retention}
          onChange={setRetention}
        />
        <div className="pt-1.5">
          <ConsentCheckbox
            label="Product updates and offers"
            description="Occasional emails about new features and promotions. Optional."
            checked={marketing}
            onChange={setMarketing}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={createAccount}
        disabled={!canSubmit}
        data-testid="create-account"
        className="btn-primary w-full text-[15px] mt-6 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ height: "var(--input-height)" }}
      >
        {submitting ? "Creating account…" : "Create my account"}
      </button>
    </AuthCard>
  );
}
