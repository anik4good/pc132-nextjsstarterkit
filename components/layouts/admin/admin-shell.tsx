'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { useMutation } from '@tanstack/react-query';
import { LogOut, Menu, X } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { getInitials } from '@/lib/helpers';
import { MENU_SIDEBAR } from '@/config/menu.config';
import { NotificationsBell } from './notifications-bell';
import { Alert, AlertIcon, AlertTitle } from '@/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface AdminShellProps {
  appName: string;
  user: {
    name?: string | null;
    email?: string | null;
    avatar?: string | null;
    roleName?: string | null;
    roleSlug?: string | null;
    companyName?: string | null;
    impersonatedBy?: string | null;
  };
  children: React.ReactNode;
}

export function AdminShell({ appName, user, children }: AdminShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (path?: string) =>
    !!path && (pathname === path || pathname.startsWith(`${path}/`));

  const canSee = (item: (typeof MENU_SIDEBAR)[number]) =>
    !item.roles || (!!user.roleSlug && item.roles.includes(user.roleSlug));

  // Filter by role, then drop headings left with no visible entries under them.
  const visibleItems = MENU_SIDEBAR.filter(canSee).filter((item, index, list) => {
    if (!item.heading) return true;
    const next = list[index + 1];
    return !!next && !next.heading;
  });

  const canManageUsers =
    !!user.roleSlug && ['superadmin', 'admin'].includes(user.roleSlug);

  const { data: session } = useSession();
  const impersonatingName = session?.user?.impersonatedBy
    ? user.name || user.email
    : null;

  const returnToAdmin = useMutation({
    mutationFn: async () => {
      const response = await apiFetch('/api/user-management/impersonate/return', {
        method: 'POST',
      });
      if (!response.ok) {
        const { message } = await response.json();
        throw new Error(message);
      }
      return response.json();
    },
    onSuccess: () => {
      toast.custom(
        () => (
          <Alert variant="mono" icon="success" close={false}>
            <AlertIcon>
              <LogOut className="size-4" />
            </AlertIcon>
            <AlertTitle>Returned to your Super Admin account.</AlertTitle>
          </Alert>
        ),
        { position: 'top-center' },
      );
      window.location.assign('/user-management/companies');
    },
    onError: (error: Error) => {
      toast.error(error.message, { position: 'top-center' });
    },
  });

  const sidebar = (
    <div className="border-e-border bg-background flex h-full w-64 flex-col border-e">
      <div className="border-b-border flex h-16 items-center gap-2.5 border-b px-5">
        <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg text-sm font-bold">
          {appName.charAt(0)}
        </span>
        <span className="font-semibold">{appName}</span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {visibleItems.map((item, index) => {
          if (item.heading) {
            return (
              <p
                key={`heading-${index}`}
                className="text-muted-foreground mt-4 mb-1.5 px-2.5 text-xs font-semibold tracking-wide uppercase first:mt-0"
              >
                {item.heading}
              </p>
            );
          }

          const Icon = item.icon;
          const active = isActive(item.path);

          return (
            <Link
              key={item.title}
              href={item.path || '#'}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
                active
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              {Icon ? <Icon className="size-4.5" /> : null}
              {item.title}
            </Link>
          );
        })}
      </nav>

      <div className="border-b-border hidden items-center gap-3 border-t px-5 py-4 lg:flex">
        <Avatar className="size-9">
          {user.avatar ? <AvatarImage src={user.avatar} alt="" /> : null}
          <AvatarFallback>{getInitials(user.name || user.email || 'U')}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="text-muted-foreground truncate text-xs">
            {user.roleName || 'Member'}
            {user.companyName ? ` · ${user.companyName}` : ''}
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="bg-background text-foreground flex h-full flex-col">
      {impersonatingName && (
        <div className="bg-warning/10 border-b flex items-center justify-center gap-3 px-4 py-1.5 text-sm">
          <span>
            Viewing as <strong>{impersonatingName}</strong> (impersonation is
            logged)
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7"
            disabled={returnToAdmin.isPending}
            onClick={() => returnToAdmin.mutate()}
          >
            <LogOut className="size-3.5" />
            Return to Super Admin
          </Button>
        </div>
      )}

      <div className="flex min-w-0 flex-1">
        {/* Desktop sidebar */}
        <aside className="hidden lg:block">{sidebar}</aside>

        {/* Mobile sidebar */}
        {mobileOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div
              className="bg-black/50 absolute inset-0"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="absolute inset-y-0 start-0 shadow-xl">{sidebar}</aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-b-border bg-background/95 supports-backdrop-filter:bg-background/80 sticky top-0 z-30 flex h-16 items-center gap-3 border-b px-4 backdrop-blur sm:px-6">
          <Button
            variant="ghost"
            mode="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen((open) => !open)}
          >
            {mobileOpen ? <X /> : <Menu />}
          </Button>

          <div className="flex-1" />

          <NotificationsBell />

          {user.roleName ? (
            <Badge variant="secondary" appearance="light" className="hidden sm:flex">
              {user.roleName}
            </Badge>
          ) : null}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="rounded-full outline-none focus-visible:ring-2">
                <Avatar className="size-9">
                  {user.avatar ? (
                    <AvatarImage src={user.avatar} alt="" />
                  ) : null}
                  <AvatarFallback>
                    {getInitials(user.name || user.email || 'U')}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <p className="truncate text-sm font-medium">{user.name}</p>
                <p className="text-muted-foreground truncate text-xs font-normal">
                  {user.email}
                </p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {canManageUsers ? (
                <DropdownMenuItem asChild>
                  <Link href={`/user-management/users`}>User management</Link>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                variant="destructive"
                onClick={() => signOut({ callbackUrl: '/signin' })}
              >
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          </header>

          <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
