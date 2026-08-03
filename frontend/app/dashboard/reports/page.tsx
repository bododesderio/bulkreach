/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FileBarChart, Download, Loader2, Send, AlertTriangle, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, apiDownload } from "@/lib/api";
import { useApiQuery } from "@/lib/hooks";
import { type ReportSummary, type CampaignSummaryRow } from "@/lib/campaigns";
import { useAuth } from "@/store/auth";
import { Reveal, RevealGroup, RevealItem } from "@/components/admin/Reveal";
import StatCard from "@/components/admin/StatCard";
import DataTable, { Column } from "@/components/admin/DataTable";
import { StatusBadge, DataState } from "@/components/ui";

const cardBase = "bg-white border rounded-[11px] p-4";

const PERIODS = [
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "all", label: "All time" },
] as const;

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

export default function ReportsPage() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<string>("30d");
  const [downloading, setDownloading] = useState<string | null>(null);

  const { data, isLoading: loading, isError, error, refetch } = useApiQuery(
    ["dashboard", "reports", period],
    () =>
      api<ReportSummary>(`/reports/summary?period=${period}`, {
        auth: true,
      }),
    { enabled: !!user },
  );

  const peak = useMemo(
    () => Math.max(1, ...(data?.daily.map((d) => d.delivered) ?? [1])),
    [data],
  );

  async function download(id: string) {
    setDownloading(id);
    try {
      await apiDownload(`/reports/campaigns/${id}/pdf`, "bulkreach-report.pdf");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not generate PDF");
    } finally {
      setDownloading(null);
    }
  }

  const empty = !loading && data && data.campaigns === 0;

  const campaignColumns: Column<CampaignSummaryRow>[] = [
    {
      key: "name",
      label: "Campaign",
      render: (c) => (
        <Link
          href={`/dashboard/campaigns/${c.id}`}
          className="font-semibold text-navy hover:text-teal transition-colors"
        >
          {c.name}
        </Link>
      ),
    },
    {
      key: "created_at",
      label: "Date",
      render: (c) => (
        <span className="text-text-muted whitespace-nowrap">{fmtDate(c.created_at)}</span>
      ),
    },
    {
      key: "delivered",
      label: "Delivered",
      render: (c) => (
        <span className="font-mono text-navy">{c.delivered.toLocaleString()}</span>
      ),
    },
    {
      key: "delivery_rate",
      label: "Rate",
      render: (c) => (
        <span className="font-mono text-navy">{Math.round(c.delivery_rate)}%</span>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (c) => <StatusBadge domain="campaign" status={c.status} />,
    },
    {
      key: "actions",
      label: "",
      align: "right",
      render: (c) => (
        <button
          type="button"
          onClick={() => download(c.id)}
          disabled={downloading === c.id}
          className="inline-flex items-center gap-1 text-[11px] rounded-[5px] border font-semibold px-2 py-1 text-navy hover:text-teal hover:border-teal transition-colors disabled:opacity-50"
        >
          {downloading === c.id ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Download className="h-3 w-3" />
          )}
          PDF
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-[18px]">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <Reveal>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-[20px] font-extrabold text-navy">Reports</h2>
            <p className="mt-0.5 text-[12px] text-text-muted">
              Analytics and branded client-success PDFs from your sent campaigns.
            </p>
          </div>
          <div className="flex gap-1">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPeriod(p.key)}
                className={`text-[11px] rounded-[5px] font-semibold px-2.5 py-1 border transition-colors ${
                  period === p.key
                    ? "border-teal text-teal"
                    : "border-transparent text-text-muted hover:text-navy"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </Reveal>

      {/* ── Loading skeletons ─────────────────────────────────────────────── */}
      {loading && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-[11px] border bg-bg" />
            ))}
          </div>
          <div className="h-56 animate-pulse rounded-[11px] border bg-bg" />
        </div>
      )}

      {/* ── Error state ───────────────────────────────────────────────────── */}
      {isError && (
        <Reveal>
          <div className={cardBase}>
            <DataState
              error={error}
              onRetry={() => refetch()}
            />
          </div>
        </Reveal>
      )}

      {/* ── Empty state ───────────────────────────────────────────────────── */}
      {empty && (
        <Reveal>
          <div className={`${cardBase} flex flex-col items-center justify-center py-12 text-center`}>
            <div
              className="flex h-11 w-11 items-center justify-center rounded-xl"
              style={{ background: "rgba(0,212,170,0.12)", color: "#00D4AA" }}
            >
              <FileBarChart className="h-5 w-5" aria-hidden />
            </div>
            <p className="mt-3 font-semibold text-navy">No campaign data yet</p>
            <p className="mt-1 max-w-xs text-[12px] text-text-muted">
              Send a campaign and its analytics — plus a branded PDF report — appear here.
            </p>
            <Link href="/dashboard/campaigns/new" className="btn-primary mt-5">
              Create a campaign
            </Link>
          </div>
        </Reveal>
      )}

      {/* ── Data ─────────────────────────────────────────────────────────── */}
      {!loading && data && data.campaigns > 0 && (
        <>
          {/* KPI stat cards */}
          <RevealGroup className="grid grid-cols-2 gap-3 lg:grid-cols-4" stagger={0.07}>
            <RevealItem lift>
              <StatCard
                label="Campaigns"
                value={data.campaigns}
                icon={FileBarChart}
                changeType="up"
              />
            </RevealItem>
            <RevealItem lift>
              <StatCard
                label="Delivered"
                value={data.delivered}
                icon={Send}
                changeType="up"
              />
            </RevealItem>
            <RevealItem lift>
              <StatCard
                label="Failed"
                value={data.failed}
                icon={AlertTriangle}
                changeType="down"
              />
            </RevealItem>
            <RevealItem lift>
              <StatCard
                label="Delivery rate"
                value={Math.round(data.delivery_rate)}
                icon={TrendingUp}
                suffix="%"
                changeType="up"
              />
            </RevealItem>
          </RevealGroup>

          {/* Charts row */}
          <Reveal delay={0.25}>
            <div className="grid gap-[18px] lg:grid-cols-[1.4fr_1fr]">

              {/* Delivery over time */}
              <div className={cardBase}>
                <div className="font-display text-[14px] font-bold text-navy">
                  Delivery over time
                </div>
                <p className="mb-4 mt-0.5 text-[11px] text-text-muted">
                  Messages delivered per day.
                </p>
                {data.daily.length === 0 ? (
                  <div className="py-10 text-center text-[12px] text-text-muted">
                    No deliveries in this period.
                  </div>
                ) : (
                  <div className="flex h-40 items-end gap-1.5">
                    {data.daily.map((d) => (
                      <div
                        key={d.date}
                        className="min-w-[6px] flex-1 rounded-t transition-colors"
                        style={{
                          height: `${Math.max(4, (d.delivered / peak) * 100)}%`,
                          background: "rgba(0,212,170,0.7)",
                        }}
                        title={`${d.date}: ${d.delivered.toLocaleString()} delivered`}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Channel breakdown */}
              <div className={cardBase}>
                <div className="font-display text-[14px] font-bold text-navy">By channel</div>
                <p className="mb-4 mt-0.5 text-[11px] text-text-muted">Delivered vs failed.</p>
                <div className="space-y-4">
                  {[
                    { label: "SMS", sent: data.channels.sms_sent, failed: data.channels.sms_failed },
                    { label: "Email", sent: data.channels.email_sent, failed: data.channels.email_failed },
                  ].map((c) => {
                    const total = c.sent + c.failed;
                    const pct = total ? (c.sent / total) * 100 : 0;
                    return (
                      <div key={c.label}>
                        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-2">
                          <span className="text-[12px] font-semibold text-navy">{c.label}</span>
                          <span className="text-[10.5px] text-text-muted">
                            {c.sent.toLocaleString()} sent · {c.failed.toLocaleString()} failed
                          </span>
                        </div>
                        <div
                          className="flex h-2 overflow-hidden rounded-full"
                          style={{ background: "var(--bg)" }}
                        >
                          {total > 0 && (
                            <>
                              <div style={{ width: `${pct}%`, background: "#00D4AA" }} />
                              <div style={{ width: `${100 - pct}%`, background: "#EF4444" }} />
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          </Reveal>

          {/* Recent campaigns */}
          <Reveal delay={0.35}>
            <div className={cardBase}>
              <div className="mb-3 font-display text-[14px] font-bold text-navy">
                Recent campaigns
              </div>
              <DataTable<CampaignSummaryRow>
                columns={campaignColumns}
                rows={data.recent}
                rowKey={(c) => c.id}
              />
            </div>
          </Reveal>
        </>
      )}

    </div>
  );
}
