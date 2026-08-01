/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Eye } from "lucide-react";
import { useAuth } from "@/store/auth";
import Sidebar from "@/components/dashboard/Sidebar";
import Topbar from "@/components/dashboard/Topbar";
import { AppShell } from "@/components/ui";

const TITLES: Record<string, string> = {
  "/dashboard": "Overview",
  "/dashboard/contacts": "Contacts",
  "/dashboard/campaigns": "Campaigns",
  "/dashboard/reports": "Reports",
  "/dashboard/billing": "Billing",
  "/dashboard/settings": "Settings",
};

const SUBTITLES: Record<string, string> = {
  "/dashboard": "Your account at a glance",
  "/dashboard/contacts": "Import and manage recipient lists",
  "/dashboard/campaigns": "Compose, send, and track messages",
  "/dashboard/reports": "Delivery analytics and exports",
  "/dashboard/billing": "Plan, invoices, and payments",
  "/dashboard/settings": "Profile, security, and team",
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, account, loading, loadMe, logout, stopImpersonation } = useAuth();
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (!user) loadMe();
  }, [user, loadMe]);
  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);
  // Managed clients live in the managed portal, not the self-service dashboard —
  // but a superadmin impersonating a managed_client account stays here.
  useEffect(() => {
    if (user && user.user_type === "managed_client" && !user.impersonated_by) {
      router.replace("/managed-portal");
    }
  }, [user, router]);
  if (loading || !user || !account) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: "var(--bg)" }}>
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal border-t-transparent" />
      </div>
    );
  }

  const title =
    TITLES[pathname] ?? (pathname.startsWith("/dashboard/campaigns") ? "Campaigns" : "Dashboard");
  const subtitle = SUBTITLES[pathname] ?? "";

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  async function handleExitImpersonation() {
    setExiting(true);
    await stopImpersonation();
    router.replace("/admin/accounts");
  }

  const banner = user.impersonated_by ? (
    <div
      className="flex items-center justify-between gap-3 px-4 py-2 text-sm font-medium"
      style={{ background: "#FFFBEB", borderBottom: "2px solid #F59E0B", color: "#92400E" }}
    >
      <span className="flex items-center gap-2">
        <Eye className="h-4 w-4 shrink-0" style={{ color: "#D97706" }} aria-hidden />
        <span>
          Viewing <strong>{account.name}</strong> as {user.impersonated_by}
        </span>
      </span>
      <button
        onClick={handleExitImpersonation}
        disabled={exiting}
        className="shrink-0 rounded-md px-3 py-1 font-semibold transition disabled:opacity-50"
        style={{ background: "#FDE68A", color: "#92400E", border: "1px solid #F59E0B" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#FCD34D"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#FDE68A"; }}
      >
        {exiting ? "Exiting…" : "Exit"}
      </button>
    </div>
  ) : undefined;

  return (
    <AppShell
      sidebar={<Sidebar plan={account.plan} onLogout={handleLogout} />}
      banner={banner}
      topbar={
        <Topbar
          title={title}
          subtitle={subtitle}
          accountName={account.name}
          plan={account.plan}
          email={user.email}
        />
      }
      mainClassName="p-[18px]"
    >
      {children}
    </AppShell>
  );
}
