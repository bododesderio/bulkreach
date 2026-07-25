"use client";

import { useAuth } from "@/store/auth";

export default function SettingsPage() {
  const { user, account } = useAuth();
  if (!user || !account) return null;

  const rows: [string, string][] = [
    ["Business name", account.name],
    ["Account email", account.email],
    ["Your email", user.email],
    ["Role", user.role],
    ["Plan", account.plan],
    ["Status", account.status],
    ["Trial messages left", String(account.trial_messages_remaining)],
  ];

  return (
    <div className="max-w-2xl">
      <p className="text-muted-foreground">Your account and profile details.</p>

      <div className="mt-6 rounded-xl border bg-card">
        <div className="border-b px-6 py-4">
          <h3 className="font-semibold">Account</h3>
        </div>
        <dl className="divide-y">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between px-6 py-3.5">
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="text-sm font-medium capitalize">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <p className="mt-4 text-sm text-muted-foreground">
        Team members, API keys, and white-label branding are available on the Business plan.
      </p>
    </div>
  );
}
