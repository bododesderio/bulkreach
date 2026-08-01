/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
/**
 * Single source of truth for every status/state badge in the app.
 *
 * Before this, ~16 pages each redefined their own colour/label map, and they
 * disagreed: `cancelled` was grey in one place and red in another, `trial` was
 * teal here and amber there, `sending`/`sent` swapped colours between admin and
 * managed. This module fixes the canonical mapping once, keyed by domain, with a
 * defined fallback so an unknown/empty status renders a legible "Unknown" pill
 * instead of a blank one.
 */

/** Canonical palette — every badge colour comes from here. */
export const STATUS_COLORS = {
  green: '#10B981', // success / done / active
  teal: '#00D4AA', // live / in-progress / brand
  amber: '#F59E0B', // warning / pending
  red: '#EF4444', // danger / failed / blocked
  grey: '#9CA3AF', // neutral / draft / inactive
  slate: '#6B7280', // terminal-neutral (closed)
  indigo: '#6366F1', // scheduled
  navy: '#1B1F4A',
  blue: '#60A5FA',
} as const;

const C = STATUS_COLORS;

export interface StatusEntry {
  label: string;
  color: string;
  /** Tinted pill background; defaults to a soft tint of `color`. */
  bg?: string;
  pulse?: boolean;
}

export type StatusDomain =
  | 'account'
  | 'subscription'
  | 'payment'
  | 'invoice'
  | 'campaign'
  | 'message'
  | 'managed'
  | 'health'
  | 'channel';

type DomainMap = Record<string, StatusEntry>;

const account: DomainMap = {
  active: { label: 'Active', color: C.green, pulse: true },
  trial: { label: 'Trial', color: C.teal },
  past_due: { label: 'Past due', color: C.amber },
  suspended: { label: 'Suspended', color: C.red },
  cancelled: { label: 'Cancelled', color: C.grey },
  closed: { label: 'Closed', color: C.slate },
};

const subscription: DomainMap = {
  active: { label: 'Active', color: C.green, pulse: true },
  trial: { label: 'Trial', color: C.teal },
  past_due: { label: 'Past due', color: C.amber },
  cancelled: { label: 'Cancelled', color: C.grey },
  expired: { label: 'Expired', color: C.grey },
};

const payment: DomainMap = {
  successful: { label: 'Successful', color: C.green },
  pending: { label: 'Pending', color: C.amber, pulse: true },
  created: { label: 'Processing', color: C.amber, pulse: true },
  failed: { label: 'Failed', color: C.red },
  timeout: { label: 'Timeout', color: C.red },
  refunded: { label: 'Refunded', color: C.grey },
};

const invoice: DomainMap = {
  paid: { label: 'Paid', color: C.green },
  open: { label: 'Open', color: C.amber },
  pending: { label: 'Pending', color: C.amber },
  void: { label: 'Void', color: C.grey },
  cancelled: { label: 'Cancelled', color: C.grey },
  refunded: { label: 'Refunded', color: C.grey },
  overdue: { label: 'Overdue', color: C.red },
  past_due: { label: 'Past due', color: C.red },
};

const campaign: DomainMap = {
  draft: { label: 'Draft', color: C.grey },
  queued: { label: 'Queued', color: C.grey },
  scheduled: { label: 'Scheduled', color: C.indigo },
  sending: { label: 'Sending', color: C.teal, pulse: true },
  completed: { label: 'Completed', color: C.green },
  sent: { label: 'Sent', color: C.green },
  paused: { label: 'Paused', color: C.amber },
  failed: { label: 'Failed', color: C.red },
  bounced: { label: 'Bounced', color: C.red },
  cancelled: { label: 'Cancelled', color: C.red },
};

const message: DomainMap = {
  sent: { label: 'Sent', color: C.green },
  delivered: { label: 'Delivered', color: C.green },
  queued: { label: 'Queued', color: C.teal, pulse: true },
  pending: { label: 'Pending', color: C.grey },
  failed: { label: 'Failed', color: C.red },
  bounced: { label: 'Bounced', color: C.red },
  undelivered: { label: 'Undelivered', color: C.red },
  complained: { label: 'Complained', color: C.red },
  suppressed: { label: 'Suppressed', color: C.grey },
};

/** Managed-service pipeline (15 states). */
const managed: DomainMap = {
  requested: { label: 'Requested', color: '#94A3B8' },
  briefed: { label: 'Briefed', color: C.blue },
  assigned: { label: 'Assigned', color: '#818CF8' },
  audience_pending: { label: 'Audience pending', color: C.amber },
  audience_ready: { label: 'Audience ready', color: '#FB923C' },
  drafting: { label: 'Drafting', color: '#3B82F6' },
  internal_review: { label: 'Internal review', color: '#0EA5E9' },
  awaiting_approval: { label: 'Awaiting approval', color: C.red },
  changes_requested: { label: 'Changes requested', color: '#DC2626' },
  approved: { label: 'Approved', color: C.green },
  scheduled: { label: 'Scheduled', color: C.indigo },
  sending: { label: 'Sending', color: C.teal, pulse: true },
  sent: { label: 'Sent', color: C.green },
  report_issued: { label: 'Report issued', color: C.navy },
  closed: { label: 'Closed', color: C.slate },
};

const health: DomainMap = {
  operational: { label: 'Operational', color: C.green },
  degraded: { label: 'Degraded', color: C.amber },
  down: { label: 'Incident', color: C.red },
};

const channel: DomainMap = {
  sms: { label: 'SMS', color: C.navy, bg: 'rgba(27,31,74,0.08)' },
  email: { label: 'Email', color: '#009980', bg: 'rgba(0,212,170,0.12)' },
  both: { label: 'SMS + Email', color: C.indigo, bg: 'rgba(99,102,241,0.10)' },
};

const DOMAINS: Record<StatusDomain, DomainMap> = {
  account,
  subscription,
  payment,
  invoice,
  campaign,
  message,
  managed,
  health,
  channel,
};

/** Title-case a raw status token for the unknown fallback. */
function humanize(raw: string): string {
  const s = raw.replace(/[_-]+/g, ' ').trim();
  if (!s) return 'Unknown';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Resolve a `(domain, status)` pair to a badge config. Never returns a blank
 * label/colour — an unknown or empty status falls back to a grey "Unknown" pill.
 */
export function resolveStatus(domain: StatusDomain, status: string | null | undefined): StatusEntry {
  const key = (status ?? '').toString().trim().toLowerCase();
  const entry = key ? DOMAINS[domain][key] : undefined;
  return entry ?? { label: humanize(key), color: C.grey };
}
