/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  MessageSquare,
  Mail,
  Layers,
  BarChart3,
  Send,
  ArrowRight,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  type CampaignOut,
  type PaginatedCampaigns,
  isLive,
} from "@/lib/campaigns";
import { useAuth } from "@/store/auth";
import { Reveal, RevealGroup, RevealItem } from "@/components/admin/Reveal";
import StatCard from "@/components/admin/StatCard";
import DataTable, { Column } from "@/components/admin/DataTable";
import { StatusPill } from "@/components/admin/StatusPill";

const cardBase = "bg-white border rounded-[11px] p-4";

const STATUS_COLOR: Record<string, { color: string; pulse?: boolean }> = {
  draft: { color: "#9CA3AF" },
  scheduled: { color: "#6366F1" },
  queued: { color: "#00D4AA", pulse: true },
  sending: { color: "#00D4AA", pulse: true },
  sent: { color: "#10B981" },
  completed: { color: "#10B981" },
  paused: { color: "#F59E0B" },
  paused_quota_exceeded: { color: "#F59E0B" },
  failed: { color: "#EF4444" },
  cancelled: { color: "#EF4444" },
};

function statusPill(status: string) {
  const c = STATUS_COLOR[status.toLowerCase()] ?? { color: "#9CA3AF" };
  return (
    <StatusPill
      label={status.replace(/_/g, " ")}
      color={c.color}
      pulse={c.pulse}
    />
  );
}

const STEPS = [
  {
    icon: MessageSquare,
    title: "Pick your audience",
    desc: "Choose an imported contact list. Phone and email columns are detected automatically.",
  },
  {
    icon: Mail,
    title: "Compose once",
    desc: "Write your SMS or email with merge tags — every recipient gets their own personalised copy.",
  },
  {
    icon: BarChart3,
    title: "Send & measure",
    desc: "Dispatch concurrently, then watch live delivery and failure breakdowns in real time.",
  },
];

const CHANNEL_ICON = { sms: MessageSquare, email: Mail, both: Layers } as const;

function channelIcon(type: string) {
  return CHANNEL_ICON[type as keyof typeof CHANNEL_ICON] ?? MessageSquare;
}

function sentOf(c: CampaignOut): number {
  return c.sms_sent + c.email_sent;
}
function failedOf(c: CampaignOut): number {
  return c.sms_failed + c.email_failed;
}
function deliveryRate(c: CampaignOut): number {
  const s = sentOf(c);
  const f = failedOf(c);
  return s + f === 0 ? 0 : Math.round((s / (s + f)) * 100);
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

export default function CampaignsPage() {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<CampaignOut[] | null>(null);
  const [listCount, setListCount] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;

    const load = async () => {
      try {
        const [page, lists] = await Promise.all([
          api<PaginatedCampaigns>("/campaigns?page_size=100", { auth: true }),
          api<unknown[]>("/contacts/lists", { auth: true }),
        ]);
        if (!active) return;
        setCampaigns(page.items);
        setListCount(lists.length);
        if (page.items.some((c) => isLive(c.status))) {
          pollRef.current = setTimeout(load, 3000);
        }
      } catch {
        if (active) setCampaigns([]);
      }
    };

    load();
    return () => {
      active = false;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [user]);

  const summary = useMemo(() => {
    const list = campaigns ?? [];
    const delivered = list.reduce((n, c) => n + sentOf(c), 0);
    const failed = list.reduce((n, c) => n + failedOf(c), 0);
    return { count: list.length, delivered, failed };
  }, [campaigns]);

  const hasContacts = (listCount ?? 0) > 0;
  const loading = campaigns === null;
  const empty = !loading && campaigns.length === 0;

  const campaignColumns: Column<CampaignOut>[] = [
    {
      key: "name",
      label: "Campaign",
      render: (c) => (
        <div>
          <Link
            href={`/dashboard/campaigns/${c.id}`}
            className="font-semibold text-navy hover:text-teal transition-colors"
          >
            {c.name}
          </Link>
          <div className="text-[10.5px] text-text-muted mt-0.5">
            {fmtDate(c.created_at)}
          </div>
        </div>
      ),
    },
    {
      key: "type",
      label: "Channel",
      render: (c) => {
        const Icon = channelIcon(c.type);
        return (
          <span className="inline-flex items-center gap-1.5 text-text-muted capitalize">
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {c.type}
          </span>
        );
      },
    },
    {
      key: "status",
      label: "Status",
      render: (c) => statusPill(c.status),
    },
    {
      key: "delivered",
      label: "Delivered",
      align: "right",
      render: (c) => (
        <span className="font-mono">{sentOf(c).toLocaleString()}</span>
      ),
    },
    {
      key: "failed",
      label: "Failed",
      align: "right",
      render: (c) => (
        <span
          className={`font-mono ${failedOf(c) > 0 ? "text-[#EF4444]" : ""}`}
        >
          {failedOf(c).toLocaleString()}
        </span>
      ),
    },
    {
      key: "rate",
      label: "Rate",
      align: "right",
      render: (c) => (
        <span className="font-mono">{deliveryRate(c)}%</span>
      ),
    },
  ];

  return (
    <div className="space-y-[18px]">

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <Reveal>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-[20px] font-extrabold text-navy">
              Campaigns
            </h2>
            <p className="mt-0.5 text-[12px] text-text-muted">
              Compose and send bulk SMS &amp; email — personalised per recipient.
            </p>
          </div>
          <Link href="/dashboard/campaigns/new" className="btn-primary">
            <Send className="mr-2 h-4 w-4" aria-hidden /> New campaign
          </Link>
        </div>
      </Reveal>

      {/* ── Loading skeletons ─────────────────────────────────────────────────── */}
      {loading && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded-[11px] border bg-bg"
            />
          ))}
        </div>
      )}

      {/* ── Empty state ───────────────────────────────────────────────────────── */}
      {empty && (
        <>
          <Reveal delay={0.1}>
            <div
              className={`${cardBase} flex flex-col items-center justify-center py-12 text-center`}
            >
              <div
                className="flex h-11 w-11 items-center justify-center rounded-xl"
                style={{ background: "rgba(0,212,170,0.12)", color: "#00D4AA" }}
              >
                <Send className="h-5 w-5" aria-hidden />
              </div>
              <p className="mt-3 font-semibold text-navy">No campaigns yet</p>
              <p className="mt-1.5 max-w-md text-[12px] text-text-muted">
                {hasContacts
                  ? "Your contacts are ready. Open the composer to build and send your first personalised campaign."
                  : "Import a contact list first, then compose your first personalised campaign."}
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Link href="/dashboard/campaigns/new" className="btn-primary">
                  Open composer <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                </Link>
                {!hasContacts && (
                  <Link href="/dashboard/contacts" className="btn-outline">
                    Import contacts
                  </Link>
                )}
              </div>
            </div>
          </Reveal>

          <RevealGroup className="grid gap-3 sm:grid-cols-3" stagger={0.07}>
            {STEPS.map((step) => (
              <RevealItem key={step.title} lift>
                <div className={`${cardBase} h-full`}>
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-lg"
                    style={{ background: "var(--bg)", color: "var(--navy)" }}
                  >
                    <step.icon className="h-5 w-5" aria-hidden />
                  </div>
                  <p className="mt-3 font-display text-[14px] font-bold text-navy">
                    {step.title}
                  </p>
                  <p className="mt-1 text-[11px] text-text-muted">{step.desc}</p>
                </div>
              </RevealItem>
            ))}
          </RevealGroup>
        </>
      )}

      {/* ── Loaded state ──────────────────────────────────────────────────────── */}
      {!loading && !empty && (
        <>
          {/* Summary stat cards */}
          <RevealGroup className="grid gap-3 sm:grid-cols-3" stagger={0.07}>
            <RevealItem lift>
              <StatCard
                label="Campaigns"
                value={summary.count}
                icon={Send}
                changeType="up"
              />
            </RevealItem>
            <RevealItem lift>
              <StatCard
                label="Delivered"
                value={summary.delivered}
                icon={Mail}
                changeType="up"
              />
            </RevealItem>
            <RevealItem lift>
              <StatCard
                label="Failed"
                value={summary.failed}
                icon={MessageSquare}
                changeType={summary.failed > 0 ? "down" : "up"}
                warn={summary.failed > 0}
              />
            </RevealItem>
          </RevealGroup>

          {/* Campaign table */}
          <Reveal delay={0.25}>
            <div className={cardBase}>
              <div className="font-display text-[14px] font-bold text-navy mb-3">
                All campaigns
              </div>
              <DataTable<CampaignOut>
                columns={campaignColumns}
                rows={campaigns ?? []}
                rowKey={(c) => c.id}
              />
            </div>
          </Reveal>
        </>
      )}
    </div>
  );
}
