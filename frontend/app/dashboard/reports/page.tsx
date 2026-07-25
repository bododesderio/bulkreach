"use client";

import { FileBarChart, CheckCircle2, Download, Sparkles } from "lucide-react";

const METRICS = [
  { label: "Delivered", value: "98.4%", color: "text-success" },
  { label: "Open rate", value: "42.1%", color: "text-primary" },
  { label: "Failed", value: "1.6%", color: "text-amber" },
];

export default function ReportsPage() {
  return (
    <div>
      <h2 className="text-2xl font-bold">Reports</h2>
      <p className="mt-1 text-muted-foreground">
        Analytics and branded client-success PDFs, generated after every campaign.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
        {/* Empty state — honest */}
        <div className="flex flex-col items-center justify-center rounded-xl border bg-card p-10 text-center animate-fade-up">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
            <FileBarChart className="h-7 w-7" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">No reports yet</h3>
          <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
            A branded analytics PDF is generated automatically when a campaign completes. Send your
            first campaign to see reports here.
          </p>
          <ul className="mt-5 space-y-2 text-left text-sm text-muted-foreground">
            {[
              "Delivery, open and failure rates",
              "Per-provider breakdown (SMS + email)",
              "Your logo and custom header",
              "Auto-emailed to your client",
            ].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-success" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Sample report preview — clearly labelled */}
        <div
          className="rounded-xl border bg-card p-5 animate-fade-up hover-lift"
          style={{ animationDelay: "0.08s" }}
        >
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-primary" /> Sample report
            </div>
            <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Preview
            </span>
          </div>

          <div className="rounded-lg border p-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <div className="font-display font-bold text-navy">Campaign report</div>
                <div className="text-xs text-muted-foreground">July price update · 88,400 recipients</div>
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal text-navy-dark">
                <FileBarChart className="h-4 w-4" />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3">
              {METRICS.map((m) => (
                <div key={m.label} className="rounded-lg bg-muted/60 p-3 text-center">
                  <div className={`font-mono text-lg font-bold ${m.color}`}>{m.value}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">{m.label}</div>
                </div>
              ))}
            </div>

            {/* faux delivery-over-time bars */}
            <div className="mt-4">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Delivery over time
              </div>
              <div className="flex h-16 items-end gap-1">
                {[40, 62, 55, 78, 90, 84, 70, 95, 88, 60, 72, 50].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t bg-teal/70"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
            </div>
          </div>

          <button
            type="button"
            className="btn-outline mt-4 w-full"
            disabled
            title="Reports generate after your first completed campaign"
          >
            <Download className="mr-2 h-4 w-4" /> Download PDF
          </button>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Illustrative sample — not a real campaign.
          </p>
        </div>
      </div>
    </div>
  );
}
