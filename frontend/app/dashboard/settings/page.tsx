/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, Laptop, LogOut, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { Reveal } from "@/components/admin/Reveal";
import DataTable, { Column } from "@/components/admin/DataTable";
import { StatusPill } from "@/components/admin/StatusPill";

interface Invite {
  id: string;
  email: string;
  role: string;
  expires_at: string;
  dev_link?: string | null;
}

interface Session {
  id: string;
  ip_address: string | null;
  user_agent: string | null;
  last_used_at: string | null;
  created_at: string;
  current: boolean;
}

/** Friendly "Chrome on macOS" label from a raw user-agent string. */
function deviceLabel(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser = /Edg/.test(ua) ? "Edge"
    : /Chrome/.test(ua) ? "Chrome"
    : /Firefox/.test(ua) ? "Firefox"
    : /Safari/.test(ua) ? "Safari"
    : "Browser";
  const os = /Windows/.test(ua) ? "Windows"
    : /iPhone|iPad|iOS/.test(ua) ? "iOS"
    : /Android/.test(ua) ? "Android"
    : /Mac OS X|Macintosh/.test(ua) ? "macOS"
    : /Linux/.test(ua) ? "Linux"
    : "device";
  return `${browser} on ${os}`;
}

function fmtWhen(iso: string | null): string {
  if (!iso) return "—";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

type Channels = Record<string, string[]>;

const PREF_CATEGORIES: { key: string; label: string }[] = [
  { key: "billing", label: "Billing & subscription" },
  { key: "quota", label: "Usage limits" },
  { key: "payment", label: "Payments" },
  { key: "campaign", label: "Campaign updates" },
  { key: "team", label: "Team activity" },
];

const cardBase = "bg-white border rounded-[11px] p-4";

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

  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      setSessions(await api<Session[]>("/auth/sessions", { auth: true }));
    } catch {
      setSessions([]);
    }
  }, []);

  useEffect(() => {
    loadInvites();
    loadSessions();
    api<{ channels: Channels }>("/notifications/preferences", { auth: true })
      .then((d) => setChannels(d.channels))
      .catch(() => {});
  }, [loadInvites, loadSessions]);

  async function revokeSession(id: string) {
    setRevoking(id);
    try {
      await api(`/auth/sessions/${id}/revoke`, { method: "POST", auth: true });
      setSessions((prev) => (prev ?? []).filter((s) => s.id !== id));
      toast.success("Device logged out");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not log out that device");
    } finally {
      setRevoking(null);
    }
  }

  async function revokeOtherSessions() {
    setRevoking("others");
    try {
      const res = await api<{ revoked: number }>("/auth/sessions/revoke-others", {
        method: "POST",
        auth: true,
      });
      toast.success(
        res.revoked > 0 ? `Logged out ${res.revoked} other device${res.revoked === 1 ? "" : "s"}` : "No other devices",
      );
      await loadSessions();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not log out other devices");
    } finally {
      setRevoking(null);
    }
  }

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

  const inviteColumns: Column<Invite>[] = [
    {
      key: "email",
      label: "Email",
      render: (i) => <span className="font-semibold text-navy">{i.email}</span>,
    },
    {
      key: "role",
      label: "Role",
      render: (i) => <StatusPill label={i.role} color="#6366F1" />,
    },
    {
      key: "actions",
      label: "",
      align: "right",
      render: (i) => (
        <button
          type="button"
          onClick={() => revoke(i.id)}
          aria-label={`Revoke invite for ${i.email}`}
          className="inline-flex items-center gap-1 text-[11px] rounded-[5px] border font-semibold px-2 py-1 transition-colors hover:bg-red-50"
          style={{ color: "#EF4444", borderColor: "rgba(239,68,68,0.2)" }}
        >
          <Trash2 className="h-3 w-3" /> Revoke
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-[18px] max-w-2xl">

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <Reveal>
        <h2 className="font-display text-[20px] font-extrabold text-navy">Settings</h2>
        <p className="mt-0.5 text-[12px] text-text-muted">
          Your account, team, and profile details.
        </p>
      </Reveal>

      {/* ── Account ───────────────────────────────────────────────────────── */}
      <Reveal delay={0.1}>
        <div className={cardBase}>
          <div className="mb-3 font-display text-[14px] font-bold text-navy">Account</div>
          <dl className="divide-y">
            {rows.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between py-3">
                <dt className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-text-muted">
                  {label}
                </dt>
                <dd className="text-[12px] font-semibold text-navy capitalize">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Reveal>

      {/* ── Team ──────────────────────────────────────────────────────────── */}
      {canInvite && (
        <Reveal delay={0.2}>
          <div className={cardBase}>
            <div className="mb-0.5 font-display text-[14px] font-bold text-navy">Team</div>
            <p className="mb-4 text-[11px] text-text-muted">
              Invite teammates to your account. They join with the role you choose.
            </p>

            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[220px] flex-1">
                <label
                  htmlFor="invite-email"
                  className="mb-1 block text-[10.5px] font-bold uppercase tracking-[0.06em] text-text-muted"
                >
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
                <label
                  htmlFor="invite-role"
                  className="mb-1 block text-[10.5px] font-bold uppercase tracking-[0.06em] text-text-muted"
                >
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
              <div className="mt-4 border-t pt-4">
                <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.06em] text-text-muted">
                  Pending invitations
                </div>
                <DataTable<Invite>
                  columns={inviteColumns}
                  rows={invites}
                  rowKey={(i) => i.id}
                />
              </div>
            )}
          </div>
        </Reveal>
      )}

      {/* ── Security · active sessions ────────────────────────────────────── */}
      <Reveal delay={canInvite ? 0.3 : 0.2}>
        <div className={cardBase}>
          <div className="mb-0.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck size={15} className="text-text-muted" aria-hidden />
              <div className="font-display text-[14px] font-bold text-navy">Active sessions</div>
            </div>
            {sessions !== null && sessions.length > 1 && (
              <button
                type="button"
                onClick={revokeOtherSessions}
                disabled={revoking === "others"}
                className="inline-flex items-center gap-1 text-[11px] rounded-[5px] border font-semibold px-2 py-1 transition-colors hover:bg-red-50 disabled:opacity-50"
                style={{ color: "#EF4444", borderColor: "rgba(239,68,68,0.2)" }}
              >
                <LogOut className="h-3 w-3" />
                {revoking === "others" ? "Logging out…" : "Log out other devices"}
              </button>
            )}
          </div>
          <p className="mb-4 text-[11px] text-text-muted">
            Devices currently signed in to your account. Revoking one signs it out within a few minutes.
          </p>

          {sessions === null ? (
            <div className="py-8 text-center text-[12px] text-text-muted">Loading…</div>
          ) : sessions.length === 0 ? (
            <div className="py-8 text-center text-[12px] text-text-muted">No active sessions.</div>
          ) : (
            <ul className="divide-y">
              {sessions.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-3.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
                      style={{ background: "var(--bg)", color: "var(--navy)" }}
                    >
                      <Laptop className="h-4 w-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold text-navy">{deviceLabel(s.user_agent)}</span>
                        {s.current && (
                          <StatusPill label="This device" color="#00D4AA" bg="rgba(0,212,170,0.12)" pulse />
                        )}
                      </div>
                      <span className="mt-0.5 block text-[11px] text-text-muted">
                        {s.ip_address ?? "unknown IP"} · active {fmtWhen(s.last_used_at ?? s.created_at)}
                      </span>
                    </div>
                  </div>
                  {!s.current && (
                    <button
                      type="button"
                      onClick={() => revokeSession(s.id)}
                      disabled={revoking === s.id}
                      aria-label={`Log out ${deviceLabel(s.user_agent)}`}
                      className="inline-flex flex-shrink-0 items-center gap-1 text-[11px] rounded-[5px] border font-semibold px-2 py-1 transition-colors hover:bg-red-50 disabled:opacity-50"
                      style={{ color: "#EF4444", borderColor: "rgba(239,68,68,0.2)" }}
                    >
                      {revoking === s.id ? "…" : "Log out"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Reveal>

      {/* ── Notification preferences ──────────────────────────────────────── */}
      <Reveal delay={canInvite ? 0.4 : 0.3}>
        <div className={cardBase}>
          <div className="mb-0.5 flex items-center gap-2">
            <Bell size={15} className="text-text-muted" aria-hidden />
            <div className="font-display text-[14px] font-bold text-navy">Notifications</div>
          </div>
          <p className="mb-4 text-[11px] text-text-muted">
            In-app alerts are always on. Choose which also arrive by email.
          </p>

          {channels === null ? (
            <div className="py-8 text-center text-[12px] text-text-muted">Loading…</div>
          ) : (
            <ul className="divide-y">
              {PREF_CATEGORIES.map(({ key, label }) => {
                const emailOn = (channels[key] ?? []).includes("email");
                const locked = key === "billing" || key === "quota";
                return (
                  <li key={key} className="flex items-center justify-between py-3.5">
                    <div>
                      <span className="text-[13px] font-semibold text-navy">{label}</span>
                      <span className="mt-0.5 block text-[11px] text-text-muted">
                        In-app{locked ? " (always on)" : ""}
                        {emailOn ? " · Email" : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[10.5px] text-text-muted">Email</span>
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
      </Reveal>

    </div>
  );
}
