/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
/**
 * Public marketing fallback seed. The public site (`lib/public-content.ts` and
 * the `(public)` pages) renders these when the CMS API is empty or unreachable,
 * so the landing/pricing/FAQ pages never come up blank.
 *
 * NOTE: this file used to also carry ~20 admin "liveliness" mock datasets from
 * the M7 demo build. Those were removed once the admin portal moved to live
 * APIs — the admin surface must never render fabricated data.
 */

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
