"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import AuthCard from "@/components/auth/AuthCard";
import StepDots from "@/components/auth/StepDots";
import OTPInput from "@/components/auth/OTPInput";

interface VerifyState {
  email: string;
  dev_code: string | null;
}

export default function SignupVerify() {
  const router = useRouter();
  const [state, setState] = useState<VerifyState | null>(null);
  const [error, setError] = useState(false);
  const [cooldown, setCooldown] = useState(60);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem("br_verify");
    if (!raw) {
      router.replace("/signup");
      return;
    }
    setState(JSON.parse(raw) as VerifyState);
  }, [router]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function verify(code: string) {
    if (verifying) return;
    setVerifying(true);
    setError(false);
    try {
      await api("/auth/verify-email", { method: "POST", auth: true, body: JSON.stringify({ code }) });
      router.push("/signup/onboarding");
    } catch (e) {
      setError(true);
      toast.error(e instanceof ApiError ? e.message : "Verification failed");
    } finally {
      setVerifying(false);
    }
  }

  async function resend() {
    try {
      const res = await api<{ sent: boolean; dev_code: string | null }>(
        "/auth/resend-verification",
        { method: "POST", auth: true },
      );
      if (state) {
        const next = { ...state, dev_code: res.dev_code };
        setState(next);
        sessionStorage.setItem("br_verify", JSON.stringify(next));
      }
      setCooldown(60);
      setError(false);
      toast.success("A new code has been sent.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not resend code");
    }
  }

  if (!state) return null;

  return (
    <AuthCard variant="signup">
      <StepDots current={3} />
      <h1 className="font-display font-bold text-[24px] text-navy">Check your inbox</h1>
      <p className="mt-1.5 text-[14px] text-text-muted">
        Enter the 6-digit code we sent to{" "}
        <span className="font-mono text-teal">{state.email}</span>.
      </p>

      <div className="mt-6">
        <OTPInput onComplete={verify} error={error} />
      </div>

      {state.dev_code && (
        <p className="mt-3 text-[12px] text-text-muted">
          Dev code: <span className="font-mono font-semibold">{state.dev_code}</span>
        </p>
      )}

      <div className="mt-5 flex items-center justify-between text-[13px]">
        {cooldown > 0 ? (
          <span className="text-text-muted">Resend in {cooldown}s</span>
        ) : (
          <button type="button" onClick={resend} className="text-teal font-medium">
            Resend code
          </button>
        )}
        <button
          type="button"
          onClick={() => router.push("/signup")}
          className="text-text-muted hover:text-navy"
        >
          Wrong email? Go back
        </button>
      </div>
    </AuthCard>
  );
}
