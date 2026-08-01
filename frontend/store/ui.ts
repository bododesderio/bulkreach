/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
'use client';

import { create } from 'zustand';

interface MobileNavState {
  /** Whether the mobile navigation drawer is open. */
  open: boolean;
  setOpen: (open: boolean) => void;
}

/**
 * Decouples the hamburger (rendered inside each Topbar) from the drawer
 * (rendered by AppShell in the layout), so the admin shell can offer a mobile
 * drawer without hoisting its per-page Topbars into the layout.
 */
export const useMobileNav = create<MobileNavState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
