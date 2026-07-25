"use client";

import { create } from "zustand";
import { api, clearToken, getToken, setToken } from "@/lib/api";

export interface User {
  id: string;
  email: string;
  role: string;
  account_id: string;
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
    clearToken();
    set({ user: null, account: null, loading: false });
  },
}));
