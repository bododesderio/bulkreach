/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
"use client";

import { create } from "zustand";
import {
  api,
  clearImpToken,
  clearToken,
  getToken,
  setImpToken,
  setToken,
} from "@/lib/api";

export interface User {
  id: string;
  email: string;
  role: string;
  account_id: string;
  user_type?: string;
  must_change_password?: boolean;
  email_verified?: boolean;
  /** Email of the superadmin acting-as this account (impersonation session). */
  impersonated_by?: string | null;
}
export interface Account {
  id: string;
  name: string;
  email: string;
  plan: string;
  status: string;
  trial_messages_remaining: number;
}

interface AuthState {
  user: User | null;
  account: Account | null;
  loading: boolean;
  loadMe: () => Promise<void>;
  logout: () => Promise<void>;
  afterAuth: (accessToken: string) => Promise<void>;
  startImpersonation: (token: string) => Promise<void>;
  stopImpersonation: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  account: null,
  loading: true,
  loadMe: async () => {
    if (!getToken()) {
      set({ user: null, account: null, loading: false });
      return;
    }
    try {
      const data = await api<{ user: User; account: Account }>("/auth/me", { auth: true });
      set({ user: data.user, account: data.account, loading: false });
    } catch {
      set({ user: null, account: null, loading: false });
    }
  },
  afterAuth: async (accessToken: string) => {
    setToken(accessToken);
    const data = await api<{ user: User; account: Account }>("/auth/me", { auth: true });
    set({ user: data.user, account: data.account, loading: false });
  },
  logout: async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    clearImpToken();
    clearToken();
    set({ user: null, account: null, loading: false });
  },
  // Superadmin "log in as": store the short-lived impersonation token (which
  // getToken() now prefers) and reload the principal as the account owner.
  startImpersonation: async (token: string) => {
    setImpToken(token);
    set({ loading: true });
    const data = await api<{ user: User; account: Account }>("/auth/me", { auth: true });
    set({ user: data.user, account: data.account, loading: false });
  },
  // Clear the impersonation token first so the stop call (and everything after)
  // authenticates as the real admin again; the audit ping is best-effort.
  stopImpersonation: async () => {
    const accountId = useAuth.getState().account?.id ?? null;
    clearImpToken();
    try {
      await api("/admin/accounts/impersonate-stop", {
        method: "POST",
        auth: true,
        body: JSON.stringify({ account_id: accountId }),
      });
    } catch {
      /* best-effort audit ping */
    }
    set({ loading: true });
    const data = await api<{ user: User; account: Account }>("/auth/me", { auth: true });
    set({ user: data.user, account: data.account, loading: false });
  },
}));
