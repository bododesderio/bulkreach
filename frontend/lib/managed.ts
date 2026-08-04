/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 *
 * Shared model for the managed (full-service, done-for-you) campaign workspace.
 *
 * The backend keeps a 15-state pipeline, but operationally the admin runs the
 * whole job solo — no client sign-off, no assigning it to a team member. So the
 * admin UI collapses those 15 states into a simple linear path the admin drives:
 *
 *     Brief → Content → Send → Report → Closed
 *
 * Each STEP maps a set of backend states, and `advanceTo` returns the next state
 * to PATCH (all forward jumps, which the backend permits) — so the old
 * assignment/approval states are simply skipped, never surfaced.
 */

// ── Backend states (unchanged — kept for compatibility with the API) ──────────
export type Status =
  | 'requested'
  | 'briefed'
  | 'assigned'
  | 'audience_pending'
  | 'audience_ready'
  | 'drafting'
  | 'internal_review'
  | 'awaiting_approval'
  | 'approved'
  | 'scheduled'
  | 'sending'
  | 'sent'
  | 'report_issued'
  | 'closed'
  | 'changes_requested';

// ── Simplified admin steps ────────────────────────────────────────────────────
export type StepKey = 'brief' | 'content' | 'send' | 'report' | 'closed';

export interface Step {
  key: StepKey;
  label: string;
  hint: string;
  color: string;
  /** Backend states that map to this step. */
  states: Status[];
  /** State to PATCH when advancing INTO this step. */
  entry: Status;
}

/** The linear admin path. Order matters — index drives the stepper + advancing. */
export const STEPS: Step[] = [
  {
    key: 'brief',
    label: 'Brief',
    hint: 'Campaign brief captured',
    color: '#6366F1',
    states: ['requested', 'briefed'],
    entry: 'briefed',
  },
  {
    key: 'content',
    label: 'Content',
    hint: 'Write copy & link the campaign',
    color: '#3B82F6',
    // Every "in preparation" backend state collapses here — including the old
    // assignment/approval states, which the admin flow no longer surfaces.
    states: [
      'assigned',
      'audience_pending',
      'audience_ready',
      'drafting',
      'internal_review',
      'awaiting_approval',
      'changes_requested',
      'approved',
    ],
    entry: 'drafting',
  },
  {
    key: 'send',
    label: 'Send',
    hint: 'Schedule & dispatch',
    color: '#10B981',
    states: ['scheduled', 'sending', 'sent'],
    entry: 'scheduled',
  },
  {
    key: 'report',
    label: 'Report',
    hint: 'Issue the client report',
    color: '#1B1F4A',
    states: ['report_issued'],
    entry: 'report_issued',
  },
  {
    key: 'closed',
    label: 'Closed',
    hint: 'Job archived',
    color: '#6B7280',
    states: ['closed'],
    entry: 'closed',
  },
];

const STEP_BY_STATE: Record<string, Step> = {};
for (const s of STEPS) for (const st of s.states) STEP_BY_STATE[st] = s;

/** The admin step a job is currently in. */
export function stepOf(status: Status): Step {
  return STEP_BY_STATE[status] ?? STEPS[0];
}

export function stepIndexOf(status: Status): number {
  return STEPS.findIndex((s) => s.key === stepOf(status).key);
}

/** The next step after the current one (or null at the end). */
export function nextStep(status: Status): Step | null {
  const i = stepIndexOf(status);
  return i >= 0 && i < STEPS.length - 1 ? STEPS[i + 1] : null;
}

/** The backend state to PATCH to advance one step (null if already Closed). */
export function advanceTo(status: Status): Status | null {
  return nextStep(status)?.entry ?? null;
}

/** The single clear next action for a job, given its state — drives the one
 *  primary button (no "move to any state" dropdown). `report` fires POST /report;
 *  `status` PATCHes the target state; null means the job is Closed (done). */
export type PrimaryAction =
  | { kind: 'status'; target: Status; label: string }
  | { kind: 'send'; label: string }
  | { kind: 'report'; label: string }
  | null;

const _CONTENT_STATES: Status[] = [
  'assigned', 'audience_pending', 'audience_ready', 'drafting',
  'internal_review', 'awaiting_approval', 'changes_requested', 'approved',
];

/** True when the job is at a stage where its linked campaign can still be
 *  dispatched (i.e. before it has actually gone out). Drives the "Send now"
 *  button — the real dispatch, not a status flip. */
export function canSendNow(status: Status): boolean {
  return _CONTENT_STATES.includes(status) || status === 'scheduled';
}

export function primaryActionFor(status: Status): PrimaryAction {
  if (status === 'requested' || status === 'briefed')
    return { kind: 'status', target: 'drafting', label: 'Start content' };
  // Real dispatch: materialises + queues the linked campaign's messages.
  if (canSendNow(status))
    return { kind: 'send', label: 'Send now' };
  // Dispatch is in flight — let the admin mark it done once complete.
  if (status === 'sending')
    return { kind: 'status', target: 'sent', label: 'Mark as sent' };
  if (status === 'sent') return { kind: 'report', label: 'Issue report' };
  if (status === 'report_issued')
    return { kind: 'status', target: 'closed', label: 'Close job' };
  return null; // closed
}

// ── Per-state badge config (still needed for exact status display) ────────────
export const STATUS_CFG: Record<Status, { label: string; color: string }> = {
  requested: { label: 'Requested', color: '#94A3B8' },
  briefed: { label: 'Briefed', color: '#60A5FA' },
  assigned: { label: 'Assigned', color: '#818CF8' },
  audience_pending: { label: 'Audience pending', color: '#F59E0B' },
  audience_ready: { label: 'Audience ready', color: '#FB923C' },
  drafting: { label: 'Drafting', color: '#3B82F6' },
  internal_review: { label: 'Internal review', color: '#0EA5E9' },
  awaiting_approval: { label: 'Awaiting approval', color: '#EF4444' },
  changes_requested: { label: 'Changes requested', color: '#DC2626' },
  approved: { label: 'Approved', color: '#10B981' },
  scheduled: { label: 'Scheduled', color: '#6366F1' },
  sending: { label: 'Sending', color: '#10B981' },
  sent: { label: 'Sent', color: '#00D4AA' },
  report_issued: { label: 'Report issued', color: '#1B1F4A' },
  closed: { label: 'Closed', color: '#6B7280' },
};

export const CHANNEL_CFG: Record<string, { label: string; color: string; bg: string }> = {
  sms: { label: 'SMS', color: '#1B1F4A', bg: 'rgba(27,31,74,0.08)' },
  email: { label: 'Email', color: '#009980', bg: 'rgba(0,212,170,0.12)' },
  both: { label: 'SMS + Email', color: '#6366F1', bg: 'rgba(99,102,241,0.10)' },
};

// ── Domain types (mirror ManagedOut) ──────────────────────────────────────────
export interface Managed {
  id: string;
  account_id: string;
  account_name: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  channel: 'sms' | 'email' | 'both' | null;
  audience: number | null;
  brief_text: string;
  status: Status;
  created_at: string;
  updated_at: string;
  report_ready: boolean;
  report_url: string | null;
  copy_sms: string | null;
  copy_email_subject: string | null;
  copy_email_body: string | null;
  on_hold: boolean;
  cancelled: boolean;
}

export interface ManagedResponse {
  items: Managed[];
  stats: { total: number; pending: number; in_flight: number; complete: number };
}

export interface AccountLite {
  id: string;
  name: string;
}

export interface CampaignLite {
  id: string;
  account_id: string;
  name: string;
  status: string;
}

// ── Stat-card filter groups (list page) ───────────────────────────────────────
export type StatFilter = 'all' | 'in_prod' | 'send' | 'complete';

const IN_PROD_STATES = new Set<Status>([
  'requested', 'briefed', 'assigned',
  'audience_pending', 'audience_ready', 'drafting', 'internal_review',
  'awaiting_approval', 'changes_requested', 'approved',
]);
const SEND_STATES = new Set<Status>(['scheduled', 'sending', 'sent']);
const COMPLETE_STATES = new Set<Status>(['report_issued', 'closed']);

/** One predicate set so the count tiles and the table filter never drift.
 *  Cancelled jobs are excluded from every active group. */
export const GROUP_PREDICATE: Record<Exclude<StatFilter, 'all'>, (m: Managed) => boolean> = {
  in_prod: (m) => IN_PROD_STATES.has(m.status) && !m.cancelled,
  send: (m) => SEND_STATES.has(m.status) && !m.cancelled && m.status !== 'sent',
  complete: (m) => (m.status === 'sent' || COMPLETE_STATES.has(m.status)) && !m.cancelled,
};

// ── Formatters ────────────────────────────────────────────────────────────────
export function initials(name: string | null): string {
  if (!name) return '—';
  return name.split(/\s+/).slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase();
}

export const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export const fmtShortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—';

/** Relative age, e.g. "3d", "5h", "just now" — for the queue's Age column. */
export function ageOf(iso: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}
