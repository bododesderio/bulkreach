/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CreditCard,
  Eye,
  FileBarChart,
  LayoutDashboard,
  LogOut,
  Menu,
  Send,
  Settings,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "@/store/auth";
import NotificationBell from "@/components/NotificationBell";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/contacts", label: "Contacts", icon: Users },
  { href: "/dashboard/campaigns", label: "Campaigns", icon: Send },
  { href: "/dashboard/reports", label: "Reports", icon: FileBarChart },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

const TITLES: Record<string, string> = {
  "/dashboard": "Overview",
  "/dashboard/contacts": "Contacts",
  "/dashboard/campaigns": "Campaigns",
  "/dashboard/reports": "Reports",
  "/dashboard/billing": "Billing",
  "/dashboard/settings": "Settings",
};

function initials(email: string): string {
  return email.slice(0, 2).toUpperCase();
}

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
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const title =
    TITLES[pathname] ?? (pathname.startsWith("/dashboard/campaigns") ? "Campaigns" : "Dashboard");

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  async function handleExitImpersonation() {
    setExiting(true);
    await stopImpersonation();
    router.replace("/admin/accounts");
  }

  const SidebarInner = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2 border-b px-6">
        <span className="text-xl font-extrabold text-primary">BulkReach</span>
      </div>
      <nav className="flex-1 space-y-1 p-4" data-testid="sidebar-nav">
        {NAV.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              data-testid={`nav-${label.toLowerCase()}`}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
      {/* Logout — last sidebar item */}
      <div className="border-t p-4">
        <button
          onClick={handleLogout}
          data-testid="sidebar-logout"
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="h-4 w-4" />
          Log out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-muted/20">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r bg-background lg:block">
        {SidebarInner}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-60 border-r bg-background">{SidebarInner}</aside>
        </div>
      )}

      {/* Content column */}
      <div className="lg:pl-60">
        {user.impersonated_by && (
          <div className="sticky top-0 z-30 flex items-center justify-between gap-3 bg-amber-500 px-4 py-2 text-sm font-medium text-amber-950 sm:px-6">
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
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-background/80 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen((o) => !o)}
              className="rounded-lg p-2 hover:bg-accent lg:hidden"
              aria-label="Toggle navigation"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <h1 className="text-lg font-semibold" data-testid="page-title">{title}</h1>
          </div>

          {/* Profile */}
          <div className="flex items-center gap-3" data-testid="topbar-profile">
            <NotificationBell />
            <div className="hidden text-right sm:block">
              <div className="text-sm font-medium leading-tight">{account.name}</div>
              <div className="text-xs capitalize text-muted-foreground">{account.plan} plan</div>
            </div>
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
              title={user.email}
            >
              {initials(user.email)}
            </div>
          </div>
        </header>

        <div className="p-4 sm:p-6 lg:p-8">{children}</div>
      </div>
    </div>
  );
}
