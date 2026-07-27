"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2, PiggyBank, Heart, ShoppingBag, Landmark, Stethoscope, Wheat,
  MoreHorizontal, MessageSquare, Mail, LayoutGrid, Users, Globe, Search, UserCheck,
} from "lucide-react";
import { api } from "@/lib/api";
import AuthCard from "@/components/auth/AuthCard";
import StepDots from "@/components/auth/StepDots";
import OnboardingCard from "@/components/auth/OnboardingCard";

const ICON = 22;
const INDUSTRIES = [
  { key: "microfinance", label: "Microfinance", icon: <Building2 size={ICON} /> },
  { key: "sacco", label: "SACCO", icon: <PiggyBank size={ICON} /> },
  { key: "ngo", label: "NGO / Non-profit", icon: <Heart size={ICON} /> },
  { key: "retail", label: "Retail", icon: <ShoppingBag size={ICON} /> },
  { key: "government", label: "Government", icon: <Landmark size={ICON} /> },
  { key: "healthcare", label: "Healthcare", icon: <Stethoscope size={ICON} /> },
  { key: "agriculture", label: "Agriculture", icon: <Wheat size={ICON} /> },
  { key: "other", label: "Other", icon: <MoreHorizontal size={ICON} /> },
];
const USE_CASES = [
  { key: "sms", label: "SMS campaigns", icon: <MessageSquare size={ICON} /> },
  { key: "email", label: "Email campaigns", icon: <Mail size={ICON} /> },
  { key: "both", label: "Both SMS & email", icon: <LayoutGrid size={ICON} /> },
];
const REFERRALS = [
  { key: "referral", label: "Referral from a friend", icon: <Users size={ICON} /> },
  { key: "social", label: "Social media", icon: <Globe size={ICON} /> },
  { key: "google", label: "Google search", icon: <Search size={ICON} /> },
  { key: "team", label: "BulkReach team", icon: <UserCheck size={ICON} /> },
  { key: "other", label: "Other", icon: <MoreHorizontal size={ICON} /> },
];

export default function SignupOnboarding() {
  const router = useRouter();
  const [q, setQ] = useState<1 | 2 | 3>(1);
  const [industry, setIndustry] = useState<string | null>(null);
  const [useCases, setUseCases] = useState<string[]>([]);
  const [referral, setReferral] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function finish() {
    setSaving(true);
    const payload: Record<string, unknown> = {};
    if (industry) payload.industry = industry;
    if (useCases.length) payload.use_case = useCases;
    if (referral) payload.referral_source = referral;
    try {
      if (Object.keys(payload).length) {
        await api("/auth/onboarding", { method: "PATCH", auth: true, body: JSON.stringify(payload) });
      }
    } catch {
      /* onboarding is best-effort — never block the user from the dashboard */
    } finally {
      router.push("/dashboard");
    }
  }

  function toggleUseCase(key: string) {
    setUseCases((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  return (
    <AuthCard variant="signup">
      <StepDots current={4} />
      <h1 className="font-display font-bold text-[24px] text-navy">
        Let&apos;s personalise your experience
      </h1>
      <p className="mt-1.5 text-[14px] text-text-muted">
        This helps us show you the right things. Skip if you prefer.
      </p>

      {q === 1 && (
        <div className="mt-6">
          <p className="text-[14px] font-semibold text-navy mb-3">What industry are you in?</p>
          <div className="grid grid-cols-2 gap-2.5">
            {INDUSTRIES.map((o) => (
              <OnboardingCard key={o.key} icon={o.icon} label={o.label}
                selected={industry === o.key} onClick={() => setIndustry(o.key)} />
            ))}
          </div>
          <div className="mt-5 flex items-center justify-between">
            <button type="button" className="text-[13px] text-text-muted" onClick={() => setQ(2)}>
              Skip this question
            </button>
            {industry && (
              <button type="button" className="btn-primary px-5" onClick={() => setQ(2)}>Continue →</button>
            )}
          </div>
        </div>
      )}

      {q === 2 && (
        <div className="mt-6">
          <p className="text-[14px] font-semibold text-navy mb-3">What will you mainly send?</p>
          <div className="grid grid-cols-3 gap-2.5">
            {USE_CASES.map((o) => (
              <OnboardingCard key={o.key} icon={o.icon} label={o.label}
                selected={useCases.includes(o.key)} onClick={() => toggleUseCase(o.key)} />
            ))}
          </div>
          <div className="mt-5 flex items-center justify-between">
            <button type="button" className="text-[13px] text-text-muted" onClick={() => setQ(3)}>
              Skip this question
            </button>
            {useCases.length > 0 && (
              <button type="button" className="btn-primary px-5" onClick={() => setQ(3)}>Continue →</button>
            )}
          </div>
        </div>
      )}

      {q === 3 && (
        <div className="mt-6">
          <p className="text-[14px] font-semibold text-navy mb-3">How did you hear about BulkReach?</p>
          <div className="grid grid-cols-2 gap-2.5">
            {REFERRALS.map((o) => (
              <OnboardingCard key={o.key} icon={o.icon} label={o.label}
                selected={referral === o.key} onClick={() => setReferral(o.key)} />
            ))}
          </div>
          <div className="mt-5 flex items-center justify-between">
            <button type="button" className="text-[13px] text-text-muted" disabled={saving} onClick={finish}>
              Skip
            </button>
            <button type="button" className="btn-primary px-5" disabled={saving} onClick={finish}>
              {saving ? "Finishing…" : "Finish setup →"}
            </button>
          </div>
        </div>
      )}
    </AuthCard>
  );
}
