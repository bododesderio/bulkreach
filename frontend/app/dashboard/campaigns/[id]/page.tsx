"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  MessageSquare,
  Mail,
  Layers,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  type CampaignDetail,
  type MessageOut,
  type PaginatedMessages,
  type Progress,
  isLive,
  statusTone,
  streamProgress,
  TERMINAL,
} from "@/lib/campaigns";
import { useAuth } from "@/store/auth";

const CHANNEL_ICON = { sms: MessageSquare, email: Mail, both: Layers } as const;

const fmtDateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

const FILTERS = ["all", "sent", "failed", "pending"] as const;
type Filter = (typeof FILTERS)[number];

export default function CampaignDetailPage() {
  const { user } = useAuth();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [messages, setMessages] = useState<MessageOut[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [live, setLive] = useState<Progress | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const abortRef = useRef<AbortController | null>(null);

  // Load campaign + messages (also used to refresh after dispatch settles).
  async function refresh() {
    const [detail, msgs] = await Promise.all([
      api<CampaignDetail>(`/campaigns/${id}`, { auth: true }),
      api<PaginatedMessages>(`/campaigns/${id}/messages?page_size=200`, {
        auth: true,
      }),
    ]);
    setCampaign(detail);
    setMessages(msgs.items);
    return detail;
  }

  useEffect(() => {
    if (!user) return;
    let active = true;

    refresh()
      .then((detail) => {
        if (!active || !isLive(detail.status)) return;
        // Stream live progress, then refresh once for final stats + messages.
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        streamProgress(
          id,
          (p) => {
            if (!active) return;
            setLive(p);
            if (TERMINAL.has(p.status)) {
              setLive(null);
              refresh().catch(() => {});
            }
          },
          ctrl.signal,
        ).catch(() => {});
      })
      .catch(() => active && setNotFound(true));

    return () => {
      active = false;
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, id]);

  const counts = useMemo(() => {
    const c = { all: messages.length, sent: 0, failed: 0, pending: 0 };
    for (const m of messages) {
      if (m.status === "sent" || m.status === "delivered") c.sent++;
      else if (m.status === "failed") c.failed++;
      else c.pending++;
    }
    return c;
  }, [messages]);

  const shown = useMemo(() => {
    if (filter === "all") return messages;
    if (filter === "sent")
      return messages.filter((m) => m.status === "sent" || m.status === "delivered");
    if (filter === "failed") return messages.filter((m) => m.status === "failed");
    return messages.filter(
      (m) => !["sent", "delivered", "failed"].includes(m.status),
    );
  }, [messages, filter]);

  if (notFound) {
    return (
      <div className="animate-fade-up">
        <Link
          href="/dashboard/campaigns"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Campaigns
        </Link>
        <div className="mt-8 rounded-xl border bg-card p-12 text-center">
          <h3 className="text-lg font-semibold">Campaign not found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            It may have been deleted, or the link is incorrect.
          </p>
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-40 animate-pulse rounded bg-muted" />
        <div className="h-24 animate-pulse rounded-xl border bg-card" />
        <div className="h-64 animate-pulse rounded-xl border bg-card" />
      </div>
    );
  }

  const stats = campaign.stats;
  const Icon = CHANNEL_ICON[campaign.type as keyof typeof CHANNEL_ICON] ?? MessageSquare;
  // Backend already returns delivery_rate as a percentage (0–100), not a fraction.
  const rate = stats ? Math.round(stats.delivery_rate) : 0;
  const running = live && !TERMINAL.has(live.status);

  return (
    <div className="animate-fade-up">
      {/* Header */}
      <Link
        href="/dashboard/campaigns"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Campaigns
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-bold">{campaign.name}</h2>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${statusTone(
            campaign.status,
          )}`}
        >
          {isLive(campaign.status) && (
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
          )}
          {campaign.status}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="capitalize">{campaign.type}</span>
        <span>·</span>
        <span>Created {fmtDateTime(campaign.created_at)}</span>
        {campaign.completed_at && <span>· Completed {fmtDateTime(campaign.completed_at)}</span>}
      </div>

      {/* Live progress (only while dispatching) */}
      {running && live && (
        <div className="mt-5 rounded-xl border bg-card p-5">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Loader2 className="h-4 w-4 animate-spin text-primary" /> Dispatching…
          </div>
          <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {live.sent.toLocaleString()} of {live.total.toLocaleString()} delivered
            </span>
            <span className="font-mono font-semibold text-foreground">
              {Math.round(live.pct)}%
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${Math.round(live.pct)}%` }}
            />
          </div>
        </div>
      )}

      {/* Error banner */}
      {campaign.status === "failed" && campaign.error_message && (
        <div className="mt-5 flex gap-2.5 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive" />
          <p className="text-muted-foreground">{campaign.error_message}</p>
        </div>
      )}

      {/* Stats */}
      <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Recipients", value: stats?.total ?? 0, tone: "text-foreground" },
          { label: "Delivered", value: stats?.sent ?? 0, tone: "text-primary" },
          { label: "Failed", value: stats?.failed ?? 0, tone: "text-destructive" },
          { label: "Delivery rate", value: `${rate}%`, tone: "text-foreground" },
        ].map((s, i) => (
          <div
            key={s.label}
            className="rounded-xl border bg-card p-4 animate-fade-up"
            style={{ animationDelay: `${i * 0.04}s` }}
          >
            <div className={`text-2xl font-bold ${s.tone}`}>
              {typeof s.value === "number" ? s.value.toLocaleString() : s.value}
            </div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* Channel split (only for combined campaigns) */}
      {campaign.type === "both" && stats && (
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              <MessageSquare className="h-4 w-4" /> SMS
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {stats.sms_sent.toLocaleString()} sent · {stats.sms_failed.toLocaleString()} failed
            </div>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              <Mail className="h-4 w-4" /> Email
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {stats.email_sent.toLocaleString()} sent · {stats.email_failed.toLocaleString()} failed
            </div>
          </div>
        </div>
      )}

      {/* Message content */}
      <div className="mt-4 rounded-xl border bg-card p-5">
        <div className="text-sm font-semibold">Message</div>
        {campaign.email_subject && (
          <div className="mt-2 text-sm">
            <span className="text-muted-foreground">Subject: </span>
            {campaign.email_subject}
          </div>
        )}
        {campaign.sms_body && (
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {campaign.sms_body}
          </p>
        )}
      </div>

      {/* Per-message delivery */}
      <div className="mt-4 rounded-xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
          <div className="text-sm font-semibold">Delivery</div>
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`rounded-full px-3 py-1 text-xs font-semibold capitalize transition-colors ${
                  filter === f
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-accent"
                }`}
              >
                {f} ({counts[f]})
              </button>
            ))}
          </div>
        </div>

        {shown.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            {messages.length === 0
              ? "No messages materialised yet."
              : "No messages match this filter."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-2.5 font-semibold">Recipient</th>
                  <th className="px-3 py-2.5 font-semibold">Channel</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-3 py-2.5 font-semibold">Provider</th>
                  <th className="px-3 py-2.5 font-semibold">Sent</th>
                </tr>
              </thead>
              <tbody>
                {shown.slice(0, 200).map((m) => (
                  <tr key={m.id} className="border-b last:border-0">
                    <td className="px-5 py-2.5 font-mono text-xs">{m.recipient}</td>
                    <td className="px-3 py-2.5 capitalize text-muted-foreground">
                      {m.channel}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${statusTone(
                          m.status,
                        )}`}
                      >
                        {(m.status === "sent" || m.status === "delivered") && (
                          <CheckCircle2 className="h-3 w-3" />
                        )}
                        {m.status === "failed" && <XCircle className="h-3 w-3" />}
                        {m.status}
                      </span>
                      {m.error_reason && (
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          {m.error_reason}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {m.provider ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {fmtDateTime(m.sent_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {shown.length > 200 && (
              <div className="px-5 py-3 text-center text-xs text-muted-foreground">
                Showing first 200 of {shown.length.toLocaleString()}.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
