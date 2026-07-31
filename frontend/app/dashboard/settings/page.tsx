/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Bell,
  Key,
  Laptop,
  LogOut,
  ShieldCheck,
  Trash2,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useAuth, User } from "@/store/auth";
import { Reveal } from "@/components/admin/Reveal";
import DataTable, { Column } from "@/components/admin/DataTable";
import { StatusPill } from "@/components/admin/StatusPill";

// ── Types ────────────────────────────────────────────────────────────────────

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

/** Extended account shape returned by GET/PATCH /auth/me */
interface AccountOut {
  id: string;
  name: string;
  email: string;
  plan: string;
  status: string;
  trial_messages_remaining: number;
  contact_name: string | null;
  phone: string | null;
  industry: string | null;
  timezone: string | null;
  logo_url: string | null;
  report_header: string | null;
  marketing_opt_in: boolean;
}

interface MeResponse {
  user: User;
  account: AccountOut;
}

/** Mutable profile fields tracked in the form */
interface ProfileDraft {
  name: string;
  contact_name: string;
  phone: string;
  industry: string;
  timezone: string;
  logo_url: string;
  report_header: string;
  marketing_opt_in: boolean;
}

type Channels = Record<string, string[]>;

// ── Constants ────────────────────────────────────────────────────────────────

type Tab = "profile" | "security" | "team" | "sessions" | "notifications" | "danger";

const ALL_TABS: { id: Tab; label: string }[] = [
  { id: "profile",       label: "Profile"       },
  { id: "security",      label: "Security"      },
  { id: "team",          label: "Team"          },
  { id: "sessions",      label: "Sessions"      },
  { id: "notifications", label: "Notifications" },
  { id: "danger",        label: "Danger"        },
];

const PREF_CATEGORIES: { key: string; label: string }[] = [
  { key: "billing",  label: "Billing & subscription" },
  { key: "quota",    label: "Usage limits"            },
  { key: "payment",  label: "Payments"                },
  { key: "campaign", label: "Campaign updates"        },
  { key: "team",     label: "Team activity"           },
];

const TIMEZONES: string[] = [
  "Africa/Kampala",
  "Africa/Nairobi",
  "Africa/Lagos",
  "Africa/Johannesburg",
  "Africa/Cairo",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Asia/Kolkata",
  "UTC",
];

const cardBase = "bg-white border rounded-[11px] p-4";
const labelClass = "mb-1 block text-[10.5px] font-bold uppercase tracking-[0.06em] text-text-muted";

// ── Helpers ──────────────────────────────────────────────────────────────────

function deviceLabel(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser = /Edg/.test(ua)
    ? "Edge"
    : /Chrome/.test(ua)
    ? "Chrome"
    : /Firefox/.test(ua)
    ? "Firefox"
    : /Safari/.test(ua)
    ? "Safari"
    : "Browser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /iPhone|iPad|iOS/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
    ? "Android"
    : /Mac OS X|Macintosh/.test(ua)
    ? "macOS"
    : /Linux/.test(ua)
    ? "Linux"
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

function draftFromAccount(a: AccountOut): ProfileDraft {
  return {
    name: a.name,
    contact_name: a.contact_name ?? "",
    phone: a.phone ?? "",
    industry: a.industry ?? "",
    timezone: a.timezone ?? "Africa/Kampala",
    logo_url: a.logo_url ?? "",
    report_header: a.report_header ?? "",
    marketing_opt_in: a.marketing_opt_in,
  };
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const router = useRouter();
  const { user, account } = useAuth();
  const loadMe = useAuth((s) => s.loadMe);
  const logout = useAuth((s) => s.logout);

  const canInvite = !!user && (user.role === "owner" || user.role === "admin");
  const isOwner = user?.role === "owner";

  // ── Tab ─────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>("profile");

  // ── Profile state ────────────────────────────────────────────────────────
  const [profileData, setProfileData] = useState<AccountOut | null>(null);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);

  // ── Security state ───────────────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  // ── Team state ───────────────────────────────────────────────────────────
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [sending, setSending] = useState(false);

  // ── Sessions state ───────────────────────────────────────────────────────
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  // ── Notifications state ──────────────────────────────────────────────────
  const [channels, setChannels] = useState<Channels | null>(null);
  const [savingPref, setSavingPref] = useState<string | null>(null);

  // ── Danger state ─────────────────────────────────────────────────────────
  const [dangerName, setDangerName] = useState("");
  const [dangerPassword, setDangerPassword] = useState("");
  const [dangerDeleting, setDangerDeleting] = useState(false);
  const [dangerError, setDangerError] = useState("");

  // ── Data loading ─────────────────────────────────────────────────────────

  const loadInvites = useCallback(async () => {
    if (!canInvite) return;
    try {
      setInvites(await api<Invite[]>("/invitations", { auth: true }));
    } catch {
      /* keep empty */
    }
  }, [canInvite]);

  const loadSessions = useCallback(async () => {
    try {
      setSessions(await api<Session[]>("/auth/sessions", { auth: true }));
    } catch {
      setSessions([]);
    }
  }, []);

  useEffect(() => {
    api<MeResponse>("/auth/me", { auth: true })
      .then((d) => {
        setProfileData(d.account);
        setDraft(draftFromAccount(d.account));
      })
      .catch(() => {});

    loadInvites();
    loadSessions();

    api<{ channels: Channels }>("/notifications/preferences", { auth: true })
      .then((d) => setChannels(d.channels))
      .catch(() => {});
  }, [loadInvites, loadSessions]);

  // ── Profile handlers ─────────────────────────────────────────────────────

  async function saveProfile() {
    if (!draft || !profileData) return;
    const original = draftFromAccount(profileData);
    const changes: Record<string, unknown> = {};
    for (const key of Object.keys(draft) as (keyof ProfileDraft)[]) {
      if (draft[key] !== original[key]) {
        changes[key] = draft[key];
      }
    }
    if (Object.keys(changes).length === 0) {
      toast.info("No changes to save");
      return;
    }
    setProfileSaving(true);
    setProfileSuccess(false);
    try {
      const updated = await api<AccountOut>("/auth/me", {
        method: "PATCH",
        auth: true,
        body: JSON.stringify(changes),
      });
      setProfileData(updated);
      setDraft(draftFromAccount(updated));
      setProfileSuccess(true);
      toast.success("Profile updated");
      // Sync the auth store so account.name stays fresh (used by Danger tab)
      void loadMe();
      setTimeout(() => setProfileSuccess(false), 3000);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        toast.error("Only the account owner or admin can edit profile settings.");
      } else {
        toast.error(e instanceof ApiError ? e.message : "Could not save profile");
      }
    } finally {
      setProfileSaving(false);
    }
  }

  // ── Security handlers ────────────────────────────────────────────────────

  async function changePassword() {
    setPasswordError("");
    setPasswordSuccess(false);
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }
    setPasswordSaving(true);
    try {
      await api("/auth/change-password", {
        method: "POST",
        auth: true,
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSuccess(true);
    } catch (e) {
      setPasswordError(e instanceof ApiError ? e.message : "Could not change password");
    } finally {
      setPasswordSaving(false);
    }
  }

  // ── Sessions handlers ────────────────────────────────────────────────────

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
        res.revoked > 0
          ? `Logged out ${res.revoked} other device${res.revoked === 1 ? "" : "s"}`
          : "No other devices",
      );
      await loadSessions();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not log out other devices");
    } finally {
      setRevoking(null);
    }
  }

  // ── Notifications handlers ───────────────────────────────────────────────

  async function toggleEmail(category: string, enabled: boolean) {
    if (!channels) return;
    const current = channels[category] ?? ["in_app"];
    const next = enabled
      ? Array.from(new Set([...current, "email"]))
      : current.filter((c) => c !== "email");
    setSavingPref(category);
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
      setChannels(channels);
    } finally {
      setSavingPref(null);
    }
  }

  // ── Team handlers ────────────────────────────────────────────────────────

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

  async function revokeInvite(id: string) {
    try {
      await api(`/invitations/${id}`, { method: "DELETE", auth: true });
      setInvites((prev) => prev.filter((i) => i.id !== id));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not revoke");
    }
  }

  // ── Danger handlers ──────────────────────────────────────────────────────

  async function deleteAccount() {
    setDangerError("");
    setDangerDeleting(true);
    try {
      await api("/auth/delete-account", {
        method: "POST",
        auth: true,
        body: JSON.stringify({ password: dangerPassword, confirm: dangerName }),
      });
      await logout();
      router.push("/login");
    } catch (e) {
      setDangerError(e instanceof ApiError ? e.message : "Could not close account");
      setDangerDeleting(false);
    }
  }

  if (!user || !account) return null;

  const visibleTabs = isOwner ? ALL_TABS : ALL_TABS.filter((t) => t.id !== "danger");

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
          onClick={() => revokeInvite(i.id)}
          aria-label={`Revoke invite for ${i.email}`}
          className="inline-flex items-center gap-1 text-[11px] rounded-[5px] border font-semibold px-2 py-1 transition-colors hover:bg-red-50"
          style={{ color: "#EF4444", borderColor: "rgba(239,68,68,0.2)" }}
        >
          <Trash2 className="h-3 w-3" /> Revoke
        </button>
      ),
    },
  ];

  const dangerConfirmed = dangerName === account.name && dangerPassword.length > 0;

  return (
    <div className="space-y-[18px] max-w-2xl">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <Reveal>
        <h2 className="font-display text-[20px] font-extrabold text-navy">Settings</h2>
        <p className="mt-0.5 text-[12px] text-text-muted">
          Manage your profile, security, team, and account details.
        </p>
      </Reveal>

      {/* ── Tab bar ──────────────────────────────────────────────────────── */}
      <Reveal delay={0.05}>
        <div
          className="flex items-center gap-1.5 flex-wrap"
          role="tablist"
          aria-label="Settings sections"
        >
          {visibleTabs.map((tab) => {
            const active = activeTab === tab.id;
            const isDanger = tab.id === "danger";
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`panel-${tab.id}`}
                id={`tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className="text-[11px] rounded-full px-3 py-[4px] font-semibold border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                style={
                  active
                    ? isDanger
                      ? { background: "#EF4444", color: "#fff", borderColor: "#EF4444" }
                      : { background: "#1B1F4A", color: "#fff", borderColor: "#1B1F4A" }
                    : isDanger
                    ? { background: "transparent", color: "#EF4444", borderColor: "rgba(239,68,68,0.3)" }
                    : { background: "transparent", color: "#9CA3AF", borderColor: "var(--border)" }
                }
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </Reveal>

      {/* ══════════════════ PROFILE TAB ══════════════════ */}
      {activeTab === "profile" && (
        <Reveal delay={0.1}>
          <div
            id="panel-profile"
            role="tabpanel"
            aria-labelledby="tab-profile"
            className={cardBase}
          >
            <div className="mb-3 font-display text-[14px] font-bold text-navy">Profile</div>

            {/* Read-only account overview */}
            <dl className="mb-5 grid grid-cols-2 gap-x-6 gap-y-3 border-b pb-5">
              {(
                [
                  ["Account email",       profileData?.email                              ?? account.email],
                  ["Plan",                profileData?.plan                               ?? account.plan],
                  ["Status",              profileData?.status                             ?? account.status],
                  ["Trial messages left", String(profileData?.trial_messages_remaining    ?? account.trial_messages_remaining)],
                ] satisfies [string, string][]
              ).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-text-muted">
                    {label}
                  </dt>
                  <dd className="mt-0.5 text-[12px] font-semibold text-navy capitalize">{value}</dd>
                </div>
              ))}
            </dl>

            {/* Editable profile form */}
            {draft ? (
              <form
                onSubmit={(e) => { e.preventDefault(); void saveProfile(); }}
                className="space-y-4"
              >
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="pf-name" className={labelClass}>Business name</label>
                    <input
                      id="pf-name"
                      type="text"
                      className="input"
                      value={draft.name}
                      onChange={(e) => setDraft((d) => d ? { ...d, name: e.target.value } : d)}
                      required
                      aria-required="true"
                    />
                  </div>
                  <div>
                    <label htmlFor="pf-contact" className={labelClass}>Contact name</label>
                    <input
                      id="pf-contact"
                      type="text"
                      className="input"
                      value={draft.contact_name}
                      onChange={(e) => setDraft((d) => d ? { ...d, contact_name: e.target.value } : d)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="pf-phone" className={labelClass}>Phone</label>
                    <input
                      id="pf-phone"
                      type="tel"
                      className="input"
                      placeholder="+256 700 000 000"
                      value={draft.phone}
                      onChange={(e) => setDraft((d) => d ? { ...d, phone: e.target.value } : d)}
                    />
                  </div>
                  <div>
                    <label htmlFor="pf-industry" className={labelClass}>Industry</label>
                    <input
                      id="pf-industry"
                      type="text"
                      className="input"
                      placeholder="e.g. Finance, Healthcare"
                      value={draft.industry}
                      onChange={(e) => setDraft((d) => d ? { ...d, industry: e.target.value } : d)}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="pf-tz" className={labelClass}>Timezone</label>
                  <select
                    id="pf-tz"
                    className="input"
                    value={draft.timezone}
                    onChange={(e) => setDraft((d) => d ? { ...d, timezone: e.target.value } : d)}
                  >
                    {TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>{tz}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="pf-logo" className={labelClass}>Logo URL</label>
                  <input
                    id="pf-logo"
                    type="url"
                    className="input"
                    placeholder="https://example.com/logo.png"
                    value={draft.logo_url}
                    onChange={(e) => setDraft((d) => d ? { ...d, logo_url: e.target.value } : d)}
                  />
                </div>

                <div>
                  <label htmlFor="pf-report" className={labelClass}>Report header</label>
                  <textarea
                    id="pf-report"
                    rows={3}
                    className="input resize-y"
                    placeholder="Custom text shown at the top of exported campaign reports"
                    value={draft.report_header}
                    onChange={(e) => setDraft((d) => d ? { ...d, report_header: e.target.value } : d)}
                  />
                </div>

                <div className="flex items-center gap-3">
                  <input
                    id="pf-marketing"
                    type="checkbox"
                    className="h-4 w-4 rounded border"
                    style={{ accentColor: "var(--teal)" }}
                    checked={draft.marketing_opt_in}
                    onChange={(e) =>
                      setDraft((d) => d ? { ...d, marketing_opt_in: e.target.checked } : d)
                    }
                  />
                  <label htmlFor="pf-marketing" className="cursor-pointer text-[12px] font-semibold text-navy">
                    Receive product updates and tips by email
                  </label>
                </div>

                <div className="flex items-center gap-3 border-t pt-3">
                  <button
                    type="submit"
                    disabled={profileSaving}
                    className="btn-primary disabled:opacity-50"
                  >
                    {profileSaving ? "Saving…" : "Save profile"}
                  </button>
                  {profileSuccess && (
                    <span className="text-[12px] font-semibold" style={{ color: "var(--success)" }}>
                      Saved successfully
                    </span>
                  )}
                </div>
              </form>
            ) : (
              <div className="py-8 text-center text-[12px] text-text-muted">Loading…</div>
            )}
          </div>
        </Reveal>
      )}

      {/* ══════════════════ SECURITY TAB ══════════════════ */}
      {activeTab === "security" && (
        <Reveal delay={0.1}>
          <div
            id="panel-security"
            role="tabpanel"
            aria-labelledby="tab-security"
            className={cardBase}
          >
            <div className="mb-0.5 flex items-center gap-2">
              <Key size={15} className="text-text-muted" aria-hidden />
              <div className="font-display text-[14px] font-bold text-navy">Change password</div>
            </div>
            <p className="mb-5 text-[11px] text-text-muted">
              Changing your password signs you out of all other devices.
            </p>

            <form
              onSubmit={(e) => { e.preventDefault(); void changePassword(); }}
              className="max-w-sm space-y-4"
            >
              <div>
                <label htmlFor="sec-current" className={labelClass}>Current password</label>
                <input
                  id="sec-current"
                  type="password"
                  autoComplete="current-password"
                  className="input"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </div>

              <div>
                <label htmlFor="sec-new" className={labelClass}>New password</label>
                <input
                  id="sec-new"
                  type="password"
                  autoComplete="new-password"
                  className="input"
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setPasswordError(""); }}
                  required
                  minLength={8}
                />
              </div>

              <div>
                <label htmlFor="sec-confirm" className={labelClass}>Confirm new password</label>
                <input
                  id="sec-confirm"
                  type="password"
                  autoComplete="new-password"
                  className="input"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setPasswordError(""); }}
                  required
                />
              </div>

              {passwordError && (
                <p role="alert" className="text-[12px] font-semibold" style={{ color: "var(--error)" }}>
                  {passwordError}
                </p>
              )}

              {passwordSuccess && (
                <p role="status" className="text-[12px] font-semibold" style={{ color: "var(--success)" }}>
                  Password changed. Other sessions will be signed out shortly.
                </p>
              )}

              <button
                type="submit"
                disabled={passwordSaving || !currentPassword || !newPassword || !confirmPassword}
                className="btn-primary disabled:opacity-50"
              >
                {passwordSaving ? "Changing…" : "Change password"}
              </button>
            </form>
          </div>
        </Reveal>
      )}

      {/* ══════════════════ TEAM TAB ══════════════════ */}
      {activeTab === "team" && (
        <Reveal delay={0.1}>
          <div
            id="panel-team"
            role="tabpanel"
            aria-labelledby="tab-team"
            className={cardBase}
          >
            <div className="mb-0.5 font-display text-[14px] font-bold text-navy">Team</div>

            {canInvite ? (
              <>
                <p className="mb-4 text-[11px] text-text-muted">
                  Invite teammates to your account. They join with the role you choose.
                </p>

                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[220px] flex-1">
                    <label htmlFor="invite-email" className={labelClass}>Email</label>
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
                    <label htmlFor="invite-role" className={labelClass}>Role</label>
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
              </>
            ) : (
              <p className="mt-2 text-[12px] text-text-muted">
                Only account owners and admins can manage team invitations.
              </p>
            )}
          </div>
        </Reveal>
      )}

      {/* ══════════════════ SESSIONS TAB ══════════════════ */}
      {activeTab === "sessions" && (
        <Reveal delay={0.1}>
          <div
            id="panel-sessions"
            role="tabpanel"
            aria-labelledby="tab-sessions"
            className={cardBase}
          >
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
                          <span className="text-[13px] font-semibold text-navy">
                            {deviceLabel(s.user_agent)}
                          </span>
                          {s.current && (
                            <StatusPill label="This device" color="#00D4AA" bg="rgba(0,212,170,0.12)" pulse />
                          )}
                        </div>
                        <span className="mt-0.5 block text-[11px] text-text-muted">
                          {s.ip_address ?? "unknown IP"} · active{" "}
                          {fmtWhen(s.last_used_at ?? s.created_at)}
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
      )}

      {/* ══════════════════ NOTIFICATIONS TAB ══════════════════ */}
      {activeTab === "notifications" && (
        <Reveal delay={0.1}>
          <div
            id="panel-notifications"
            role="tabpanel"
            aria-labelledby="tab-notifications"
            className={cardBase}
          >
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
      )}

      {/* ══════════════════ DANGER TAB (owner only) ══════════════════ */}
      {activeTab === "danger" && isOwner && (
        <Reveal delay={0.1}>
          <div
            id="panel-danger"
            role="tabpanel"
            aria-labelledby="tab-danger"
            className="rounded-[11px] border-2 p-4"
            style={{ borderColor: "rgba(239,68,68,0.35)", background: "#fff" }}
          >
            <div className="mb-0.5 flex items-center gap-2">
              <AlertTriangle size={15} className="text-error" aria-hidden />
              <div className="font-display text-[14px] font-bold text-error">Close account</div>
            </div>
            <p className="mb-5 text-[11px] text-text-muted">
              This permanently deletes your account, all campaigns, contacts, and billing data.
              This action cannot be undone.
            </p>

            <form
              onSubmit={(e) => { e.preventDefault(); void deleteAccount(); }}
              className="max-w-sm space-y-4"
            >
              <div>
                <label htmlFor="danger-name" className={labelClass}>
                  Type your account name to confirm
                </label>
                <input
                  id="danger-name"
                  type="text"
                  className="input"
                  placeholder={account.name}
                  value={dangerName}
                  onChange={(e) => { setDangerName(e.target.value); setDangerError(""); }}
                  autoComplete="off"
                  aria-describedby="danger-name-hint"
                />
                <p id="danger-name-hint" className="mt-1 text-[10.5px] text-text-muted">
                  Must match exactly:{" "}
                  <span className="font-semibold text-navy">{account.name}</span>
                </p>
              </div>

              <div>
                <label htmlFor="danger-pwd" className={labelClass}>Your current password</label>
                <input
                  id="danger-pwd"
                  type="password"
                  autoComplete="current-password"
                  className="input"
                  value={dangerPassword}
                  onChange={(e) => { setDangerPassword(e.target.value); setDangerError(""); }}
                />
              </div>

              {dangerError && (
                <p role="alert" className="text-[12px] font-semibold" style={{ color: "var(--error)" }}>
                  {dangerError}
                </p>
              )}

              <button
                type="submit"
                disabled={dangerDeleting || !dangerConfirmed}
                className="inline-flex items-center justify-center rounded-full px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  background: dangerConfirmed ? "#EF4444" : "#e5e7eb",
                  color: dangerConfirmed ? "#fff" : "#9ca3af",
                  fontFamily: "var(--font-display), sans-serif",
                }}
              >
                {dangerDeleting ? "Closing account…" : "Close account permanently"}
              </button>
            </form>
          </div>
        </Reveal>
      )}

    </div>
  );
}
