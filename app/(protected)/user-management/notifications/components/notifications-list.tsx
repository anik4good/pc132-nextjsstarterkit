'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCheck, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { formatDateTime } from '@/lib/helpers';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardFooter,
  CardHeader,
  CardTable,
  CardToolbar,
} from '@/components/ui/card';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Notification } from '@/app/models/notification';

const PAGE_SIZE = 15;

export default function NotificationsList() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', page],
    queryFn: async () => {
      const response = await apiFetch(
        `/api/notifications?page=${page}&limit=${PAGE_SIZE}`,
      );
      if (!response.ok) throw new Error('Failed to load notifications.');
      return (await response.json()) as {
        data: Notification[];
        pagination: { total: number; page: number };
      };
    },
    refetchInterval: 60_000,
    retry: 1,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
    queryClient.invalidateQueries({ queryKey: ['notifications-recent'] });
  };

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await apiFetch(`/api/notifications/${id}/read`, { method: 'POST' });
    },
    onSuccess: invalidate,
  });

  const markAll = useMutation({
    mutationFn: async () => {
      await apiFetch('/api/notifications/read-all', { method: 'POST' });
    },
    onSuccess: invalidate,
  });

  const notifications = data?.data ?? [];
  const total = data?.pagination.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const unreadInView = notifications.filter((n) => !n.readAt).length;

  return (
    <Card>
      <CardHeader>
        <CardToolbar>
          <div className="flex items-center justify-between w-full">
            <p className="text-sm text-muted-foreground">
              {total} notification{total === 1 ? '' : 's'}
              {unreadInView > 0 ? ` · ${unreadInView} unread on this page` : ''}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAll.mutate()}
              disabled={markAll.isPending}
            >
              <CheckCheck className="size-4" />
              Mark all read
            </Button>
          </div>
        </CardToolbar>
      </CardHeader>
      <CardTable>
        <ScrollArea>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-full">Notification</TableHead>
                <TableHead className="w-24">Status</TableHead>
                <TableHead className="w-44">When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={3}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : notifications.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="text-muted-foreground h-32 text-center"
                  >
                    You&apos;re all caught up.
                  </TableCell>
                </TableRow>
              ) : (
                notifications.map((notification) => (
                  <TableRow key={notification.id}>
                    <TableCell>
                      <div className="space-y-0.5">
                        <p
                          className={`text-sm ${notification.readAt ? 'text-muted-foreground' : 'font-medium'}`}
                        >
                          {notification.title}
                        </p>
                        {notification.body && (
                          <p className="text-muted-foreground text-xs">
                            {notification.body}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {notification.readAt ? (
                        <Badge variant="secondary" appearance="light">
                          Read
                        </Badge>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => markRead.mutate(notification.id)}
                          disabled={markRead.isPending}
                        >
                          Mark read
                        </Button>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {formatDateTime(new Date(notification.createdAt))}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </CardTable>
      <CardFooter className="justify-between">
        <p className="text-muted-foreground text-sm">
          Page {page} of {totalPages}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeftIcon className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            <ChevronRightIcon className="size-4" />
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
