/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
/** Shared UI layer. Prefer importing primitives from here in new code. */
export { Card } from './Card';
export { Modal } from './Modal';
export { DataState, Spinner } from './DataState';
export { StatusBadge, StatusPill, StatusDot } from './StatusBadge';
export { AppShell, AppSidebar, NavMenuButton } from './AppShell';
export type { NavItem, NavSection, NavBadgeType } from './AppShell';

// Form primitives (promoted from components/admin; re-exported to avoid churn).
export { default as FormField } from '@/components/admin/FormField';
export { default as FormGrid, FormActions, FormCard } from '@/components/admin/FormGrid';
