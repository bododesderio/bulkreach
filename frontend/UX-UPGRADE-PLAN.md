# BulkReach UX Upgrade Plan — Rooibok Design System

> Re-skin + IA cleanup (NOT a rewrite). Preserve every route, API call, and feature.
> Stack: Next.js 15 App Router + Tailwind + react-hook-form + lucide-react.
> Extract the design **system** from Rooibok HR — do **not** copy its Bootstrap CSS.

## Reference files (other project, same disk — read at start)
- `/Data/Projects/Hr/public/assets/css/rooibok-theme.css` — tokens, KPI tiles, component polish, dark mode (source of truth).
- `/Data/Projects/Hr/docs/UX-UPGRADE-PLAN.md` — phased approach + UX principles.
- `/Data/Projects/Hr/app/Views/default/header.php` + `company_left_menu.php` — topbar + grouped sidebar, dark-mode toggle, section captions.
- `/Data/Projects/Hr/app/Views/erp/dashboard/company_dashboard.php` — KPI-row dashboard organization.

## Design tokens to extract
- **Colors**: brand `#6d5ffb` (keep as a **themeable var** so BulkReach can differ), success `#17c666`, warning `#f5a623`, danger `#ef4d56`, info `#3ec9d6`, neutrals.
- **Spacing**: 4px scale. **Radius**: 10px. **Shadows**: soft. **Type**: tight letter-spacing.
- **Patterns**: KPI tile (colored left accent, uppercase muted label, big value, icon top-right), pill badges, sticky uppercase table headers, visible focus ring, dark mode.

## Phases (commit each; tsc + lint after every area; Playwright verify per area)
1. **Tokens foundation** (non-destructive) — `tailwind.config.ts` extend (colors/spacing/radius/boxShadow/fontFamily) + CSS vars in `globals.css`; `darkMode:'class'` honoring `prefers-color-scheme` on first load (no flash). → task #35
2. **Shared shells** — AppSidebar (grouped nav + captions, mobile-collapse), Topbar (logo, ⌘K search, notifications, theme toggle, user menu), PageHeader/breadcrumbs, Card, StatTile/KPI, DataTable (sticky uppercase headers, hover rows, empty+loading, search/filter/pagination), Form controls (RHF + inline validation + focus ring), Badge, Toast, Modal, EmptyState. lucide-react throughout. Reduced-motion + WCAG-AA. → #36
3. **Dark mode parity** — topbar moon/sun, localStorage-persisted, OS-aware, applied across sidebar/topbar/cards/tables/inputs/dropdowns/modals. → #37
4. **Dashboards** — client `/dashboard` + `/admin` lead with a KPI-tile row of real metrics (messages sent, queued, delivered, failed/retry, credits) then cards/charts (consistent palette). Kill dead whitespace with responsive grids (KPI `grid-cols-1 md:2 xl:4`; panels 1/2/3). Compare density vs HR dashboard. Capture before/after screenshots (dashboard + one admin page) for review. → #38
5. **Per-page re-skin** — page-by-page across `app/admin/*` + `app/dashboard/*`: shell, tables, forms, empty/loading, 4px rhythm, grouped sidebar, breadcrumbs, sub-nav tabs on section landings. No half-empty pages. → #39

## Density mandate (fix the empty space)
No half-empty pages; content fills width at every breakpoint. Every section landing = KPI/stat row → purposeful panel grid (not one lonely table). Comfortable-compact rows, sticky headers, tables stretch to container. Real empty/loading states. Sidebar collapses on small screens.

## Constraints
- Non-destructive + incremental. `npx tsc --noEmit` + linter after each area.
- Playwright after each major area: no console errors, responsive, dark+light both correct, keyboard-nav, nothing broken.
- Brand mapped to a themeable var (BulkReach brand ≠ Rooibok).
