"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/store/auth";

interface Invite {
  id: string;
  email: string;
  role: string;
  expires_at: string;
  dev_link?: string | null;
}

type Channels = Record<string, string[]>;

const PREF_CATEGORIES: { key: string; label: string }[] = [
  { key: "billing", label: "Billing & subscription" },
  { key: "quota", label: "Usage limits" },
  { key: "payment", label: "Payments" },
  { key: "campaign", label: "Campaign updates" },
  { key: "team", label: "Team activity" },
];

export default function SettingsPage() {
  const { user, account } = useAuth();
  const canInvite = !!user && (user.role === "owner" || user.role === "admin");

  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [sending, setSending] = useState(false);

  const loadInvites = useCallback(async () => {
    if (!canInvite) return;
    try {
      setInvites(await api<Invite[]>("/invitations", { auth: true }));
    } catch {
      /* keep empty */
    }
  }, [canInvite]);

  const [channels, setChannels] = useState<Channels | null>(null);
  const [savingPref, setSavingPref] = useState<string | null>(null);

  useEffect(() => {
    loadInvites();
    api<{ channels: Channels }>("/notifications/preferences", { auth: true })
      .then((d) => setChannels(d.channels))
      .catch(() => {});
  }, [loadInvites]);

  async function toggleEmail(category: string, enabled: boolean) {
    if (!channels) return;
    const current = channels[category] ?? ["in_app"];
    const next = enabled
      ? Array.from(new Set([...current, "email"]))
      : current.filter((c) => c !== "email");
    setSavingPref(category);
    // Optimistic update.
    setChannels({ ...channels, [category]: next });
    try {
      const d = await api<{ channels: Channels }>("/notifications/preferences", {
        method: "PATCH",
        auth: true,
        body: JSON.stringify({ channels: { [category]: next } }),
      });
      setChannels(d.channels);
    } catch {
      toast.error("Could not update preference");
      setChannels(channels); // revert
    } finally {
      setSavingPref(null);
    }
  }

  async function sendInvite() {
    if (!email) return;
    setSending(true);
    try {
      const inv = await api<Invite>("/invitations", {
        method: "POST",
        auth: true,
        body: JSON.stringify({ email, role }),
      });
      toast.success(`Invitation sent to ${email}`);
      if (inv.dev_link) toast.info(`Dev link: ${inv.dev_link}`);
      setEmail("");
      await loadInvites();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not send invite");
    } finally {
      setSending(false);
    }
  }

  async function revoke(id: string) {
    try {
      await api(`/invitations/${id}`, { method: "DELETE", auth: true });
      setInvites((prev) => prev.filter((i) => i.id !== id));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not revoke");
    }
  }

  if (!user || !account) return null;

  const rows: [string, string][] = [
    ["Business name", account.name],
    ["Account email", account.email],
    ["Your email", user.email],
    ["Role", user.role],
    ["Plan", account.plan],
    ["Status", account.status],
    ["Trial messages left", String(account.trial_messages_remaining)],
  ];

  return (
    <div className="max-w-2xl">
      <p className="text-muted-foreground">Your account, team, and profile details.</p>

      {/* Account */}
      <div className="mt-6 rounded-xl border bg-card">
        <div className="border-b px-6 py-4">
          <h3 className="font-semibold">Account</h3>
        </div>
        <dl className="divide-y">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between px-6 py-3.5">
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="text-sm font-medium capitalize">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Team */}
      {canInvite && (
        <div className="mt-6 rounded-xl border bg-card">
          <div className="border-b px-6 py-4">
            <h3 className="font-semibold">Team</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Invite teammates to your account. They join with the role you choose.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-2 px-6 py-4">
            <div className="min-w-[220px] flex-1">
              <label htmlFor="invite-email" className="mb-1 block text-xs font-medium text-muted-foreground">
                Email
              </label>
              <input
                id="invite-email"
                data-testid="invite-email"
                type="email"
                className="input"
                placeholder="teammate@company.ug"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="invite-role" className="mb-1 block text-xs font-medium text-muted-foreground">
                Role
              </label>
              <select
                id="invite-role"
                className="input"
                value={role}
                onChange={(e) => setRole(e.target.value as "member" | "admin")}
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <button
              type="button"
              onClick={sendInvite}
              disabled={sending || !email}
              data-testid="send-invite"
              className="btn-primary inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <UserPlus className="h-4 w-4" /> {sending ? "Sending…" : "Send invite"}
            </button>
          </div>

          {invites.length > 0 && (
            <div className="border-t">
              <div className="px-6 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Pending invitations
              </div>
              <ul className="divide-y">
                {invites.map((i) => (
                  <li key={i.id} className="flex items-center justify-between px-6 py-3">
                    <div>
                      <span className="text-sm font-medium">{i.email}</span>
                      <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-[11px] capitalize text-accent-foreground">
                        {i.role}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => revoke(i.id)}
                      aria-label={`Revoke invite for ${i.email}`}
                      className="rounded-md p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Notification preferences */}
      <div className="mt-6 rounded-xl border bg-card">
        <div className="border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold">Notifications</h3>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            In-app alerts are always on. Choose which also arrive by email.
          </p>
        </div>

        {channels === null ? (
          <div className="px-6 py-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : (
          <ul className="divide-y">
            {PREF_CATEGORIES.map(({ key, label }) => {
              const emailOn = (channels[key] ?? []).includes("email");
              const locked = key === "billing" || key === "quota";
              return (
                <li key={key} className="flex items-center justify-between px-6 py-3.5">
                  <div>
                    <span className="text-sm font-medium">{label}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      In-app{locked ? " (always on)" : ""}
                      {emailOn ? " · Email" : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">Email</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={emailOn}
                      aria-label={`Email notifications for ${label}`}
                      disabled={savingPref === key}
                      onClick={() => toggleEmail(key, !emailOn)}
                      className="relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50"
                      style={{ background: emailOn ? "#00D4AA" : "#CBD5E1" }}
                    >
                      <span
                        className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                        style={{ transform: emailOn ? "translateX(24px)" : "translateX(4px)" }}
                      />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
