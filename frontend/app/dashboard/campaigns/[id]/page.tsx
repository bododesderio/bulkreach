/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
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
  XCircle,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, apiDownload } from "@/lib/api";
import { useApiQuery } from "@/lib/hooks";
import {
  type CampaignDetail,
  type MessageOut,
  type PaginatedMessages,
  type Progress,
  isLive,
  streamProgress,
  TERMINAL,
} from "@/lib/campaigns";
import { useAuth } from "@/store/auth";
import { Reveal, RevealGroup, RevealItem } from "@/components/admin/Reveal";
import CountUp from "@/components/admin/CountUp";
import DataTable, { Column } from "@/components/admin/DataTable";
import { StatusBadge } from "@/components/ui";

const cardBase = "bg-white border rounded-[11px] p-4";

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

  const [live, setLive] = useState<Progress | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [downloading, setDownloading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Load campaign + messages (React Query also drives the post-dispatch refetch).
  const { data, isError, refetch } = useApiQuery(
    ["dashboard", "campaign", id],
    async () => {
      const [detail, msgs] = await Promise.all([
        api<CampaignDetail>(`/campaigns/${id}`, { auth: true }),
        api<PaginatedMessages>(`/campaigns/${id}/messages?page_size=200`, {
          auth: true,
        }),
      ]);
      return { campaign: detail, messages: msgs.items };
    },
    { enabled: !!user },
  );
  const campaign = data?.campaign ?? null;
  const messages = useMemo(() => data?.messages ?? [], [data]);
  const notFound = isError;

  async function downloadReport() {
    setDownloading(true);
    try {
      await apiDownload(`/reports/campaigns/${id}/pdf`, "bulkreach-report.pdf");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not generate PDF");
    } finally {
      setDownloading(false);
    }
  }

  // Stream live progress while the campaign is dispatching; on a terminal event
  // clear the live overlay and refetch once for final stats + messages.
  useEffect(() => {
    if (!campaign || !isLive(campaign.status)) return;
    let active = true;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    streamProgress(
      id,
      (p) => {
        if (!active) return;
        setLive(p);
        if (TERMINAL.has(p.status)) {
          setLive(null);
          refetch();
        }
      },
      ctrl.signal,
    ).catch(() => {});

    return () => {
      active = false;
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign?.status, id]);

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
      return messages.filter(
        (m) => m.status === "sent" || m.status === "delivered",
      );
    if (filter === "failed") return messages.filter((m) => m.status === "failed");
    return messages.filter(
      (m) => !["sent", "delivered", "failed"].includes(m.status),
    );
  }, [messages, filter]);

  if (notFound) {
    return (
      <div className="space-y-[18px]">
        <Link
          href="/dashboard/campaigns"
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-teal hover:underline"
        >
          <ArrowLeft size={14} aria-hidden /> Campaigns
        </Link>
        <div className={cardBase}>
          <div className="py-12 text-center">
            <div className="font-display text-[14px] font-bold text-navy">
              Campaign not found
            </div>
            <p className="mt-1 text-[12px] text-text-muted">
              It may have been deleted, or the link is incorrect.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="space-y-[18px]">
        <div className="h-8 w-40 animate-pulse rounded-lg bg-bg" />
        <div className="h-24 animate-pulse rounded-[11px] border bg-bg" />
        <div className="h-64 animate-pulse rounded-[11px] border bg-bg" />
      </div>
    );
  }

  const stats = campaign.stats;
  const Icon =
    CHANNEL_ICON[campaign.type as keyof typeof CHANNEL_ICON] ?? MessageSquare;
  // Backend already returns delivery_rate as a percentage (0–100), not a fraction.
  const rate = stats ? Math.round(stats.delivery_rate) : 0;
  const running = live && !TERMINAL.has(live.status);

  const msgColumns: Column<MessageOut>[] = [
    {
      key: "recipient",
      label: "Recipient",
      render: (m) => (
        <span className="font-mono text-[11px] text-navy">{m.recipient}</span>
      ),
    },
    {
      key: "channel",
      label: "Channel",
      render: (m) => (
        <span className="capitalize text-text-muted">{m.channel}</span>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (m) => (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <StatusBadge domain="message" status={m.status} />
          {m.error_reason && (
            <span className="text-[10.5px] text-text-muted">
              {m.error_reason}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "provider",
      label: "Provider",
      render: (m) => (
        <span className="text-text-muted">{m.provider ?? "—"}</span>
      ),
    },
    {
      key: "sent_at",
      label: "Sent",
      render: (m) => (
        <span className="whitespace-nowrap text-text-muted">
          {fmtDateTime(m.sent_at)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-[18px]">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <Reveal>
        <Link
          href="/dashboard/campaigns"
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-teal hover:underline"
        >
          <ArrowLeft size={14} aria-hidden /> Campaigns
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-[20px] font-extrabold text-navy">
              {campaign.name}
            </h2>
            <StatusBadge domain="campaign" status={campaign.status} />
          </div>
          <button
            type="button"
            onClick={downloadReport}
            disabled={downloading}
            className="btn-outline h-9 px-3 text-sm"
          >
            {downloading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Report PDF
          </button>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-text-muted">
          <Icon size={14} aria-hidden />
          <span className="capitalize">{campaign.type}</span>
          <span>·</span>
          <span>Created {fmtDateTime(campaign.created_at)}</span>
          {campaign.completed_at && (
            <span>· Completed {fmtDateTime(campaign.completed_at)}</span>
          )}
        </div>
      </Reveal>

      {/* ── Live progress bar (SSE only while dispatching) ─────────────────── */}
      {running && live && (
        <Reveal delay={0.05}>
          <div className={cardBase}>
            <div className="mb-2 flex items-center gap-2">
              <Loader2
                size={15}
                className="animate-spin"
                style={{ color: "#00D4AA" }}
                aria-hidden
              />
              <span className="text-[13px] font-semibold text-navy">
                Dispatching…
              </span>
            </div>
            <div className="mb-1.5 flex items-center justify-between text-[10.5px] text-text-muted">
              <span>
                {live.sent.toLocaleString()} of {live.total.toLocaleString()}{" "}
                delivered
              </span>
              <span className="font-mono font-semibold text-navy">
                {Math.round(live.pct)}%
              </span>
            </div>
            <div
              className="h-1.5 w-full overflow-hidden rounded-full"
              style={{ background: "var(--bg)" }}
              role="progressbar"
              aria-valuenow={Math.round(live.pct)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${Math.round(live.pct)}% dispatched`}
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.round(live.pct)}%`,
                  background: "#00D4AA",
                }}
              />
            </div>
          </div>
        </Reveal>
      )}

      {/* ── Error banner ──────────────────────────────────────────────────── */}
      {campaign.status === "failed" && campaign.error_message && (
        <div
          className="flex gap-2.5 rounded-[11px] border p-4"
          style={{
            borderColor: "rgba(239,68,68,0.3)",
            background: "rgba(239,68,68,0.05)",
          }}
        >
          <XCircle
            size={15}
            className="mt-0.5 flex-shrink-0"
            style={{ color: "#EF4444" }}
            aria-hidden
          />
          <p className="text-[12px] text-text-muted">{campaign.error_message}</p>
        </div>
      )}

      {/* ── KPI tiles ─────────────────────────────────────────────────────── */}
      <RevealGroup className="grid grid-cols-2 gap-3 lg:grid-cols-4" stagger={0.06}>
        {[
          { label: "Recipients", value: stats?.total ?? 0, suffix: "" },
          { label: "Delivered", value: stats?.sent ?? 0, suffix: "" },
          { label: "Failed", value: stats?.failed ?? 0, suffix: "" },
          { label: "Delivery rate", value: rate, suffix: "%" },
        ].map((s) => (
          <RevealItem key={s.label} lift>
            <div className={`${cardBase} h-full`}>
              <div className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-text-muted">
                {s.label}
              </div>
              <div className="mt-1 font-mono text-[26px] font-semibold leading-tight text-navy">
                <CountUp value={s.value} suffix={s.suffix} />
              </div>
            </div>
          </RevealItem>
        ))}
      </RevealGroup>

      {/* ── Channel split (combined campaigns only) ───────────────────────── */}
      {campaign.type === "both" && stats && (
        <Reveal delay={0.2}>
          <div className="grid grid-cols-2 gap-3">
            <div className={cardBase}>
              <div className="flex items-center gap-1.5">
                <MessageSquare size={14} className="text-text-muted" aria-hidden />
                <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-text-muted">
                  SMS
                </span>
              </div>
              <div className="mt-1 text-[12px] text-text-muted">
                {stats.sms_sent.toLocaleString()} sent ·{" "}
                {stats.sms_failed.toLocaleString()} failed
              </div>
            </div>
            <div className={cardBase}>
              <div className="flex items-center gap-1.5">
                <Mail size={14} className="text-text-muted" aria-hidden />
                <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-text-muted">
                  Email
                </span>
              </div>
              <div className="mt-1 text-[12px] text-text-muted">
                {stats.email_sent.toLocaleString()} sent ·{" "}
                {stats.email_failed.toLocaleString()} failed
              </div>
            </div>
          </div>
        </Reveal>
      )}

      {/* ── Message content ───────────────────────────────────────────────── */}
      <Reveal delay={0.25}>
        <div className={cardBase}>
          <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.06em] text-text-muted">
            Message
          </div>
          {campaign.email_subject && (
            <div className="mt-2 text-[12px] text-text-md">
              <span className="text-text-muted">Subject: </span>
              {campaign.email_subject}
            </div>
          )}
          {campaign.sms_body && (
            <p className="mt-2 whitespace-pre-wrap text-[12px] leading-relaxed text-text-muted">
              {campaign.sms_body}
            </p>
          )}
        </div>
      </Reveal>

      {/* ── Per-message delivery table ────────────────────────────────────── */}
      <Reveal delay={0.3}>
        <div className="overflow-hidden rounded-[11px] border bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
            <div className="font-display text-[14px] font-bold text-navy">
              Delivery
            </div>
            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`rounded-[5px] border px-2 py-1 text-[11px] font-semibold capitalize transition-colors ${
                    filter === f
                      ? "border-navy bg-navy text-white"
                      : "text-text-muted hover:border-teal hover:text-teal"
                  }`}
                >
                  {f} ({counts[f]})
                </button>
              ))}
            </div>
          </div>
          <div className="p-4">
            <DataTable<MessageOut>
              columns={msgColumns}
              rows={shown.slice(0, 200)}
              rowKey={(m) => m.id}
              empty={
                messages.length === 0
                  ? "No messages materialised yet."
                  : "No messages match this filter."
              }
            />
            {shown.length > 200 && (
              <div className="pt-3 text-center text-[10.5px] text-text-muted">
                Showing first 200 of {shown.length.toLocaleString()}.
              </div>
            )}
          </div>
        </div>
      </Reveal>

    </div>
  );
}
