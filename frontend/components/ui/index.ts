/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
/** Shared UI layer. Prefer importing primitives from here in new code. */
export { Card } from './Card';
export { Button } from './Button';
export { Modal } from './Modal';
export { DataState, Spinner } from './DataState';
export { RowMenu } from './RowMenu';
export type { RowMenuItem } from './RowMenu';
export { StatusBadge, StatusPill, StatusDot } from './StatusBadge';
export { Badge } from './Badge';
export { StatTile } from './StatTile';
export { PageHeader, Breadcrumbs } from './PageHeader';
export type { Crumb } from './PageHeader';
export { EmptyState } from './EmptyState';
export { DataTable } from './DataTable';
export type { Column } from './DataTable';
export { ThemeToggle } from './ThemeToggle';
export { AppShell, AppSidebar, NavMenuButton } from './AppShell';
export type { NavItem, NavSection, NavBadgeType } from './AppShell';

// Token-backed form controls (dark-ready). Pair Field with Input/Select/Textarea.
export { Field, Input, Textarea, Select } from './Field';

// Legacy form primitives (promoted from components/admin; re-exported to avoid churn).
export { default as FormField } from '@/components/admin/FormField';
export { default as FormGrid, FormActions, FormCard } from '@/components/admin/FormGrid';
