'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Bell, CheckCheck } from 'lucide-react';
import { formatDateTime } from '@/lib/helpers';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Notification } from '@/app/models/notification';

/**
 * Topbar notification bell — unread count polled every 30s (swap for SSE or a
 * realtime gateway when the app outgrows polling).
 */
export function NotificationsBell() {
  const queryClient = useQueryClient();

  const { data: unread } = useQuery({
    queryKey: ['notifications-unread'],
    queryFn: async () => {
      const response = await apiFetch('/api/notifications/unread-count');
      if (!response.ok) throw new Error('Failed to load');
      return (await response.json()) as { count: number };
    },
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const { data: recent } = useQuery({
    queryKey: ['notifications-recent'],
    queryFn: async () => {
      const response = await apiFetch('/api/notifications?limit=6');
      if (!response.ok) throw new Error('Failed to load');
      return (await response.json()) as { data: Notification[] };
    },
    refetchInterval: 30_000,
    retry: 1,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
    queryClient.invalidateQueries({ queryKey: ['notifications-recent'] });
  };

  const markAll = useMutation({
    mutationFn: async () => {
      await apiFetch('/api/notifications/read-all', { method: 'POST' });
    },
    onSuccess: invalidate,
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await apiFetch(`/api/notifications/${id}/read`, { method: 'POST' });
    },
    onSuccess: invalidate,
  });

  const count = unread?.count ?? 0;
  const items = recent?.data ?? [];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" mode="icon" className="relative" aria-label="Notifications">
          <Bell className="size-4.5" />
          {count > 0 && (
            <span className="bg-primary text-primary-foreground absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold">
              {count > 99 ? '99+' : count}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-2.5 pt-2">
          <p className="text-sm font-semibold">Notifications</p>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            disabled={count === 0 || markAll.isPending}
            onClick={() => markAll.mutate()}
          >
            <CheckCheck className="size-3.5" />
            Mark all read
          </Button>
        </div>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <p className="text-muted-foreground px-2.5 py-6 text-center text-sm">
            You&apos;re all caught up.
          </p>
        ) : (
          items.map((notification) => (
            <DropdownMenuItem
              key={notification.id}
              className="flex cursor-pointer flex-col items-start gap-0.5 py-2.5"
              onClick={() => {
                if (!notification.readAt) markRead.mutate(notification.id);
                if (notification.link) window.location.assign(notification.link);
              }}
            >
              <span className="flex w-full items-center gap-2">
                {!notification.readAt && (
                  <span className="bg-primary size-1.5 shrink-0 rounded-full" />
                )}
                <span
                  className={`truncate text-sm ${notification.readAt ? 'text-muted-foreground' : 'font-medium'}`}
                >
                  {notification.title}
                </span>
                <span className="text-muted-foreground ms-auto shrink-0 text-[10px]">
                  {formatDateTime(new Date(notification.createdAt))}
                </span>
              </span>
              {notification.body && (
                <span className="text-muted-foreground line-clamp-1 w-full text-xs">
                  {notification.body}
                </span>
              )}
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="justify-center">
          <Link href="/user-management/notifications" className="text-primary text-sm font-medium">
            View all notifications
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
