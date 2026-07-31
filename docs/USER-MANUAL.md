# BulkReach — User Manual
**Author:** Bodo Desderio, Rooibok Technologies · **Last updated:** 2026-07-31

This manual covers both audiences: **customers** (self-service account users) and the
**superadmin** operator. For what the product is and how it's built, see `docs/PRODUCT.md`.

- Customer app: **https://bulkreach.ug** → dashboard at `/dashboard`
- Superadmin console: **https://admin.bulkreach.ug**
- Managed-client portal: reached from **https://bulkreach.ug** with credentials issued by the operator

---

# Part A — Customer guide (self-service)

## A1. Create your account
1. Go to **bulkreach.ug** and choose **Sign up**.
2. **Step 1 — Details:** business name, your email, password, contact name, phone.
3. **Step 2 — Consent:** read and accept the Terms of Service, Privacy Policy, and Data
   Retention Policy (required — these open in new tabs).
4. **Step 3 — Verify:** enter the 6-digit code emailed to you (in non-production a "Dev code"
   is shown on screen). Codes expire in 15 minutes; you can resend.
5. **Step 4 — Onboarding:** tell us your industry / use-case (optional). You land on the dashboard
   with a **14-day free trial** (500 messages).

## A2. The dashboard
Your home screen shows: usage **stat cards**, a **quota usage bar** (e.g. "0 / 500"), **quick
actions**, and your **recent campaigns**. The left sidebar navigates Overview, Contacts,
Campaigns, Reports, Billing, Settings. The top bar shows your profile, plan, and the notification
bell.

## A3. Import contacts
1. **Contacts → Import.**
2. **Upload** a CSV (drag-and-drop) **or paste** rows directly.
3. BulkReach auto-detects columns (name, phone, email, and any custom merge fields), validates
   them, and removes duplicates — you'll see a summary like "4 valid · 2 duplicates · 0 errors".
4. Save into a named list. Lists are reusable across campaigns.

## A4. Create & send a campaign
1. **Campaigns → New** (the Composer).
2. Choose the **channel**: SMS, Email, or Both.
3. Pick your **audience** (a saved list).
4. Write your message. Personalize with merge tags like `Hi {{name}}` — only letters, numbers,
   and underscores are allowed inside the braces, and every tag must exist in your contact data.
   For SMS, a **segment counter** shows how many SMS parts each message costs.
5. Use the **live preview** to see a sample rendered message.
6. **Send now** or **Schedule** for later (scheduling may require a paid plan).
7. Watch **live progress** ("X of N delivered") — this streams in real time. Campaigns retry
   transient failures automatically.

> If a send is blocked with a payment-required message, you've hit a quota, concurrency, or
> feature limit — see A6 (Billing) to upgrade.

## A5. Campaigns list & reports
- **Campaigns** lists everything with status and channel; open one for per-recipient detail and a
  **Download report (PDF)** — a branded success summary.
- **Reports** shows account-wide analytics: totals and per-channel delivery over a time range,
  with a PDF export.

## A6. Billing
- **Billing** shows your current plan, available plans, invoices, and payment history.
- **Upgrade:** choose a plan and pay via **card (Flutterwave), Pesapal, MTN MoMo, or Airtel
  Money**. Upgrades mid-cycle are **prorated** (you're credited for unused time).
- Invoices/receipts are generated with Uganda **18% VAT** and downloadable as PDF.
- **Auto-renew** can be toggled (owner/admin only). If a renewal payment fails you enter a
  **dunning** grace period (reminders on day 0/3/7/14/30); unresolved, the account is suspended
  at day 30. Re-paying restores it immediately.

## A7. Settings (six tabs)
- **Profile** — edit business name, contact name, phone, industry, **timezone**, logo URL, report
  header, marketing opt-in. (Owner/admin only. Your account email is fixed.)
- **Security** — change your password (verifies your current one; changing it signs you out of
  all *other* devices).
- **Team** — invite teammates by email with a role (owner/admin/member); see and revoke pending
  invites.
- **Sessions** — see every active device/session; revoke one or "log out other devices".
- **Notifications** — per-category email toggles (billing and quota alerts always reach the bell).
- **Danger** — **close your account** (owner only): type the exact account name + your password to
  confirm. This soft-closes the account and signs everyone out.

## A8. Roles
- **Owner** — full control, including billing and account closure.
- **Admin** — manages campaigns, contacts, team, and account settings.
- **Member** — runs campaigns/contacts; cannot change account-wide billing or notification settings.

---

# Part B — Managed-client portal

If BulkReach runs campaigns *for* you (managed service):
1. The operator issues you a portal login (email + a temporary password).
2. On first login you **must set a new password**.
3. In the portal you review campaigns prepared for you and **approve copy** (or request changes)
   via a single-use approval link. Approvals are one-time and audited.

---

# Part C — Superadmin (operator) guide

Console: **https://admin.bulkreach.ug** (gated by an extra Basic-Auth prompt at the edge, then
your superadmin login). Superadmins are created via a server-side bootstrap script, never self-signup.

## C1. Overview
Live platform KPIs (accounts, revenue, activity feed), plus health and the managed queue.

## C2. Accounts
- **Accounts** lists every tenant with plan, status, MRR, and 30-day message volume; search/filter.
- Open an account's **detail page** (`/admin/accounts/{id}`) for its subscription, recent
  campaigns, recent payments, and user count.
- **Actions:**
  - **Suspend / Activate** — block or restore an account (suspension blocks all its users at login).
  - **Log in as (Impersonate)** — act as the account's owner for support/debugging. A short-lived
    (30-min) token is minted; start and stop are audited; while impersonating, the client dashboard
    shows an **amber banner** with an **Exit** button.
  - **Grant portal access** — turn an owner into a managed-portal client (issues a temp password).
  - **Assign / override plan** — manually place the account on a plan with **custom** monthly quota,
    daily limit, price, and feature gates (a "custom deal"). Custom deals are excluded from the
    dunning ladder and survive refunds; a normal paid checkout later resets them to standard.

## C3. Plans & payments configuration
- **Settings → Plans** — create/edit/hide plans (price, quota, batch size, feature gates,
  display order, one "featured"). A plan with active subscribers can't be deleted.
- **Settings → Payments** — configure each provider (Flutterwave/Pesapal/MoMo/Airtel) with live
  credentials (stored Fernet-encrypted) and route each payment method to a provider. Set each
  provider's webhook/IPN URL to `https://api.bulkreach.ug/api/v1/payments/webhooks/{provider}`.

## C4. Operations
- **Campaigns / Subscriptions / Payments** — cross-account views; refund a payment from Payments.
- **Managed pipeline** — a 15-state kanban for operator-run campaigns; move cards, send client
  approval links, and track through to delivery.
- **CMS** — edit marketing content (features, testimonials, FAQs, page copy) shown on the public site.
- **Revenue** — MRR/ARPU and revenue breakdowns.
- **Health** — live status of Postgres/Redis/ClickHouse/MinIO/providers.
- **Audit log** — every privileged action (suspend, plan assign, impersonate start/stop, …).
- **Archive** — data-governance tools: retention, anonymisation, erasure, legal holds, access log,
  export (GDPR-style).

## C5. Go-live checklist (operator)
Follow `infra/DEPLOY-TRAEFIK.md` and `docs/AUDIT-2026-07-31.md` §Phase 5. In short: fresh secrets
(incl. an explicit `ANON_PEPPER`; override the weak compose defaults), DNS A-records at the `.ug`
registrar, create the first superadmin, enter live provider credentials + KYC, verify the Mailgun
sending domain, then run the smoke test (signup → import → send → report; a small real payment →
subscription active; suspend/activate; `/admin/health` green; `admin.` + `/docs` return 401 without
Basic-Auth). Enable backups (with a rehearsed restore), CI, and monitoring before real traffic.

---

## Troubleshooting (quick)
| Symptom | Likely cause / fix |
|---------|--------------------|
| Campaign stuck at "pending", never sends | The ARQ **worker** isn't running — start it (`arq app.workers.WorkerSettings`). |
| "Payment required" when sending | Quota/concurrency/feature limit hit — upgrade or wait for the monthly/daily reset. |
| Merge tag rejected | Tag has invalid characters or isn't a column in your contacts. Use `{{name}}` style, letters/numbers/underscores only. |
| Can't log in after suspension | The account is suspended/closed — contact the operator. |
| PDF report won't render an external logo | Only `https` logos on public hosts are embedded (SSRF protection). Use a public HTTPS image URL. |
| Reset link "expired" | Reset links last 1 hour and (after hardening) are single-use — request a fresh one. |
