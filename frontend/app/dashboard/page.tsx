"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MessageSquare, Send, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";

export default function DashboardPage() {
  const { user, account } = useAuth();
  const [listCount, setListCount] = useState<number | null>(null);

  useEffect(() => {
    if (user) {
      api<unknown[]>("/contacts/lists", { auth: true })
        .then((l) => setListCount(l.length))
        .catch(() => setListCount(0));
    }
  }, [user]);

  if (!user || !account) return null;

  return (
    <div>
      <h2 className="text-2xl font-bold" data-testid="welcome">
        Welcome back, {user.email.split("@")[0]}
      </h2>
      <p className="mt-1 text-muted-foreground">
        Plan: <span className="font-medium capitalize text-foreground">{account.plan}</span> · Role:{" "}
        <span className="font-medium text-foreground">{user.role}</span>
      </p>

      <div className="mt-8 grid gap-6 sm:grid-cols-3">
        <StatCard icon={MessageSquare} label="Trial messages left" value={String(account.trial_messages_remaining)} />
        <StatCard icon={Users} label="Contact lists" value={listCount === null ? "…" : String(listCount)} />
        <StatCard icon={Send} label="Campaigns sent" value="0" />
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/dashboard/contacts" data-testid="go-contacts" className="btn-primary">
          <Users className="mr-2 h-4 w-4" /> Import contacts
        </Link>
        <Link href="/dashboard/campaigns" data-testid="go-new-campaign" className="btn-outline">
          <Send className="mr-2 h-4 w-4" /> New campaign
        </Link>
      </div>

      <div className="mt-8 rounded-xl border bg-card p-10 text-center">
        <p className="text-muted-foreground">
          {listCount && listCount > 0
            ? "Contacts ready. Create a campaign to reach them."
            : "Start by importing a contact list, then compose your first campaign."}
        </p>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-6">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
        <Icon className="h-5 w-5" />
      </div>
      <div className="mt-4 text-2xl font-bold">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}
