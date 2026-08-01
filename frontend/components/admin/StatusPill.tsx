/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
/**
 * Moved to `components/ui/StatusBadge`. This re-export keeps existing
 * `components/admin/StatusPill` imports working; prefer importing from
 * `@/components/ui` (and `StatusBadge` for domain-aware badges) in new code.
 */
export { StatusDot, StatusPill, StatusBadge } from '@/components/ui/StatusBadge';
