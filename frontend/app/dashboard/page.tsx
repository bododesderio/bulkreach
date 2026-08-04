/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
'use client';

import Link from 'next/link';
import {
  ArrowRight,
  CreditCard,
  FileBarChart,
  MessageSquare,
  Send,
  Users,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useApiQuery } from '@/lib/hooks';
import { useAuth } from '@/store/auth';
import { type CampaignOut, type PaginatedCampaigns } from '@/lib/campaigns';
import { Reveal, RevealGroup, RevealItem } from '@/components/admin/Reveal';
import StatCard from '@/components/admin/StatCard';
import CountUp from '@/components/admin/CountUp';
import DataTable, { Column } from '@/components/admin/DataTable';
import { StatusPill } from '@/components/admin/StatusPill';
import { StatusBadge } from '@/components/ui';

const cardBase = 'bg-surface border rounded-[11px] p-4';

// ── Types ─────────────────────────────────────────────────────────────────────
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

// ── Page ──────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user, account } = useAuth();

  const { data, refetch } = useApiQuery(
    ['dashboard', 'home'],
    async () => {
      const quotaP = api<QuotaApi>('/subscription/quota', { auth: true })
        .then(
          (q): { quota: QuotaResponse; quotaError: boolean } => ({
            quota: {
              used: q.monthly_used ?? 0,
              limit: q.monthly_limit ?? null,
              is_trial: !!q.is_trial,
              trial_limit: q.monthly_limit ?? 0,
              monthly_resets_at: q.monthly_resets_at ?? null,
            },
            quotaError: false,
          }),
        )
        .catch(
          (): { quota: QuotaResponse | null; quotaError: boolean } => ({
            quota: null,
            quotaError: true,
          }),
        );
      const listP = api<ContactList[]>('/contacts/lists', { auth: true })
        .then((lists) => ({ count: lists.length, err: false }))
        .catch(() => ({ count: 0, err: true }));
      const campP = api<PaginatedCampaigns>('/campaigns?page=1&page_size=100', {
        auth: true,
      })
        .then((res) => ({ items: res.items, total: res.total, err: false }))
        .catch(() => ({ items: [] as CampaignOut[], total: 0, err: true }));

      const [q, list, campaigns] = await Promise.all([quotaP, listP, campP]);
      return {
        quota: q.quota,
        quotaError: q.quotaError,
        listCount: list.count,
        campaigns,
        // Any sub-fetch failing is a partial outage — surface it softly rather
        // than rendering the failures as legitimate zeros.
        partialError: q.quotaError || list.err || campaigns.err,
      };
    },
    { enabled: !!user },
  );

  const quota          = data?.quota ?? null;
  const quotaError     = data?.quotaError ?? false;
  const partialError   = data?.partialError ?? false;
  const listCount      = data ? data.listCount : null;
  const campaigns      = data ? data.campaigns.items : null;
  const totalCampaigns = data ? data.campaigns.total : null;

  if (!user || !account) return null;

  const name = account.name || user.email.split('@')[0];
  const campaignsLoading = campaigns === null;
  const recentCampaigns  = (campaigns ?? []).slice(0, 5);
  const resetDays        = quota?.monthly_resets_at != null ? daysUntil(quota.monthly_resets_at) : null;
  const quotaPct = quota && quota.limit && quota.limit > 0
    ? Math.min(100, Math.round((quota.used / quota.limit) * 100))
    : 0;

  const campaignColumns: Column<CampaignOut>[] = [
    {
      key: 'name',
      label: 'Campaign',
      render: (c) => (
        <Link
          href={`/dashboard/campaigns/${c.id}`}
          className="font-semibold text-fg hover:text-teal transition-colors"
        >
          {c.name}
        </Link>
      ),
    },
    {
      key: 'type',
      label: 'Type',
      render: (c) => <span className="capitalize text-fg-muted">{c.type}</span>,
    },
    {
      key: 'created_at',
      label: 'Created',
      render: (c) => <span className="text-fg-muted whitespace-nowrap">{fmtWhen(c.created_at)}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      align: 'right',
      render: (c) => <StatusBadge domain="campaign" status={c.status} />,
    },
  ];

  return (
    <div className="space-y-[18px]">

      {/* ── Greeting ─────────────────────────────────────────────────────── */}
      <Reveal>
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="font-display text-[20px] font-extrabold text-fg" data-testid="welcome">
            Welcome back, {name}
          </h2>
          <StatusPill
            label={account.plan}
            color="#00D4AA"
            bg="rgba(0,212,170,0.12)"
            dot={false}
          />
          <StatusBadge domain="account" status={account.status} />
        </div>
      </Reveal>

      {/* Partial-outage note — some tiles couldn't load; don't show failures as zeros. */}
      {partialError && (
        <Reveal>
          <div
            className="flex flex-wrap items-center justify-between gap-2 rounded-[11px] border p-3 text-[12px]"
            style={{ borderColor: 'rgba(245,158,11,0.35)', background: 'rgba(245,158,11,0.08)', color: '#92400E' }}
            role="alert"
          >
            <span>Some of your dashboard data couldn&apos;t be loaded.</span>
            <button
              type="button"
              onClick={() => refetch()}
              className="font-semibold underline hover:no-underline"
            >
              Try again
            </button>
          </div>
        </Reveal>
      )}

      {/* ── Stat cards (4-up) ────────────────────────────────────────────── */}
      <RevealGroup className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" stagger={0.07}>

        {/* Messages this month (with quota bar) */}
        <RevealItem lift>
          <div className={`${cardBase} h-full`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-fg-muted">
                Messages this month
              </span>
              <MessageSquare size={15} className="text-fg-muted" aria-hidden />
            </div>

            {quota === null && !quotaError && (
              <>
                <div className="mt-2 h-7 animate-pulse rounded bg-surface-2" />
                <div className="mt-3 h-1.5 animate-pulse rounded-full bg-surface-2" />
              </>
            )}
            {quotaError && <div className="mt-1 font-mono text-[26px] font-semibold text-fg-muted">—</div>}

            {quota !== null && !quotaError && (
              <>
                <div className="mt-1 font-mono text-[26px] font-semibold leading-tight text-fg">
                  {quota.limit === null ? 'Unlimited' : <CountUp value={quota.used} />}
                </div>

                {quota.limit !== null && (
                  <div className="mt-2">
                    <div
                      className="h-1.5 w-full overflow-hidden rounded-full"
                      style={{ background: 'var(--bg)' }}
                      role="progressbar"
                      aria-valuenow={quotaPct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${quotaPct}% of monthly quota used`}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${quotaPct}%`, background: usageBarColor(quotaPct) }}
                      />
                    </div>
                    <div className="mt-1 flex justify-between text-[10px] text-fg-muted">
                      <span style={{ color: usageBarColor(quotaPct) }}>{quotaPct}% used</span>
                      <span>{quota.used.toLocaleString()} / {quota.limit.toLocaleString()}</span>
                    </div>
                  </div>
                )}

                {quota.limit === null && (
                  <p className="mt-1.5 text-[10.5px] text-fg-muted">No usage cap on your plan</p>
                )}
                {quota.is_trial && (
                  <p className="mt-1.5 text-[10.5px] font-semibold text-amber">
                    Trial · {quota.trial_limit.toLocaleString()} msg allowance
                  </p>
                )}
                {resetDays !== null && (
                  <p className="mt-1 text-[10px] text-fg-muted">
                    Resets in {resetDays} day{resetDays !== 1 ? 's' : ''}
                  </p>
                )}
              </>
            )}
          </div>
        </RevealItem>

        {/* Contact lists */}
        <RevealItem lift>
          <StatCard
            label="Contact lists"
            value={listCount ?? 0}
            icon={Users}
            change={
              listCount === null ? '…'
              : listCount === 0 ? 'No lists yet'
              : listCount === 1 ? '1 list imported'
              : `${listCount} lists imported`
            }
            changeType="up"
            href="/dashboard/contacts"
          />
        </RevealItem>

        {/* Campaigns */}
        <RevealItem lift>
          <StatCard
            label="Campaigns"
            value={totalCampaigns ?? 0}
            icon={Send}
            change={
              totalCampaigns === null ? '…'
              : totalCampaigns === 0 ? 'No campaigns yet'
              : totalCampaigns === 1 ? '1 campaign created'
              : `${totalCampaigns} campaigns created`
            }
            changeType="up"
            href="/dashboard/campaigns"
          />
        </RevealItem>

        {/* Plan */}
        <RevealItem lift>
          <div className={`${cardBase} h-full flex flex-col`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-fg-muted">
                Plan
              </span>
              <CreditCard size={15} className="text-fg-muted" aria-hidden />
            </div>
            <div className="mt-1 font-mono text-[26px] font-semibold capitalize leading-tight text-fg">
              {account.plan}
            </div>
            <div className="mt-1.5">
              <StatusBadge domain="account" status={account.status} />
            </div>
            <div className="mt-auto pt-3">
              <Link
                href="/dashboard/billing"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal hover:underline"
              >
                Manage billing <ArrowRight size={12} aria-hidden />
              </Link>
            </div>
          </div>
        </RevealItem>

      </RevealGroup>

      {/* ── Quick actions ─────────────────────────────────────────────────── */}
      <Reveal delay={0.3}>
        <div>
          <h3 className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.06em] text-fg-muted">
            Quick actions
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { href: '/dashboard/contacts', testid: 'go-contacts', icon: Users, title: 'Import contacts', sub: 'Upload CSV', teal: false },
              { href: '/dashboard/campaigns/new', testid: 'go-new-campaign', icon: Send, title: 'New campaign', sub: 'Compose & send', teal: true },
              { href: '/dashboard/reports', testid: undefined, icon: FileBarChart, title: 'View reports', sub: 'Analytics & delivery', teal: false },
              { href: '/dashboard/billing', testid: undefined, icon: CreditCard, title: 'Billing', sub: 'Plans & payments', teal: false },
            ].map(({ href, testid, icon: Icon, title, sub, teal }) => (
              <Link
                key={href}
                href={href}
                data-testid={testid}
                className={`${cardBase} flex items-center gap-3 transition-colors hover-lift hover:border-teal`}
              >
                <span
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
                  style={
                    teal
                      ? { background: 'rgba(0,212,170,0.12)', color: '#00D4AA' }
                      : { background: 'var(--bg)', color: 'var(--navy)' }
                  }
                >
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <div className="text-[13px] font-semibold text-fg">{title}</div>
                  <div className="text-[11px] text-fg-muted">{sub}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </Reveal>

      {/* ── Recent campaigns ──────────────────────────────────────────────── */}
      <Reveal delay={0.4}>
        <div className={cardBase}>
          <div className="flex items-center justify-between mb-3">
            <div className="font-display text-[14px] font-bold text-fg">Recent campaigns</div>
            <Link
              href="/dashboard/campaigns"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal hover:underline"
            >
              View all <ArrowRight size={12} aria-hidden />
            </Link>
          </div>

          {campaignsLoading && (
            <div className="space-y-3 py-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-surface-2" />
              ))}
            </div>
          )}

          {!campaignsLoading && recentCampaigns.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div
                className="flex h-11 w-11 items-center justify-center rounded-xl"
                style={{ background: 'rgba(0,212,170,0.12)', color: '#00D4AA' }}
              >
                <Send className="h-5 w-5" aria-hidden />
              </div>
              <p className="mt-3 font-semibold text-fg">No campaigns yet</p>
              <p className="mt-1 max-w-xs text-[12px] text-fg-muted">
                Import a contact list and send your first campaign to see results here.
              </p>
              <Link href="/dashboard/campaigns/new" className="btn-primary mt-5">
                Create campaign
              </Link>
            </div>
          )}

          {!campaignsLoading && recentCampaigns.length > 0 && (
            <DataTable<CampaignOut>
              columns={campaignColumns}
              rows={recentCampaigns}
              rowKey={(c) => c.id}
            />
          )}
        </div>
      </Reveal>

    </div>
  );
}
