'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  ArrowRight,
  CreditCard,
  FileBarChart,
  MessageSquare,
  Send,
  Users,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';
import {
  type CampaignOut,
  type PaginatedCampaigns,
  statusTone,
} from '@/lib/campaigns';
import { Reveal, RevealGroup, RevealItem } from '@/components/admin/Reveal';

// ── Types ─────────────────────────────────────────────────────────────────────
// Render shape (mapped from the API's monthly_* fields below).
interface QuotaResponse {
  used: number;
  limit: number | null; // null = unlimited
  is_trial: boolean;
  trial_limit: number;
  monthly_resets_at: string | null;
}

// Exactly what GET /subscription/quota returns.
interface QuotaApi {
  monthly_used: number;
  monthly_limit: number | null;
  is_trial?: boolean;
  monthly_resets_at: string | null;
}

interface ContactList {
  id: string;
  name: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtWhen(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

function usageBarColor(pct: number): string {
  if (pct >= 90) return '#EF4444';
  if (pct >= 80) return '#F59E0B';
  return '#00D4AA';
}

function planBadgeClass(plan: string): string {
  switch (plan.toLowerCase()) {
    case 'pro':     return 'bg-[rgba(0,212,170,0.12)] text-teal';
    case 'growth':  return 'bg-primary/10 text-primary';
    case 'starter': return 'bg-accent text-accent-foreground';
    default:        return 'bg-muted text-muted-foreground';
  }
}

function statusBadgeClass(status: string): string {
  switch (status.toLowerCase()) {
    case 'active':    return 'bg-[rgba(16,185,129,0.1)] text-success';
    case 'trial':     return 'bg-[rgba(245,158,11,0.1)] text-amber';
    case 'suspended':
    case 'cancelled': return 'bg-destructive/10 text-destructive';
    default:          return 'bg-muted text-muted-foreground';
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────
function UsageBar({ used, limit }: { used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const color = usageBarColor(pct);
  return (
    <div className="mt-3">
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${pct}% of monthly quota used`}
      >
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10.5px] text-muted-foreground">
        <span style={{ color }}>{pct}% used</span>
        <span>
          {used.toLocaleString()} / {limit.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user, account } = useAuth();

  const [quota, setQuota]           = useState<QuotaResponse | null>(null);
  const [quotaError, setQuotaError] = useState(false);
  const [listCount, setListCount]   = useState<number | null>(null);
  const [campaigns, setCampaigns]   = useState<CampaignOut[] | null>(null);
  const [totalCampaigns, setTotalCampaigns] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;

    api<QuotaApi>('/subscription/quota', { auth: true })
      .then((q) =>
        setQuota({
          used: q.monthly_used ?? 0,
          limit: q.monthly_limit ?? null,
          is_trial: !!q.is_trial,
          trial_limit: q.monthly_limit ?? 0,
          monthly_resets_at: q.monthly_resets_at ?? null,
        }),
      )
      .catch(() => setQuotaError(true));

    api<ContactList[]>('/contacts/lists', { auth: true })
      .then((lists) => setListCount(lists.length))
      .catch(() => setListCount(0));

    api<PaginatedCampaigns>('/campaigns?page=1&page_size=100', { auth: true })
      .then((res) => {
        setCampaigns(res.items);
        setTotalCampaigns(res.total);
      })
      .catch(() => {
        setCampaigns([]);
        setTotalCampaigns(0);
      });
  }, [user]);

  if (!user || !account) return null;

  const name = account.name || user.email.split('@')[0];
  const campaignsLoading = campaigns === null;
  const recentCampaigns  = (campaigns ?? []).slice(0, 5);
  const resetDays        = quota?.monthly_resets_at != null
    ? daysUntil(quota.monthly_resets_at)
    : null;

  return (
    <div className="space-y-8">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <Reveal>
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-2xl font-bold" data-testid="welcome">
              Welcome back, {name}
            </h2>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${planBadgeClass(account.plan)}`}
            >
              {account.plan}
            </span>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${statusBadgeClass(account.status)}`}
            >
              {account.status}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Here&apos;s what&apos;s happening with your account today.
          </p>
        </div>
      </Reveal>

      {/* ── Stat cards (4-up) ────────────────────────────────────────────── */}
      <RevealGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" stagger={0.07}>

        {/* Messages this month */}
        <RevealItem lift>
          <div className="flex h-full flex-col rounded-xl border bg-card p-6">
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
                Messages this month
              </span>
              <MessageSquare className="h-4 w-4 text-muted-foreground" aria-hidden />
            </div>

            {/* Loading */}
            {quota === null && !quotaError && (
              <>
                <div className="mt-3 h-8 animate-pulse rounded bg-muted" />
                <div className="mt-3 h-1.5 animate-pulse rounded-full bg-muted" />
              </>
            )}

            {/* Error */}
            {quotaError && (
              <div className="mt-3 text-2xl font-bold text-muted-foreground">—</div>
            )}

            {/* Data */}
            {quota !== null && !quotaError && (
              <>
                <div className="mt-3 text-2xl font-bold">
                  {quota.limit === null ? 'Unlimited' : quota.used.toLocaleString()}
                </div>

                {quota.limit !== null && <UsageBar used={quota.used} limit={quota.limit} />}

                {quota.limit === null && (
                  <p className="mt-1.5 text-[10.5px] text-muted-foreground">
                    No usage cap on your plan
                  </p>
                )}

                {quota.is_trial && (
                  <p
                    className="mt-1.5 text-[10.5px] font-semibold"
                    style={{ color: '#F59E0B' }}
                  >
                    Trial &middot; {quota.trial_limit.toLocaleString()} msg allowance
                  </p>
                )}

                {resetDays !== null && (
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Resets in {resetDays} day{resetDays !== 1 ? 's' : ''}
                  </p>
                )}
              </>
            )}
          </div>
        </RevealItem>

        {/* Contact lists */}
        <RevealItem lift>
          <div className="flex h-full flex-col rounded-xl border bg-card p-6">
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
                Contact lists
              </span>
              <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
            </div>
            <div className="mt-3 text-2xl font-bold">
              {listCount === null ? (
                <span className="inline-block h-8 w-12 animate-pulse rounded bg-muted align-middle" />
              ) : (
                listCount.toLocaleString()
              )}
            </div>
            <p className="mt-1.5 text-[10.5px] text-muted-foreground">
              {listCount === null
                ? '…'
                : listCount === 0
                ? 'No lists yet'
                : listCount === 1
                ? '1 list imported'
                : `${listCount} lists imported`}
            </p>
          </div>
        </RevealItem>

        {/* Campaigns */}
        <RevealItem lift>
          <div className="flex h-full flex-col rounded-xl border bg-card p-6">
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
                Campaigns
              </span>
              <Send className="h-4 w-4 text-muted-foreground" aria-hidden />
            </div>
            <div className="mt-3 text-2xl font-bold">
              {totalCampaigns === null ? (
                <span className="inline-block h-8 w-12 animate-pulse rounded bg-muted align-middle" />
              ) : (
                totalCampaigns.toLocaleString()
              )}
            </div>
            <p className="mt-1.5 text-[10.5px] text-muted-foreground">
              {totalCampaigns === null
                ? '…'
                : totalCampaigns === 0
                ? 'No campaigns yet'
                : totalCampaigns === 1
                ? '1 campaign created'
                : `${totalCampaigns} campaigns created`}
            </p>
          </div>
        </RevealItem>

        {/* Plan */}
        <RevealItem lift>
          <div className="flex h-full flex-col rounded-xl border bg-card p-6">
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
                Plan
              </span>
              <CreditCard className="h-4 w-4 text-muted-foreground" aria-hidden />
            </div>
            <div className="mt-3 text-2xl font-bold capitalize">{account.plan}</div>
            <div className="mt-1.5">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold capitalize ${statusBadgeClass(account.status)}`}
              >
                {account.status}
              </span>
            </div>
            <div className="mt-auto pt-4">
              <Link
                href="/dashboard/billing"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              >
                Manage billing <ArrowRight className="h-3 w-3" aria-hidden />
              </Link>
            </div>
          </div>
        </RevealItem>

      </RevealGroup>

      {/* ── Quick actions ─────────────────────────────────────────────────── */}
      <Reveal delay={0.3}>
        <div>
          <h3 className="mb-3 text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
            Quick actions
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Link
              href="/dashboard/contacts"
              data-testid="go-contacts"
              className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-accent/40 hover-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <Users className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <div className="text-sm font-semibold">Import contacts</div>
                <div className="text-xs text-muted-foreground">Upload CSV</div>
              </div>
            </Link>

            <Link
              href="/dashboard/campaigns/new"
              data-testid="go-new-campaign"
              className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-accent/40 hover-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
                style={{ background: 'rgba(0,212,170,0.12)', color: '#00D4AA' }}
              >
                <Send className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <div className="text-sm font-semibold">New campaign</div>
                <div className="text-xs text-muted-foreground">Compose &amp; send</div>
              </div>
            </Link>

            <Link
              href="/dashboard/reports"
              className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-accent/40 hover-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <FileBarChart className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <div className="text-sm font-semibold">View reports</div>
                <div className="text-xs text-muted-foreground">Analytics &amp; delivery</div>
              </div>
            </Link>

            <Link
              href="/dashboard/billing"
              className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-accent/40 hover-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <CreditCard className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <div className="text-sm font-semibold">Billing</div>
                <div className="text-xs text-muted-foreground">Plans &amp; payments</div>
              </div>
            </Link>
          </div>
        </div>
      </Reveal>

      {/* ── Recent campaigns ──────────────────────────────────────────────── */}
      <Reveal delay={0.4}>
        <div className="rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <h3 className="font-semibold">Recent campaigns</h3>
            <Link
              href="/dashboard/campaigns"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
              View all <ArrowRight className="h-3 w-3" aria-hidden />
            </Link>
          </div>

          {/* Loading skeletons */}
          {campaignsLoading && (
            <div className="space-y-3 p-5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!campaignsLoading && recentCampaigns.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div
                className="flex h-11 w-11 items-center justify-center rounded-xl"
                style={{ background: 'rgba(0,212,170,0.12)', color: '#00D4AA' }}
              >
                <Send className="h-5 w-5" aria-hidden />
              </div>
              <p className="mt-3 font-medium">No campaigns yet</p>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                Import a contact list and send your first campaign to see results here.
              </p>
              <Link href="/dashboard/campaigns/new" className="btn-primary mt-5">
                Create campaign
              </Link>
            </div>
          )}

          {/* List */}
          {!campaignsLoading && recentCampaigns.length > 0 && (
            <div className="divide-y">
              {recentCampaigns.map((c) => (
                <Link
                  key={c.id}
                  href={`/dashboard/campaigns/${c.id}`}
                  className="flex items-center justify-between gap-4 px-5 py-3.5 text-sm transition-colors hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {fmtWhen(c.created_at)}
                    </div>
                  </div>
                  <span
                    className={`inline-flex flex-shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${statusTone(c.status)}`}
                  >
                    {c.status}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </Reveal>

    </div>
  );
}
