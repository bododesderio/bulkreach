"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MessageSquare, Mail, BarChart3, Send, Clock, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
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
    desc: "Dispatch concurrently, then get a branded PDF report with delivery and failure breakdowns.",
  },
];

export default function CampaignsPage() {
  const { user } = useAuth();
  const [listCount, setListCount] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    api<unknown[]>("/contacts/lists", { auth: true })
      .then((l) => setListCount(l.length))
      .catch(() => setListCount(0));
  }, [user]);

  const hasContacts = (listCount ?? 0) > 0;

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

      {/* Empty state — honest: no dispatch history yet */}
      <div
        className="mt-6 flex flex-col items-center justify-center rounded-xl border bg-card p-12 text-center animate-fade-up"
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
          <Send className="h-7 w-7" />
        </div>
        <h3 className="mt-4 text-lg font-semibold">No campaigns sent yet</h3>
        <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
          {hasContacts
            ? "Your contacts are ready. Open the composer to build your first personalised campaign."
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

      {/* How it works */}
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

      <div
        className="mt-4 flex items-center gap-2 rounded-lg border border-amber/30 bg-amber/5 px-4 py-2.5 text-xs text-muted-foreground animate-fade-up"
        style={{ animationDelay: "0.3s" }}
      >
        <Clock className="h-3.5 w-3.5 text-amber" />
        Live dispatch, scheduling and delivery reports arrive in the next update (campaign engine).
      </div>
    </div>
  );
}
