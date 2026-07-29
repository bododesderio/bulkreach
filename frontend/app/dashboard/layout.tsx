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
  const [mobileOpen, setMobileOpen] = useState(false);
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
  useEffect(() => setMobileOpen(false), [pathname]);

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

  return (
    <div className="flex min-h-screen" style={{ background: "var(--bg)" }}>
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen shrink-0 lg:block">
        <Sidebar plan={account.plan} onLogout={handleLogout} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 h-full">
            <Sidebar plan={account.plan} onLogout={handleLogout} />
          </aside>
        </div>
      )}

      {/* Content column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Sticky header cluster: impersonation banner (if any) + topbar move together */}
        <div className="sticky top-0 z-20">
          {user.impersonated_by && (
            <div className="flex items-center justify-between gap-3 bg-amber-500 px-4 py-2 text-sm font-medium text-amber-950">
              <span className="flex items-center gap-2">
                <Eye className="h-4 w-4 shrink-0" />
                <span>
                  Viewing <strong>{account.name}</strong> as {user.impersonated_by}
                </span>
              </span>
              <button
                onClick={handleExitImpersonation}
                disabled={exiting}
                className="shrink-0 rounded-md bg-amber-950/10 px-3 py-1 font-semibold transition hover:bg-amber-950/20 disabled:opacity-50"
              >
                {exiting ? "Exiting…" : "Exit"}
              </button>
            </div>
          )}
          <Topbar
            title={title}
            subtitle={subtitle}
            accountName={account.name}
            plan={account.plan}
            email={user.email}
            onMenuClick={() => setMobileOpen(true)}
          />
        </div>

        <main className="p-[18px]">{children}</main>
      </div>
    </div>
  );
}
