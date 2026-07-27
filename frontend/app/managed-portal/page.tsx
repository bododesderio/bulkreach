"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, LogOut, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";

interface PortalCampaign {
  id: string;
  brief_text: string;
  status: string;
  campaign_name: string | null;
  approved_at: string | null;
  created_at: string;
}

const STAGE: Record<string, { label: string; color: string }> = {
  briefed: { label: "Briefed", color: "#9CA3AF" },
  copy_approved: { label: "Copy approved", color: "#F59E0B" },
  scheduled: { label: "Scheduled", color: "#6366F1" },
  sending: { label: "Sending", color: "#10B981" },
  complete: { label: "Complete", color: "#00D4AA" },
  report_issued: { label: "Report issued", color: "#1B1F4A" },
};

export default function ManagedPortalHome() {
  const router = useRouter();
  const { user, account, loading, loadMe, logout } = useAuth();
  const [campaigns, setCampaigns] = useState<PortalCampaign[] | null>(null);

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

  const load = useCallback(async () => {
    try {
      setCampaigns(await api<PortalCampaign[]>("/managed-portal/campaigns", { auth: true }));
    } catch {
      setCampaigns([]);
    }
  }, []);

  useEffect(() => {
    if (user?.user_type === "managed_client" && !user.must_change_password) load();
  }, [user, load]);

  if (!user || user.user_type !== "managed_client" || user.must_change_password) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" aria-label="Loading" />
      </div>
    );
  }

  async function handleLogout() {
    await logout();
    router.replace("/managed-portal/login");
  }

  return (
    <div className="min-h-screen bg-bg">
      <header className="flex h-16 items-center justify-between border-b bg-card px-6">
        <div className="flex items-center gap-2">
          <span className="text-xl font-extrabold text-primary">BulkReach</span>
          <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-foreground">
            Campaign portal
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{account?.name}</span>
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-4 w-4" /> Log out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="text-2xl font-bold">Your campaigns</h1>
        <p className="mt-1 text-muted-foreground">
          Track the progress of the campaigns our team is running for you.
        </p>

        <div className="mt-6 space-y-3">
          {campaigns === null ? (
            [0, 1, 2].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl border bg-card" />
            ))
          ) : campaigns.length === 0 ? (
            <div className="flex flex-col items-center rounded-xl border bg-card p-10 text-center">
              <FileText className="h-8 w-8 text-muted-foreground" aria-hidden />
              <p className="mt-3 text-sm text-muted-foreground">
                No managed campaigns yet. Your account manager will brief the first one soon.
              </p>
            </div>
          ) : (
            campaigns.map((c) => {
              const st = STAGE[c.status] ?? { label: c.status, color: "#6B7280" };
              return (
                <div key={c.id} className="rounded-xl border bg-card p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold">{c.campaign_name ?? "Campaign brief"}</div>
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{c.brief_text}</p>
                    </div>
                    <span
                      className="whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold"
                      style={{ background: `${st.color}1a`, color: st.color }}
                    >
                      {st.label}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
}
