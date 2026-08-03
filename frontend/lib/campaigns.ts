/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
"use client";

import { getToken } from "@/lib/api";

export type CampaignType = "sms" | "email" | "both";
/** Alias used by the composer's channel picker. */
export type Channel = CampaignType;

export interface CampaignOut {
  id: string;
  account_id: string;
  contact_list_id: string | null;
  name: string;
  type: string;
  status: string;
  sms_body: string | null;
  email_subject: string | null;
  scheduled_at: string | null;
  completed_at: string | null;
  messages_sent: number;
  sms_sent: number;
  sms_failed: number;
  email_sent: number;
  email_failed: number;
  elapsed_seconds: number | null;
  error_message: string | null;
  created_at: string;
}

export interface CampaignStats {
  total: number;
  queued: number;
  sending: number;
  sent: number;
  failed: number;
  sms_sent: number;
  sms_failed: number;
  email_sent: number;
  email_failed: number;
  delivered: number;
  bounced: number;
  delivery_rate: number;
  delivered_rate: number;
  clicks: number;
  click_rate: number;
}

export interface CampaignDetail extends CampaignOut {
  stats: CampaignStats | null;
  recipient_estimate: number | null;
}

export interface PaginatedCampaigns {
  items: CampaignOut[];
  total: number;
  page: number;
  page_size: number;
}

export interface MessageOut {
  id: string;
  channel: string;
  recipient: string;
  status: string;
  attempts: number;
  provider: string | null;
  provider_message_id: string | null;
  error_reason: string | null;
  sent_at: string | null;
}

export interface PaginatedMessages {
  items: MessageOut[];
  total: number;
  page: number;
  page_size: number;
}

export interface ChannelBreakdown {
  sms_sent: number;
  sms_failed: number;
  email_sent: number;
  email_failed: number;
}

export interface CampaignSummaryRow {
  id: string;
  name: string;
  type: string;
  status: string;
  delivered: number;
  failed: number;
  delivery_rate: number; // percentage 0–100
  created_at: string;
  completed_at: string | null;
}

export interface ReportSummary {
  period: string;
  campaigns: number;
  recipients: number;
  delivered: number;
  failed: number;
  delivery_rate: number; // percentage 0–100
  channels: ChannelBreakdown;
  daily: { date: string; delivered: number }[];
  recent: CampaignSummaryRow[];
}

export interface SendResponse {
  id: string;
  status: string;
  queued_messages: number;
  recipients: number;
}

export interface Progress {
  status: string;
  total: number;
  sent: number;
  failed: number;
  pending: number;
  pct: number;
}

export const TERMINAL = new Set(["completed", "cancelled", "failed"]);

/** True while a campaign is still moving through the dispatch pipeline. */
export function isLive(status: string): boolean {
  return status === "queued" || status === "sending";
}

/** Tailwind classes for a status badge, keyed by campaign/message status. */
export function statusTone(status: string): string {
  switch (status) {
    case "completed":
    case "sent":
    case "delivered":
      return "bg-primary/10 text-primary";
    case "sending":
    case "queued":
    case "pending":
      return "bg-amber/10 text-amber";
    case "failed":
    case "cancelled":
      return "bg-destructive/10 text-destructive";
    case "draft":
    case "scheduled":
      return "bg-secondary text-secondary-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

/**
 * Consume the SSE dispatch stream with a fetch reader so the Bearer token
 * travels in a header (EventSource can't set Authorization). Resolves when
 * the stream ends; aborts cleanly via the signal.
 */
export async function streamProgress(
  campaignId: string,
  onData: (p: Progress) => void,
  signal: AbortSignal,
): Promise<void> {
  const token = getToken();
  const res = await fetch(`/api/v1/campaigns/${campaignId}/progress`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    credentials: "include",
    signal,
  });
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const line = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      try {
        onData(JSON.parse(line.slice(5).trim()) as Progress);
      } catch {
        /* ignore malformed frame */
      }
    }
  }
}
