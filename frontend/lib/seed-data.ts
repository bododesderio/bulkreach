export const seedKPIs = {
  total_clients: 127,
  new_clients_month: 8,
  revenue_month_ugx: 8_400_000,
  revenue_change_pct: 12,
  messages_today: 94_320,
  managed_queue_pending: 3,
};

export const seedRevenuePlans = [
  { name: "Growth", accounts: 61, label: "UGX 9.15M", fill_pct: 90, color: "#00D4AA" },
  { name: "Business", accounts: 12, label: "UGX 4.80M", fill_pct: 47, color: "#1B1F4A" },
  { name: "Starter", accounts: 47, label: "UGX 2.35M", fill_pct: 23, color: "rgba(0,212,170,0.45)" },
  { name: "Managed", accounts: 7, label: "Custom", fill_pct: 30, color: "#F59E0B" },
];

export const seedManagedQueue = [
  {
    id: "mc_001",
    initials: "MU",
    avatar_bg: "rgba(0,212,170,0.12)",
    avatar_color: "#00D4AA",
    name: "Microfinance Uganda Ltd",
    meta: "5,000 SMS · Payment confirmed",
    badge: "Approve",
    badge_type: "ok",
  },
  {
    id: "mc_002",
    initials: "KT",
    avatar_bg: "rgba(245,158,11,0.12)",
    avatar_color: "#F59E0B",
    name: "Kampala City Traders",
    meta: "12,000 email · Copy review",
    badge: "Review copy",
    badge_type: "review",
  },
  {
    id: "mc_003",
    initials: "UB",
    avatar_bg: "rgba(99,102,241,0.12)",
    avatar_color: "#6366F1",
    name: "Uganda Breweries",
    meta: "20,000 SMS+Email · Scheduled",
    badge: "25 Jan 9AM",
    badge_type: "scheduled",
  },
];

export const seedProviderHealth = [
  { name: "Africa's Talking (SMS)", detail: "98.7% delivery · MTN + Airtel", status: "Operational" },
  { name: "Mailgun (Email)", detail: "99.1% delivery · mg.bulkreach.ug", status: "Operational" },
  { name: "Redis queue", detail: "0 stuck jobs · 3 active workers", status: "Healthy" },
  { name: "ClickHouse", detail: "14.2M events · 2yr TTL active", status: "Operational" },
];

export const seedClients = [
  { id: "acc_001", name: "Centenary Bank Uganda", sub: "Joined 3 days ago", plan: "growth", messages: 32_100, status: "active" },
  { id: "acc_002", name: "Pearl Dairy Ltd", sub: "Joined 1 week ago", plan: "business", messages: 88_400, status: "active" },
  { id: "acc_003", name: "Gulu Savings SACCO", sub: "Joined 2 weeks ago", plan: "starter", messages: 4_200, status: "trial" },
  { id: "acc_004", name: "Nile Special Brews", sub: "Managed client", plan: "managed", messages: 20_000, status: "sending" },
  { id: "acc_005", name: "Agri-Input Uganda", sub: "Joined 3 weeks ago", plan: "growth", messages: 15_700, status: "paused" },
];

export const seedSparklines = {
  clients: { points: "0,20 13,18 26,20 39,15 52,14 65,11 78,9 91,6 104,5 120,3", dot: { cx: 120, cy: 3 }, color: "#00D4AA" },
  revenue: { points: "0,19 13,18 26,16 39,18 52,12 65,10 78,14 91,8 104,6 120,3", dot: { cx: 120, cy: 3 }, color: "#00D4AA" },
  messages: { points: "0,18 13,16 26,20 39,10 52,14 65,6 78,12 91,4 104,8 120,2", dot: { cx: 120, cy: 2 }, color: "#00D4AA" },
  queue: { points: "0,16 20,16 20,12 40,12 40,16 60,16 60,10 80,10 80,16 100,16 100,8 120,8", dot: { cx: 120, cy: 8 }, color: "#F59E0B" },
};

export const seedTestimonials = [
  {
    quote:
      "We sent payment reminders to 8,000 borrowers in under 20 minutes. The personalised SMS with each client's balance increased our on-time collection rate noticeably.",
    name: "Grace Nakato",
    role: "Operations Manager, Kampala Microfinance",
  },
  {
    quote:
      "We briefed the BulkReach team on Monday. By Wednesday our 15,000-member email campaign was done and we had a branded PDF to show leadership. Effortless.",
    name: "James Oryema",
    role: "Communications Director, Uganda Traders Alliance",
  },
  {
    quote:
      "The PDF analytics report is exactly what our clients expect. We use the managed service for every product launch now — it's become a core part of how we run campaigns.",
    name: "Prossy Acan",
    role: "Marketing Lead, Jinja Agro Holdings",
  },
];

export const seedPlans = [
  {
    name: "Starter",
    price: "UGX 50k",
    period: "per month",
    featured: false,
    features: ["5,000 messages / month", "CSV & paste import", "SMS & email campaigns", "PDF delivery report", "Email support"],
    cta: "Get started",
  },
  {
    name: "Growth",
    price: "UGX 150k",
    period: "per month",
    featured: true,
    badge: "Most popular",
    features: ["50,000 messages / month", "Up to 20,000 per batch", "All file formats", "Scheduling & retry", "Branded client reports", "Priority support"],
    cta: "Start free trial",
  },
  {
    name: "Business",
    price: "UGX 400k",
    period: "per month",
    featured: false,
    features: ["Unlimited messages", "Multi-user team access", "REST API + webhooks", "White-label branding", "All Growth features"],
    cta: "Get started",
  },
  {
    name: "Managed",
    price: "Custom quote",
    period: "per project",
    featured: false,
    features: ["Up to 20k per campaign", "Full campaign management", "Dedicated account manager", "Branded client report", "Delivery SLA guarantee"],
    cta: "Request a quote",
    managed: true,
  },
];

export const seedFeatures = [
  {
    icon: "Upload",
    title: "Any contact format",
    desc: "Upload from any source. Phone and email columns detected automatically. No reformatting needed.",
    chips: ["CSV", "Excel", "Word", "PDF", "Paste"],
  },
  {
    icon: "Code",
    title: "Personalised at scale",
    desc: 'Every message rendered individually with merge tags. "Dear {{first_name}}, your balance is UGX {{amount}}."',
  },
  {
    icon: "LayoutGrid",
    title: "SMS + email together",
    desc: "Send both channels in one campaign. Dispatched concurrently so your audience gets the message wherever they are.",
  },
  {
    icon: "BarChart2",
    title: "PDF analytics report",
    desc: "Auto-generated after every campaign. Delivery rates, open rates, failure reasons, and time-series charts.",
  },
  {
    icon: "Award",
    title: "Branded client reports",
    desc: "Branded PDF with your logo and delivery confirmation — auto-emailed to your client after every managed campaign.",
  },
  {
    icon: "Clock",
    title: "Schedule & retry",
    desc: "Send now or pick a future time. Failed messages retried 3× with exponential backoff — nothing slips through.",
  },
];

export const seedFAQ = [
  {
    q: "What file formats can I upload contacts from?",
    a: "CSV, Excel (.xlsx/.xls), Word (.docx), PDF, and comma/newline pasted text. Phone and email columns are detected automatically from column headers or by sampling values.",
  },
  {
    q: "What's the difference between self-service and managed?",
    a: "Self-service: you upload contacts, write the message, and send — all in the dashboard. Managed: you brief our team and we handle everything from contact import to dispatch and the branded client report.",
  },
  {
    q: "Do my clients receive a branded report?",
    a: "Yes. Every campaign generates a branded client success report with your logo, custom header, delivery confirmation, and key metrics. Auto-emailed on completion.",
  },
  {
    q: "How does the free trial work?",
    a: "500 messages free on signup, no credit card required. Full Growth plan features active. Trial expires after 14 days or 500 messages, whichever comes first.",
  },
  {
    q: "What payment methods are accepted?",
    a: "MTN Mobile Money, Airtel Money, Visa, and Mastercard. All payments processed via Flutterwave. Subscriptions auto-renew monthly.",
  },
  {
    q: "What happens if some messages fail to deliver?",
    a: "The retry engine retries failed messages up to 3 times with exponential backoff. Failure reasons are logged and appear in your analytics PDF report with the exact error from the provider.",
  },
];

/* =========================================================================
   ADMIN PORTAL — expanded seed datasets (M7 liveliness build)
   100% demo data. No superadmin backend exists yet (that is M5).
   ========================================================================= */

export type Period = 'Today' | 'Month' | 'Quarter';

/** KPI values keyed by period so the Topbar toggle actually re-filters. */
export const seedKPIsByPeriod: Record<Period, {
  total_clients: number;
  new_clients: number;
  revenue_ugx: number;
  revenue_change_pct: number;
  messages: number;
  messages_change_pct: number;
  managed_queue_pending: number;
}> = {
  Today: {
    total_clients: 127, new_clients: 2, revenue_ugx: 310_000, revenue_change_pct: 5,
    messages: 94_320, messages_change_pct: 18, managed_queue_pending: 3,
  },
  Month: {
    total_clients: 127, new_clients: 8, revenue_ugx: 8_400_000, revenue_change_pct: 12,
    messages: 2_641_900, messages_change_pct: 9, managed_queue_pending: 3,
  },
  Quarter: {
    total_clients: 127, new_clients: 23, revenue_ugx: 23_900_000, revenue_change_pct: 21,
    messages: 7_812_400, messages_change_pct: 14, managed_queue_pending: 3,
  },
};

/** Live-feeling activity feed for the ticker. */
export const seedActivity: {
  id: string; kind: 'signup' | 'payment' | 'campaign' | 'system' | 'managed';
  text: string; meta: string; ago: string;
}[] = [
  { id: 'a1', kind: 'payment', text: 'Centenary Bank Uganda paid UGX 150,000', meta: 'Growth · MTN MoMo', ago: 'just now' },
  { id: 'a2', kind: 'campaign', text: 'Pearl Dairy dispatched 88,400 SMS', meta: '98.4% delivered', ago: '2m ago' },
  { id: 'a3', kind: 'signup', text: 'New account: Lira Cotton Co-op', meta: 'Trial · Northern region', ago: '6m ago' },
  { id: 'a4', kind: 'managed', text: 'Managed brief approved — Uganda Breweries', meta: '20,000 SMS+Email', ago: '11m ago' },
  { id: 'a5', kind: 'system', text: 'ClickHouse retention sweep completed', meta: '1.2M rows aged out', ago: '18m ago' },
  { id: 'a6', kind: 'payment', text: 'Kampala City Traders paid UGX 400,000', meta: 'Business · Visa', ago: '24m ago' },
  { id: 'a7', kind: 'campaign', text: 'Agri-Input Uganda scheduled 15,700 email', meta: 'Sends 26 Jul 09:00', ago: '31m ago' },
  { id: 'a8', kind: 'signup', text: 'New account: Jinja Agro Holdings', meta: 'Starter', ago: '44m ago' },
];

export type AccountStatus = 'active' | 'trial' | 'past_due' | 'suspended';
export type PlanKey = 'starter' | 'growth' | 'business' | 'managed';

export const seedAccounts: {
  id: string; name: string; contact: string; email: string; region: string;
  plan: PlanKey; status: AccountStatus; joined: string; messages_month: number; mrr_ugx: number;
}[] = [
  { id: 'acc_001', name: 'Centenary Bank Uganda', contact: 'Grace Nakato', email: 'ops@centenary.co.ug', region: 'Kampala', plan: 'growth', status: 'active', joined: '2026-07-22', messages_month: 32_100, mrr_ugx: 150_000 },
  { id: 'acc_002', name: 'Pearl Dairy Ltd', contact: 'James Oryema', email: 'comms@pearldairy.ug', region: 'Mbarara', plan: 'business', status: 'active', joined: '2026-07-18', messages_month: 88_400, mrr_ugx: 400_000 },
  { id: 'acc_003', name: 'Gulu Savings SACCO', contact: 'Prossy Acan', email: 'admin@gulusacco.ug', region: 'Gulu', plan: 'starter', status: 'trial', joined: '2026-07-11', messages_month: 4_200, mrr_ugx: 0 },
  { id: 'acc_004', name: 'Nile Special Brews', contact: 'Robert Okello', email: 'mkt@nilebrews.ug', region: 'Jinja', plan: 'managed', status: 'active', joined: '2026-06-30', messages_month: 20_000, mrr_ugx: 0 },
  { id: 'acc_005', name: 'Agri-Input Uganda', contact: 'Sarah Auma', email: 'hello@agriinput.ug', region: 'Lira', plan: 'growth', status: 'active', joined: '2026-07-04', messages_month: 15_700, mrr_ugx: 150_000 },
  { id: 'acc_006', name: 'Kampala City Traders', contact: 'Ivan Ssembatya', email: 'info@kctraders.ug', region: 'Kampala', plan: 'business', status: 'active', joined: '2026-05-19', messages_month: 61_300, mrr_ugx: 400_000 },
  { id: 'acc_007', name: 'Microfinance Uganda Ltd', contact: 'Betty Namuli', email: 'ops@mfug.co.ug', region: 'Kampala', plan: 'growth', status: 'past_due', joined: '2026-04-12', messages_month: 9_800, mrr_ugx: 150_000 },
  { id: 'acc_008', name: 'Jinja Agro Holdings', contact: 'Moses Kato', email: 'team@jinjaagro.ug', region: 'Jinja', plan: 'starter', status: 'active', joined: '2026-07-24', messages_month: 1_900, mrr_ugx: 50_000 },
  { id: 'acc_009', name: 'Lira Cotton Co-op', contact: 'Alice Adong', email: 'coop@liracotton.ug', region: 'Lira', plan: 'starter', status: 'trial', joined: '2026-07-25', messages_month: 600, mrr_ugx: 0 },
  { id: 'acc_010', name: 'Mbale Coffee Union', contact: 'Peter Wanyama', email: 'union@mbalecoffee.ug', region: 'Mbale', plan: 'growth', status: 'active', joined: '2026-06-08', messages_month: 22_400, mrr_ugx: 150_000 },
  { id: 'acc_011', name: 'Uganda Breweries', contact: 'Diana Nabirye', email: 'brand@ugbrew.ug', region: 'Kampala', plan: 'managed', status: 'active', joined: '2026-03-27', messages_month: 40_000, mrr_ugx: 0 },
  { id: 'acc_012', name: 'Fort Portal Dairy', contact: 'Henry Bwambale', email: 'sales@fpdairy.ug', region: 'Fort Portal', plan: 'starter', status: 'active', joined: '2026-06-21', messages_month: 3_100, mrr_ugx: 50_000 },
  { id: 'acc_013', name: 'Soroti Grain Millers', contact: 'Esther Amongin', email: 'admin@sorotigrain.ug', region: 'Soroti', plan: 'growth', status: 'active', joined: '2026-05-30', messages_month: 18_600, mrr_ugx: 150_000 },
  { id: 'acc_014', name: 'Arua Traders SACCO', contact: 'John Andama', email: 'sacco@aruatraders.ug', region: 'Arua', plan: 'starter', status: 'suspended', joined: '2026-02-14', messages_month: 0, mrr_ugx: 0 },
  { id: 'acc_015', name: 'Kabale Highland Tea', contact: 'Ruth Kansiime', email: 'info@kabaletea.ug', region: 'Kabale', plan: 'business', status: 'active', joined: '2026-04-03', messages_month: 54_900, mrr_ugx: 400_000 },
  { id: 'acc_016', name: 'Masaka Poultry Ltd', contact: 'Paul Ssebunya', email: 'ops@masakapoultry.ug', region: 'Masaka', plan: 'growth', status: 'trial', joined: '2026-07-16', messages_month: 7_400, mrr_ugx: 0 },
];

export type SubStatus = 'active' | 'trial' | 'past_due' | 'cancelled';
export const seedSubscriptions: {
  id: string; account: string; plan: PlanKey; status: SubStatus; mrr_ugx: number;
  started: string; renews: string; seats: number; method: string;
}[] = [
  { id: 'sub_001', account: 'Centenary Bank Uganda', plan: 'growth', status: 'active', mrr_ugx: 150_000, started: '2026-07-22', renews: '2026-08-22', seats: 4, method: 'MTN MoMo' },
  { id: 'sub_002', account: 'Pearl Dairy Ltd', plan: 'business', status: 'active', mrr_ugx: 400_000, started: '2026-07-18', renews: '2026-08-18', seats: 8, method: 'Visa' },
  { id: 'sub_003', account: 'Gulu Savings SACCO', plan: 'starter', status: 'trial', mrr_ugx: 0, started: '2026-07-11', renews: '2026-07-25', seats: 1, method: '—' },
  { id: 'sub_004', account: 'Agri-Input Uganda', plan: 'growth', status: 'active', mrr_ugx: 150_000, started: '2026-07-04', renews: '2026-08-04', seats: 3, method: 'Airtel Money' },
  { id: 'sub_005', account: 'Kampala City Traders', plan: 'business', status: 'active', mrr_ugx: 400_000, started: '2026-05-19', renews: '2026-08-19', seats: 6, method: 'Visa' },
  { id: 'sub_006', account: 'Microfinance Uganda Ltd', plan: 'growth', status: 'past_due', mrr_ugx: 150_000, started: '2026-04-12', renews: '2026-07-12', seats: 4, method: 'MTN MoMo' },
  { id: 'sub_007', account: 'Jinja Agro Holdings', plan: 'starter', status: 'active', mrr_ugx: 50_000, started: '2026-07-24', renews: '2026-08-24', seats: 1, method: 'Airtel Money' },
  { id: 'sub_008', account: 'Mbale Coffee Union', plan: 'growth', status: 'active', mrr_ugx: 150_000, started: '2026-06-08', renews: '2026-08-08', seats: 3, method: 'Mastercard' },
  { id: 'sub_009', account: 'Fort Portal Dairy', plan: 'starter', status: 'active', mrr_ugx: 50_000, started: '2026-06-21', renews: '2026-08-21', seats: 1, method: 'MTN MoMo' },
  { id: 'sub_010', account: 'Soroti Grain Millers', plan: 'growth', status: 'active', mrr_ugx: 150_000, started: '2026-05-30', renews: '2026-08-30', seats: 2, method: 'MTN MoMo' },
  { id: 'sub_011', account: 'Arua Traders SACCO', plan: 'starter', status: 'cancelled', mrr_ugx: 0, started: '2026-02-14', renews: '—', seats: 1, method: '—' },
  { id: 'sub_012', account: 'Kabale Highland Tea', plan: 'business', status: 'active', mrr_ugx: 400_000, started: '2026-04-03', renews: '2026-08-03', seats: 5, method: 'Visa' },
];

export type PayStatus = 'success' | 'pending' | 'failed' | 'refunded';
export type PayMethod = 'MTN MoMo' | 'Airtel Money' | 'Visa' | 'Mastercard';
export const seedPayments: {
  id: string; ref: string; account: string; amount_ugx: number; method: PayMethod;
  status: PayStatus; plan: PlanKey; date: string;
}[] = [
  { id: 'pay_001', ref: 'FLW-8K2M1', account: 'Centenary Bank Uganda', amount_ugx: 150_000, method: 'MTN MoMo', status: 'success', plan: 'growth', date: '2026-07-25 09:12' },
  { id: 'pay_002', ref: 'FLW-7H9Q4', account: 'Kampala City Traders', amount_ugx: 400_000, method: 'Visa', status: 'success', plan: 'business', date: '2026-07-25 08:47' },
  { id: 'pay_003', ref: 'FLW-3P0X8', account: 'Agri-Input Uganda', amount_ugx: 150_000, method: 'Airtel Money', status: 'success', plan: 'growth', date: '2026-07-24 17:33' },
  { id: 'pay_004', ref: 'FLW-5R2L9', account: 'Microfinance Uganda Ltd', amount_ugx: 150_000, method: 'MTN MoMo', status: 'failed', plan: 'growth', date: '2026-07-24 14:02' },
  { id: 'pay_005', ref: 'FLW-1T7B3', account: 'Pearl Dairy Ltd', amount_ugx: 400_000, method: 'Visa', status: 'success', plan: 'business', date: '2026-07-24 11:19' },
  { id: 'pay_006', ref: 'FLW-9M4C6', account: 'Jinja Agro Holdings', amount_ugx: 50_000, method: 'Airtel Money', status: 'pending', plan: 'starter', date: '2026-07-24 10:05' },
  { id: 'pay_007', ref: 'FLW-2D8N1', account: 'Mbale Coffee Union', amount_ugx: 150_000, method: 'Mastercard', status: 'success', plan: 'growth', date: '2026-07-23 16:41' },
  { id: 'pay_008', ref: 'FLW-6F3V7', account: 'Kabale Highland Tea', amount_ugx: 400_000, method: 'Visa', status: 'success', plan: 'business', date: '2026-07-23 13:58' },
  { id: 'pay_009', ref: 'FLW-4W1Z2', account: 'Fort Portal Dairy', amount_ugx: 50_000, method: 'MTN MoMo', status: 'success', plan: 'starter', date: '2026-07-23 09:24' },
  { id: 'pay_010', ref: 'FLW-8Y5K0', account: 'Soroti Grain Millers', amount_ugx: 150_000, method: 'MTN MoMo', status: 'success', plan: 'growth', date: '2026-07-22 15:12' },
  { id: 'pay_011', ref: 'FLW-0J6H4', account: 'Arua Traders SACCO', amount_ugx: 50_000, method: 'Airtel Money', status: 'refunded', plan: 'starter', date: '2026-07-21 12:33' },
  { id: 'pay_012', ref: 'FLW-3Q9P8', account: 'Masaka Poultry Ltd', amount_ugx: 150_000, method: 'MTN MoMo', status: 'pending', plan: 'growth', date: '2026-07-21 08:50' },
];

/** Payment-method split for the payments donut/legend. */
export const seedPaymentMethods = [
  { method: 'MTN MoMo', share_pct: 52, value_ugx: 4_368_000, color: '#F59E0B' },
  { method: 'Airtel Money', share_pct: 21, value_ugx: 1_764_000, color: '#EF4444' },
  { method: 'Visa', share_pct: 18, value_ugx: 1_512_000, color: '#1B1F4A' },
  { method: 'Mastercard', share_pct: 9, value_ugx: 756_000, color: '#00D4AA' },
];

/** Monthly revenue + MRR time-series (recharts). */
export const seedRevenueSeries: { month: string; revenue: number; target: number; mrr: number }[] = [
  { month: 'Feb', revenue: 4_200_000, target: 4_000_000, mrr: 3_800_000 },
  { month: 'Mar', revenue: 4_900_000, target: 4_500_000, mrr: 4_300_000 },
  { month: 'Apr', revenue: 5_400_000, target: 5_000_000, mrr: 4_900_000 },
  { month: 'May', revenue: 6_100_000, target: 5_800_000, mrr: 5_600_000 },
  { month: 'Jun', revenue: 7_300_000, target: 6_800_000, mrr: 6_500_000 },
  { month: 'Jul', revenue: 8_400_000, target: 7_500_000, mrr: 7_600_000 },
];

/** Revenue KPI headline figures keyed by period (for the revenue page toggle). */
export const seedRevenueTotals: Record<Period, { mrr: number; collected: number; outstanding: number; arpu: number }> = {
  Today: { mrr: 7_600_000, collected: 310_000, outstanding: 150_000, arpu: 66_100 },
  Month: { mrr: 7_600_000, collected: 8_400_000, outstanding: 300_000, arpu: 66_100 },
  Quarter: { mrr: 7_600_000, collected: 23_900_000, outstanding: 450_000, arpu: 66_100 },
};

export type CampaignStatus = 'sending' | 'completed' | 'scheduled' | 'queued' | 'failed';
export type Channel = 'sms' | 'email' | 'both';
export const seedAdminCampaigns: {
  id: string; account: string; name: string; channel: Channel; audience: number;
  sent: number; delivered: number; failed: number; status: CampaignStatus; progress: number; when: string;
}[] = [
  { id: 'cmp_001', account: 'Pearl Dairy Ltd', name: 'July price update', channel: 'sms', audience: 88_400, sent: 88_400, delivered: 86_990, failed: 1_410, status: 'completed', progress: 100, when: '2026-07-25 08:40' },
  { id: 'cmp_002', account: 'Centenary Bank Uganda', name: 'Loan reminder wave 3', channel: 'sms', audience: 32_100, sent: 21_640, delivered: 21_180, failed: 460, status: 'sending', progress: 67, when: '2026-07-25 09:10' },
  { id: 'cmp_003', account: 'Uganda Breweries', name: 'Nile Special launch', channel: 'both', audience: 40_000, sent: 0, delivered: 0, failed: 0, status: 'scheduled', progress: 0, when: '2026-07-26 09:00' },
  { id: 'cmp_004', account: 'Agri-Input Uganda', name: 'Seed season promo', channel: 'email', audience: 15_700, sent: 0, delivered: 0, failed: 0, status: 'queued', progress: 0, when: '2026-07-25 09:14' },
  { id: 'cmp_005', account: 'Kampala City Traders', name: 'Market day blast', channel: 'sms', audience: 61_300, sent: 61_300, delivered: 59_940, failed: 1_360, status: 'completed', progress: 100, when: '2026-07-24 06:30' },
  { id: 'cmp_006', account: 'Mbale Coffee Union', name: 'Harvest payout notice', channel: 'both', audience: 22_400, sent: 22_400, delivered: 21_990, failed: 410, status: 'completed', progress: 100, when: '2026-07-24 12:15' },
  { id: 'cmp_007', account: 'Microfinance Uganda Ltd', name: 'Overdue notice', channel: 'sms', audience: 9_800, sent: 3_100, delivered: 2_040, failed: 1_060, status: 'failed', progress: 32, when: '2026-07-24 14:05' },
  { id: 'cmp_008', account: 'Kabale Highland Tea', name: 'Buyer newsletter', channel: 'email', audience: 54_900, sent: 54_900, delivered: 53_400, failed: 1_500, status: 'completed', progress: 100, when: '2026-07-23 10:00' },
];

export type Severity = 'info' | 'warn' | 'critical';
export const seedAuditLog: {
  id: string; actor: string; role: string; action: string; target: string;
  ip: string; when: string; severity: Severity;
}[] = [
  { id: 'aud_001', actor: 'admin@bulkreach.ug', role: 'superadmin', action: 'Approved managed campaign', target: 'Uganda Breweries · Nile Special launch', ip: '102.86.14.7', when: '2026-07-25 09:11', severity: 'info' },
  { id: 'aud_002', actor: 'admin@bulkreach.ug', role: 'superadmin', action: 'Suspended account', target: 'Arua Traders SACCO', ip: '102.86.14.7', when: '2026-07-25 08:52', severity: 'warn' },
  { id: 'aud_003', actor: 'system', role: 'worker', action: 'Payment webhook verified', target: 'FLW-8K2M1 · UGX 150,000', ip: '—', when: '2026-07-25 09:12', severity: 'info' },
  { id: 'aud_004', actor: 'system', role: 'worker', action: 'Retry exhausted', target: 'Microfinance Uganda Ltd · Overdue notice', ip: '—', when: '2026-07-24 14:20', severity: 'critical' },
  { id: 'aud_005', actor: 'billing@bulkreach.ug', role: 'admin', action: 'Issued refund', target: 'Arua Traders SACCO · FLW-0J6H4', ip: '41.210.9.33', when: '2026-07-24 12:40', severity: 'warn' },
  { id: 'aud_006', actor: 'admin@bulkreach.ug', role: 'superadmin', action: 'Changed archive retention', target: '24 → 24 months (no change)', ip: '102.86.14.7', when: '2026-07-24 11:02', severity: 'info' },
  { id: 'aud_007', actor: 'system', role: 'worker', action: 'Anonymiser sweep', target: '48,220 contacts hashed', ip: '—', when: '2026-07-24 03:00', severity: 'info' },
  { id: 'aud_008', actor: 'admin@bulkreach.ug', role: 'superadmin', action: 'Login', target: 'Admin portal', ip: '102.86.14.7', when: '2026-07-24 08:30', severity: 'info' },
  { id: 'aud_009', actor: 'support@bulkreach.ug', role: 'admin', action: 'Impersonated account (read-only)', target: 'Pearl Dairy Ltd', ip: '41.210.9.33', when: '2026-07-23 15:44', severity: 'warn' },
  { id: 'aud_010', actor: 'system', role: 'worker', action: 'Glacier export archived', target: 'Q1 2026 · 3.4 GB', ip: '—', when: '2026-07-23 02:15', severity: 'info' },
];

export type HealthStatus = 'operational' | 'degraded' | 'down';
export const seedHealthServices: {
  name: string; category: string; status: HealthStatus; uptime_pct: number;
  latency_ms: number; detail: string;
}[] = [
  { name: "Africa's Talking (SMS)", category: 'Provider', status: 'operational', uptime_pct: 99.94, latency_ms: 210, detail: 'MTN + Airtel · 98.7% delivery' },
  { name: 'Mailgun (Email)', category: 'Provider', status: 'operational', uptime_pct: 99.98, latency_ms: 140, detail: 'mg.bulkreach.ug · 99.1% delivery' },
  { name: 'Flutterwave (Payments)', category: 'Provider', status: 'degraded', uptime_pct: 99.42, latency_ms: 680, detail: 'Elevated webhook latency' },
  { name: 'PostgreSQL (live)', category: 'Datastore', status: 'operational', uptime_pct: 99.99, latency_ms: 8, detail: 'Primary · 24 connections' },
  { name: 'ClickHouse (analytics)', category: 'Datastore', status: 'operational', uptime_pct: 99.97, latency_ms: 22, detail: '14.2M events · 2yr TTL' },
  { name: 'Redis / ARQ queue', category: 'Queue', status: 'operational', uptime_pct: 99.96, latency_ms: 3, detail: '0 stuck jobs · 3 workers' },
  { name: 'S3 / MinIO (storage)', category: 'Storage', status: 'operational', uptime_pct: 99.99, latency_ms: 35, detail: 'Contacts + report PDFs' },
];

export const seedHealthIncidents: { id: string; title: string; status: string; when: string; severity: Severity }[] = [
  { id: 'inc_001', title: 'Flutterwave webhook latency elevated', status: 'Monitoring', when: '2026-07-25 07:40', severity: 'warn' },
  { id: 'inc_002', title: "Africa's Talking brief SMS delay (MTN)", status: 'Resolved', when: '2026-07-22 19:05', severity: 'info' },
  { id: 'inc_003', title: 'ClickHouse replica lag during retention sweep', status: 'Resolved', when: '2026-07-19 03:12', severity: 'info' },
];

/** 24h request-throughput sparkline shared by health header. */
export const seedThroughputSeries: { t: string; req: number }[] = [
  { t: '00', req: 1200 }, { t: '03', req: 800 }, { t: '06', req: 2100 }, { t: '09', req: 6400 },
  { t: '12', req: 5200 }, { t: '15', req: 7100 }, { t: '18', req: 4800 }, { t: '21', req: 2600 },
];

/** Managed-service pipeline (richer than seedManagedQueue). */
export type ManagedStage = 'brief' | 'copy_review' | 'payment' | 'scheduled' | 'sending';
export const seedManagedPipeline: {
  id: string; account: string; initials: string; channel: Channel; contacts: number;
  value_ugx: number; stage: ManagedStage; owner: string; deadline: string; note: string;
}[] = [
  { id: 'mc_001', account: 'Microfinance Uganda Ltd', initials: 'MU', channel: 'sms', contacts: 5_000, value_ugx: 450_000, stage: 'payment', owner: 'Grace N.', deadline: '2026-07-26', note: 'Payment confirmed — ready to approve' },
  { id: 'mc_002', account: 'Kampala City Traders', initials: 'KT', channel: 'email', contacts: 12_000, value_ugx: 720_000, stage: 'copy_review', owner: 'James O.', deadline: '2026-07-27', note: 'Awaiting final copy sign-off' },
  { id: 'mc_003', account: 'Uganda Breweries', initials: 'UB', channel: 'both', contacts: 20_000, value_ugx: 1_600_000, stage: 'scheduled', owner: 'Diana N.', deadline: '2026-07-26', note: 'Scheduled 26 Jul 09:00' },
  { id: 'mc_004', account: 'Mbale Coffee Union', initials: 'MC', channel: 'sms', contacts: 8_400, value_ugx: 610_000, stage: 'brief', owner: 'Peter W.', deadline: '2026-07-29', note: 'New brief received — needs scoping' },
  { id: 'mc_005', account: 'Nile Special Brews', initials: 'NS', channel: 'both', contacts: 20_000, value_ugx: 1_500_000, stage: 'sending', owner: 'Robert O.', deadline: '2026-07-25', note: 'Dispatch in progress' },
];

/** Data archive subsystem stats. */
export const seedArchiveStats = {
  total_events: 14_240_000,
  storage_gb: 42.7,
  glacier_gb: 118.3,
  oldest: '2024-07-25',
  retention_months: 24,
  anonymised_contacts: 48_220,
};

export const seedArchiveRetention: { period: string; events: number; size_gb: number; state: 'hot' | 'warm' | 'glacier' | 'purged' }[] = [
  { period: '2026 Q3 (current)', events: 2_641_900, size_gb: 8.1, state: 'hot' },
  { period: '2026 Q2', events: 4_120_400, size_gb: 12.4, state: 'warm' },
  { period: '2026 Q1', events: 3_980_100, size_gb: 11.9, state: 'warm' },
  { period: '2025 Q4', events: 3_497_600, size_gb: 10.3, state: 'glacier' },
  { period: '2024 Q3–2025 Q3', events: 12_800_000, size_gb: 118.3, state: 'glacier' },
  { period: 'Pre 2024-07', events: 0, size_gb: 0, state: 'purged' },
];

export const seedArchiveExports: { id: string; range: string; format: string; size_gb: number; status: 'ready' | 'processing' | 'archived'; when: string }[] = [
  { id: 'exp_001', range: 'Q2 2026 delivery events', format: 'Parquet', size_gb: 12.4, status: 'ready', when: '2026-07-24 22:10' },
  { id: 'exp_002', range: 'Jul 2026 campaign log', format: 'CSV', size_gb: 2.1, status: 'processing', when: '2026-07-25 09:05' },
  { id: 'exp_003', range: 'Q1 2026 full snapshot', format: 'Parquet', size_gb: 11.9, status: 'archived', when: '2026-07-23 02:15' },
];
