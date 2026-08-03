/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Mail, FileText, LogOut, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useApiQuery } from "@/lib/hooks";
import { useAuth } from "@/store/auth";
import { Reveal, RevealGroup, RevealItem } from "@/components/admin/Reveal";
import { StatusPill } from "@/components/admin/StatusPill";

const cardBase = "bg-white border rounded-[11px] p-4";

interface PortalCampaign {
  id: string;
  brief_text: string;
  status: string;
  campaign_name: string | null;
  approved_at: string | null;
  created_at: string;
}

const STAGE: Record<string, { label: string; color: string; pulse?: boolean }> = {
  briefed: { label: "Briefed", color: "#9CA3AF" },
  copy_approved: { label: "Copy approved", color: "#F59E0B" },
  scheduled: { label: "Scheduled", color: "#6366F1" },
  sending: { label: "Sending", color: "#10B981", pulse: true },
  complete: { label: "Complete", color: "#00D4AA" },
  report_issued: { label: "Report issued", color: "#1B1F4A" },
};

export default function ManagedPortalHome() {
  const router = useRouter();
  const { user, account, loading, loadMe, logout } = useAuth();

  useEffect(() => {
    if (!user) loadMe();
  }, [user, loadMe]);

  // Guards
  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/managed-portal/login");
    } else if (user.user_type !== "managed_client") {
      router.replace("/dashboard");
    } else if (user.must_change_password) {
      router.replace("/managed-portal/activate");
    }
  }, [loading, user, router]);

  // Managed-client campaign list — fetched once the client is authenticated and
  // has completed activation. `campaigns` stays null while loading (skeletons).
  const { data, isLoading } = useApiQuery(
    ["managed-portal", "campaigns"],
    () => api<PortalCampaign[]>("/managed-portal/campaigns", { auth: true }),
    { enabled: user?.user_type === "managed_client" && !user.must_change_password },
  );
  const campaigns = isLoading ? null : (data ?? []);

  if (!user || user.user_type !== "managed_client" || user.must_change_password) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: "var(--bg)" }}>
        <Loader2 className="h-7 w-7 animate-spin text-teal" aria-label="Loading" />
      </div>
    );
  }

  async function handleLogout() {
    await logout();
    router.replace("/managed-portal/login");
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      {/* Topbar — admin design language, single-purpose portal (no sidebar). */}
      <header
        className="sticky top-0 z-20 flex items-center justify-between bg-white"
        style={{ height: "60px", borderBottom: "1px solid var(--border)", padding: "0 22px" }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="flex items-center justify-center rounded-[7px]"
            style={{ width: "28px", height: "28px", background: "#00D4AA", flexShrink: 0 }}
          >
            <Mail size={13} className="text-navy" />
          </div>
          <span className="font-display font-extrabold text-[15px] text-navy">BulkReach</span>
          <StatusPill label="Campaign portal" color="#00D4AA" bg="rgba(0,212,170,0.12)" dot={false} />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[12.5px] font-semibold text-navy">{account?.name}</span>
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-text-muted transition-colors hover:text-navy"
          >
            <LogOut className="h-4 w-4" /> Log out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-[22px]">
        <Reveal>
          <h1 className="font-display text-[20px] font-extrabold text-navy">Your campaigns</h1>
          <p className="mt-1 text-[12px] text-text-muted">
            Track the progress of the campaigns our team is running for you.
          </p>
        </Reveal>

        <div className="mt-5 space-y-3">
          {campaigns === null ? (
            [0, 1, 2].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-[11px] border bg-bg" />
            ))
          ) : campaigns.length === 0 ? (
            <Reveal delay={0.1}>
              <div className={`${cardBase} flex flex-col items-center py-12 text-center`}>
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-xl"
                  style={{ background: "rgba(0,212,170,0.12)", color: "#00D4AA" }}
                >
                  <FileText className="h-5 w-5" aria-hidden />
                </div>
                <p className="mt-3 text-[12px] text-text-muted">
                  No managed campaigns yet. Your account manager will brief the first one soon.
                </p>
              </div>
            </Reveal>
          ) : (
            <RevealGroup className="space-y-3" stagger={0.05}>
              {campaigns.map((c) => {
                // Unknown/new backend stages: humanize the token rather than
                // leaking snake_case (e.g. "awaiting_assets" → "Awaiting assets").
                const humanize = (s: string) =>
                  s.replace(/_/g, " ").replace(/^\w/, (ch) => ch.toUpperCase());
                const st = STAGE[c.status] ?? { label: humanize(c.status), color: "#9CA3AF" };
                return (
                  <RevealItem key={c.id} lift>
                    <div className={cardBase}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold text-navy">{c.campaign_name ?? "Campaign brief"}</div>
                          <p className="mt-1 line-clamp-2 text-[12px] text-text-muted">{c.brief_text}</p>
                        </div>
                        <StatusPill label={st.label} color={st.color} pulse={st.pulse} />
                      </div>
                    </div>
                  </RevealItem>
                );
              })}
            </RevealGroup>
          )}
        </div>
      </main>
    </div>
  );
}
