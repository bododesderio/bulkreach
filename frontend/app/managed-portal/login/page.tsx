"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/store/auth";
import AuthBackground from "@/components/auth/AuthBackground";
import AuthCard from "@/components/auth/AuthCard";
import InputField from "@/components/auth/InputField";
import PasswordField from "@/components/auth/PasswordField";

export default function ManagedPortalLogin() {
  const router = useRouter();
  const afterAuth = useAuth((s) => s.afterAuth);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setSubmitting(true);
    try {
      const res = await api<{ access_token: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      await afterAuth(res.access_token);
      const user = useAuth.getState().user;
      if (user?.user_type !== "managed_client") {
        useAuth.getState().logout();
        toast.error("This portal is for managed clients. Use the main login at /login.");
        return;
      }
      router.push(user.must_change_password ? "/managed-portal/activate" : "/managed-portal");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 py-12">
      <AuthBackground />
      <div className="relative z-10 w-full" style={{ maxWidth: "min(900px, 92vw)" }}>
        <AuthCard variant="login">
          <h1 className="font-display font-bold text-[24px] text-navy">Campaign portal</h1>
          <p className="mt-1.5 text-[14px] text-text-muted">
            Log in to view your campaign progress and documents.
          </p>

          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit();
            }}
          >
            <InputField
              id="mp-email"
              data-testid="email"
              label="Email"
              type="email"
              placeholder="you@company.ug"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <PasswordField
              id="mp-password"
              data-testid="password"
              label="Password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="submit"
              disabled={submitting || !email || !password}
              data-testid="submit"
              className="btn-primary w-full text-[15px] disabled:opacity-50"
              style={{ height: "var(--input-height)" }}
            >
              {submitting ? "Logging in…" : "Log in"}
            </button>
          </form>

          <p className="mt-5 text-center text-[13px] text-text-muted">
            Need help? Contact your account manager.
          </p>
        </AuthCard>
      </div>
    </div>
  );
}
