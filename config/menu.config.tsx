import { KeyRound, ShieldUser, Users, ScrollText } from 'lucide-react';
import { type MenuConfig } from './types';

/**
 * Starter-kit sidebar menu. Add your own app sections here when you build
 * on top of the kit (e.g. hospital patients, gym members).
 */
export const MENU_SIDEBAR: MenuConfig = [
  { heading: 'Administration' },
  {
    title: 'Users',
    icon: Users,
    path: '/user-management/users',
  },
  {
    title: 'Roles',
    icon: ShieldUser,
    path: '/user-management/roles',
  },
  {
    title: 'Permissions',
    icon: KeyRound,
    path: '/user-management/permissions',
  },
  { heading: 'System' },
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
