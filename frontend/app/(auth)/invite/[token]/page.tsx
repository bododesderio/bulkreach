"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Mail, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/store/auth";
import AuthCard from "@/components/auth/AuthCard";
import InputField from "@/components/auth/InputField";
import PasswordField from "@/components/auth/PasswordField";
import PasswordStrengthMeter from "@/components/auth/PasswordStrengthMeter";
import ConsentCheckbox from "@/components/auth/ConsentCheckbox";

interface Preview {
  valid: boolean;
  reason?: string | null;
  company_name?: string | null;
  email?: string | null;
  role?: string | null;
  existing_account?: boolean;
}

export default function InviteAcceptPage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const token = params.token;
  const afterAuth = useAuth((s) => s.afterAuth);

  const [preview, setPreview] = useState<Preview | null>(null);
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [retention, setRetention] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api<Preview>(`/invitations/${token}`)
      .then(setPreview)
      .catch(() => setPreview({ valid: false, reason: "error" }));
  }, [token]);

  const canSubmit = terms && privacy && retention && password.length >= 8 && !submitting;

  async function accept() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await api<{ access_token: string }>(`/invitations/${token}/accept`, {
        method: "POST",
        body: JSON.stringify({
          full_name: fullName || null,
          password,
          accept_terms: true,
          accept_privacy: true,
          accept_data_retention: true,
        }),
      });
      await afterAuth(res.access_token);
      toast.success("Welcome to the team!");
      router.push("/dashboard");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not accept invitation");
    } finally {
      setSubmitting(false);
    }
  }

  // Loading
  if (preview === null) {
    return (
      <AuthCard variant="signup">
        <div className="flex min-h-[240px] items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-teal" aria-label="Loading invitation" />
        </div>
      </AuthCard>
    );
  }

  // Invalid / expired / already accepted
  if (!preview.valid) {
    const msg =
      preview.reason === "expired"
        ? "This invitation has expired. Ask your team to send a new one."
        : preview.reason === "accepted"
        ? "This invitation has already been used."
        : "This invitation link is not valid.";
    return (
      <AuthCard variant="signup">
        <h1 className="font-display font-bold text-[24px] text-navy">Invitation unavailable</h1>
        <p className="mt-2 text-[14px] text-text-muted">{msg}</p>
        <Link href="/login" className="btn-outline mt-6 inline-flex">← Back to login</Link>
      </AuthCard>
    );
  }

  // Email already has an account (single-account membership limitation)
  if (preview.existing_account) {
    return (
      <AuthCard variant="signup">
        <h1 className="font-display font-bold text-[24px] text-navy">
          Join {preview.company_name}
        </h1>
        <p className="mt-2 text-[14px] text-text-muted">
          <span className="font-mono text-teal">{preview.email}</span> already has a BulkReach
          account. Multi-account membership isn&apos;t supported yet — please contact your account
          manager.
        </p>
        <Link href="/login" className="btn-outline mt-6 inline-flex">Go to login</Link>
      </AuthCard>
    );
  }

  // Accept form
  return (
    <AuthCard variant="signup">
      <h1 className="font-display font-bold text-[24px] text-navy">
        Join {preview.company_name}
      </h1>
      <p className="mt-1.5 text-[14px] text-text-muted">
        You&apos;ve been invited as <span className="capitalize font-medium">{preview.role}</span>.
        Set up your account to get started.
      </p>

      {/* Read-only invited email */}
      <div
        className="mt-5 flex items-center gap-2 rounded-[10px] border bg-bg px-3.5 text-text-muted"
        style={{ height: "var(--input-height)" }}
      >
        <Mail size={15} aria-hidden />
        <span className="text-[14px]">{preview.email}</span>
      </div>

      <div className="mt-4 space-y-4">
        <InputField
          id="invite-name"
          data-testid="invite-name"
          label="Your full name"
          placeholder="Grace Nakato"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
        <div>
          <PasswordField
            id="invite-password"
            data-testid="invite-password"
            label="Password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <PasswordStrengthMeter password={password} />
        </div>

        <div className="space-y-2.5 pt-1">
          <ConsentCheckbox required label="Terms of Service" href="/terms-of-service"
            checked={terms} onChange={setTerms} />
          <ConsentCheckbox required label="Privacy Policy" href="/privacy-policy"
            checked={privacy} onChange={setPrivacy} />
          <ConsentCheckbox required label="Data Retention Policy" href="/data-retention-policy"
            checked={retention} onChange={setRetention} />
        </div>

        <button
          type="button"
          onClick={accept}
          disabled={!canSubmit}
          data-testid="invite-accept"
          className="btn-primary w-full text-[15px] disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ height: "var(--input-height)" }}
        >
          {submitting ? "Joining…" : `Join ${preview.company_name}`}
        </button>
      </div>
    </AuthCard>
  );
}
