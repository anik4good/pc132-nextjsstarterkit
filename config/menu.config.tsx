import {
  Bell,
  Building2,
  CreditCard,
  KeyRound,
  ScrollText,
  Settings,
  ShieldUser,
  Users,
} from 'lucide-react';
import { type MenuConfig } from './types';

/**
 * Starter-kit sidebar menu. Add your own app sections here when you build
 * on top of the kit (e.g. hospital patients, gym members).
 *
 * `roles` gates an entry by role slug (checked against the session);
 * omit it to show the entry to everyone.
 */
export const MENU_SIDEBAR: MenuConfig = [
  { heading: 'Administration', roles: ['superadmin', 'admin'] },
  {
    title: 'Users',
    icon: Users,
    path: '/user-management/users',
    roles: ['superadmin', 'admin'],
  },
  {
    title: 'Companies',
    icon: Building2,
    path: '/user-management/companies',
    roles: ['superadmin'],
  },
  {
    title: 'Roles',
    icon: ShieldUser,
    path: '/user-management/roles',
    roles: ['superadmin'],
  },
  {
    title: 'Permissions',
    icon: KeyRound,
    path: '/user-management/permissions',
    roles: ['superadmin'],
  },
  { heading: 'Workspace', roles: ['superadmin', 'admin'] },
  {
    title: 'Settings',
    icon: Settings,
    path: '/user-management/settings',
    roles: ['superadmin', 'admin'],
  },
  {
    title: 'Billing',
    icon: CreditCard,
    path: '/user-management/billing',
    roles: ['superadmin', 'admin'],
  },
  { heading: 'System' },
  {
    title: 'Notifications',
    icon: Bell,
    path: '/user-management/notifications',
  },
  {
    title: 'My Activity',
    icon: ScrollText,
    path: '/user-management/logs',
  },
];

export const MENU_MEGA: MenuConfig = [];
export const MENU_MEGA_MOBILE: MenuConfig = [];
export const MENU_HELP: MenuConfig = [];
export const MENU_ROOT: MenuConfig = [];
export const MENU_SIDEBAR_CUSTOM: MenuConfig = [];
export const MENU_SIDEBAR_COMPACT: MenuConfig = [];
