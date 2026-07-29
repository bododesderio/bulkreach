/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, Trash2, UserPlus } from "lucide-react";
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

      {/* ── Notification preferences ──────────────────────────────────────── */}
      <Reveal delay={canInvite ? 0.3 : 0.2}>
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
