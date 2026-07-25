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
  ChevronRight,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  type CampaignOut,
  type PaginatedCampaigns,
  isLive,
  statusTone,
} from "@/lib/campaigns";
import { useAuth } from "@/store/auth";

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
        // Keep refreshing while anything is still dispatching.
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

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Campaigns</h2>
          <p className="mt-1 text-muted-foreground">
            Compose and send bulk SMS &amp; email — personalised per recipient.
          </p>
        </div>
        <Link href="/dashboard/campaigns/new" className="btn-primary">
          <Send className="mr-2 h-4 w-4" /> New campaign
        </Link>
      </div>

      {loading && (
        <div className="mt-6 space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl border bg-card" />
          ))}
        </div>
      )}

      {empty && (
        <>
          <div className="mt-6 flex flex-col items-center justify-center rounded-xl border bg-card p-12 text-center animate-fade-up">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
              <Send className="h-7 w-7" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">No campaigns yet</h3>
            <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
              {hasContacts
                ? "Your contacts are ready. Open the composer to build and send your first personalised campaign."
                : "Import a contact list first, then compose your first personalised campaign."}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link href="/dashboard/campaigns/new" className="btn-primary">
                Open composer <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
              {!hasContacts && (
                <Link href="/dashboard/contacts" className="btn-outline">
                  Import contacts
                </Link>
              )}
            </div>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <div
                key={step.title}
                className="rounded-xl border bg-card p-5 animate-fade-up hover-lift"
                style={{ animationDelay: `${0.06 + i * 0.07}s` }}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <step.icon className="h-5 w-5" />
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h4 className="font-semibold">{step.title}</h4>
                </div>
                <p className="mt-1.5 text-sm text-muted-foreground">{step.desc}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {!loading && !empty && (
        <>
          {/* Summary */}
          <div className="mt-6 grid grid-cols-3 gap-4">
            {[
              { label: "Campaigns", value: summary.count.toLocaleString() },
              { label: "Delivered", value: summary.delivered.toLocaleString() },
              { label: "Failed", value: summary.failed.toLocaleString() },
            ].map((s, i) => (
              <div
                key={s.label}
                className="rounded-xl border bg-card p-4 animate-fade-up"
                style={{ animationDelay: `${i * 0.04}s` }}
              >
                <div className="text-2xl font-bold">{s.value}</div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          {/* List */}
          <div className="mt-5 overflow-hidden rounded-xl border bg-card animate-fade-up">
            <div className="hidden grid-cols-[1.6fr_0.8fr_0.9fr_0.7fr_0.7fr_0.9fr_auto] gap-4 border-b px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
              <span>Campaign</span>
              <span>Channel</span>
              <span>Status</span>
              <span className="text-right">Delivered</span>
              <span className="text-right">Failed</span>
              <span className="text-right">Rate</span>
              <span />
            </div>
            {(campaigns ?? []).map((c, i) => {
              const Icon = channelIcon(c.type);
              const live = isLive(c.status);
              return (
                <Link
                  key={c.id}
                  href={`/dashboard/campaigns/${c.id}`}
                  className="grid grid-cols-2 gap-3 border-b px-5 py-4 text-sm transition-colors last:border-0 hover:bg-accent/40 sm:grid-cols-[1.6fr_0.8fr_0.9fr_0.7fr_0.7fr_0.9fr_auto] sm:items-center sm:gap-4 animate-fade-up"
                  style={{ animationDelay: `${Math.min(i, 12) * 0.03}s` }}
                >
                  <div className="col-span-2 sm:col-span-1">
                    <div className="font-semibold">{c.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {fmtDate(c.created_at)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Icon className="h-4 w-4" />
                    <span className="capitalize">{c.type}</span>
                  </div>
                  <div>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${statusTone(
                        c.status,
                      )}`}
                    >
                      {live && (
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
                      )}
                      {c.status}
                    </span>
                  </div>
                  <div className="font-mono sm:text-right">
                    {sentOf(c).toLocaleString()}
                  </div>
                  <div className="font-mono sm:text-right">
                    <span className={failedOf(c) > 0 ? "text-destructive" : ""}>
                      {failedOf(c).toLocaleString()}
                    </span>
                  </div>
                  <div className="font-mono sm:text-right">{deliveryRate(c)}%</div>
                  <ChevronRight className="hidden h-4 w-4 text-muted-foreground sm:block" />
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
