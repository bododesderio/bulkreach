"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FileBarChart, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, apiDownload } from "@/lib/api";
import { type ReportSummary, statusTone } from "@/lib/campaigns";
import { useAuth } from "@/store/auth";

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
  const [data, setData] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoading(true);
    api<ReportSummary>(`/reports/summary?period=${period}`, { auth: true })
      .then((d) => active && setData(d))
      .catch(() => active && setData(null))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [user, period]);

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

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Reports</h2>
          <p className="mt-1 text-muted-foreground">
            Analytics and branded client-success PDFs from your sent campaigns.
          </p>
        </div>
        <div className="flex gap-1.5">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                period === p.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-accent"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="mt-6 space-y-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl border bg-card" />
            ))}
          </div>
          <div className="h-56 animate-pulse rounded-xl border bg-card" />
        </div>
      )}

      {empty && (
        <div className="mt-6 flex flex-col items-center justify-center rounded-xl border bg-card p-12 text-center animate-fade-up">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
            <FileBarChart className="h-7 w-7" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">No campaign data yet</h3>
          <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
            Send a campaign and its analytics — plus a branded PDF report — appear here.
          </p>
          <Link href="/dashboard/campaigns/new" className="btn-primary mt-6">
            Create a campaign
          </Link>
        </div>
      )}

      {!loading && data && data.campaigns > 0 && (
        <>
          {/* KPIs */}
          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { label: "Campaigns", value: data.campaigns.toLocaleString(), tone: "text-foreground" },
              { label: "Delivered", value: data.delivered.toLocaleString(), tone: "text-primary" },
              { label: "Failed", value: data.failed.toLocaleString(), tone: "text-destructive" },
              { label: "Delivery rate", value: `${Math.round(data.delivery_rate)}%`, tone: "text-foreground" },
            ].map((s, i) => (
              <div
                key={s.label}
                className="rounded-xl border bg-card p-4 animate-fade-up"
                style={{ animationDelay: `${i * 0.04}s` }}
              >
                <div className={`text-2xl font-bold ${s.tone}`}>{s.value}</div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            {/* Delivery over time */}
            <div className="rounded-xl border bg-card p-5 animate-fade-up">
              <div className="text-sm font-semibold">Delivery over time</div>
              <p className="mb-4 text-xs text-muted-foreground">
                Messages delivered per day.
              </p>
              {data.daily.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  No deliveries in this period.
                </div>
              ) : (
                <div className="flex h-40 items-end gap-1.5">
                  {data.daily.map((d) => (
                    <div
                      key={d.date}
                      className="min-w-[6px] flex-1 rounded-t bg-primary/70 transition-colors hover:bg-primary"
                      style={{ height: `${Math.max(4, (d.delivered / peak) * 100)}%` }}
                      title={`${d.date}: ${d.delivered.toLocaleString()} delivered`}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Channel breakdown */}
            <div className="rounded-xl border bg-card p-5 animate-fade-up">
              <div className="text-sm font-semibold">By channel</div>
              <p className="mb-4 text-xs text-muted-foreground">Delivered vs failed.</p>
              <div className="space-y-4">
                {[
                  { label: "SMS", sent: data.channels.sms_sent, failed: data.channels.sms_failed },
                  { label: "Email", sent: data.channels.email_sent, failed: data.channels.email_failed },
                ].map((c) => {
                  const total = c.sent + c.failed;
                  const pct = total ? (c.sent / total) * 100 : 0;
                  return (
                    <div key={c.label}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-semibold">{c.label}</span>
                        <span className="text-muted-foreground">
                          {c.sent.toLocaleString()} sent · {c.failed.toLocaleString()} failed
                        </span>
                      </div>
                      <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                        {total > 0 && (
                          <>
                            <div className="bg-primary" style={{ width: `${pct}%` }} />
                            <div className="bg-destructive" style={{ width: `${100 - pct}%` }} />
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Recent campaigns + PDF download */}
          <div className="mt-5 overflow-hidden rounded-xl border bg-card animate-fade-up">
            <div className="border-b px-5 py-3 text-sm font-semibold">
              Recent campaigns
            </div>
            {data.recent.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3 last:border-0"
              >
                <div className="min-w-0">
                  <Link
                    href={`/dashboard/campaigns/${c.id}`}
                    className="font-semibold hover:text-primary"
                  >
                    {c.name}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {fmtDate(c.created_at)} · {c.delivered.toLocaleString()} delivered ·{" "}
                    {Math.round(c.delivery_rate)}% rate
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${statusTone(
                      c.status,
                    )}`}
                  >
                    {c.status}
                  </span>
                  <button
                    type="button"
                    onClick={() => download(c.id)}
                    disabled={downloading === c.id}
                    className="btn-outline h-8 px-3 text-xs"
                  >
                    {downloading === c.id ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    PDF
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
