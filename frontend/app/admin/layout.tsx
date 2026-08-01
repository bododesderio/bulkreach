/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/store/auth";
import Sidebar from "@/components/admin/Sidebar";
import { AppShell } from "@/components/ui";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading, loadMe } = useAuth();

  useEffect(() => {
    if (!user) loadMe();
  }, [user, loadMe]);

  useEffect(() => {
    if (!loading && (!user || user.role !== "superadmin")) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ background: "var(--bg)" }}
      >
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal border-t-transparent" />
      </div>
    );
  }

  // Non-superadmin: redirect is in flight; render nothing to avoid flash.
  if (user.role !== "superadmin") return null;

  // Admin pages render their own <Topbar> (some carry a page-specific period
  // toggle), so the shell owns only the responsive sidebar + mobile drawer.
  return <AppShell sidebar={<Sidebar />}>{children}</AppShell>;
}
