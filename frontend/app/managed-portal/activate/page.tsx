/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/store/auth";
import AuthBackground from "@/components/auth/AuthBackground";
import AuthCard from "@/components/auth/AuthCard";
import PasswordField from "@/components/auth/PasswordField";
import PasswordStrengthMeter from "@/components/auth/PasswordStrengthMeter";

export default function ManagedPortalActivate() {
  const router = useRouter();
  const { user, loadMe } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) loadMe();
  }, [user, loadMe]);

  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit = password.length >= 8 && password === confirm && !submitting;

  async function activate() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await api("/auth/activate-password", {
        method: "POST",
        auth: true,
        body: JSON.stringify({ new_password: password }),
      });
      await loadMe(); // refresh must_change_password → false
      toast.success("Password set. Welcome!");
      router.push("/managed-portal");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not set password");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 py-12">
      <AuthBackground />
      <div className="relative z-10 w-full" style={{ maxWidth: "min(900px, 92vw)" }}>
        <AuthCard variant="login">
          <h1 className="font-display font-bold text-[24px] text-navy">Set your password</h1>
          <p className="mt-1.5 text-[14px] text-text-muted">
            Create a secure password to protect your campaign portal.
          </p>

          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              activate();
            }}
          >
            <div>
              <PasswordField
                id="mp-new-password"
                data-testid="new-password"
                label="New password"
                autoComplete="new-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <PasswordStrengthMeter password={password} />
            </div>
            <PasswordField
              id="mp-confirm-password"
              data-testid="confirm-password"
              label="Confirm password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              error={mismatch ? "Passwords do not match" : undefined}
            />
            <button
              type="submit"
              disabled={!canSubmit}
              data-testid="activate-submit"
              className="btn-primary w-full text-[15px] disabled:opacity-50"
              style={{ height: "var(--input-height)" }}
            >
              {submitting ? "Saving…" : "Set password and continue"}
            </button>
          </form>
        </AuthCard>
      </div>
    </div>
  );
}
