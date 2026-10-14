'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { formatDateTime } from '@/lib/helpers';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTable } from '@/components/ui/card';
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
import type { SystemLog } from '@/app/models/system';

type LogRow = Pick<
  SystemLog,
  'id' | 'event' | 'description' | 'ipAddress' | 'createdAt'
> & { createdAt: string };

const PAGE_SIZE = 15;

const eventVariant = (event: string | null) => {
  if (!event) return 'secondary' as const;
  if (event.includes('DELETE') || event.includes('TRASHED')) {
    return 'destructive' as const;
  }
  if (
    event.includes('SIGNIN') ||
    event.includes('SIGNUP') ||
    event.includes('RESTORED')
  ) {
    return 'success' as const;
  }
  return 'secondary' as const;
};

export default function UserLogsPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['user-logs', id, page],
    queryFn: async (): Promise<{
      data: LogRow[];
      empty: boolean;
      pagination: { total: number; page: number };
    }> => {
      const response = await apiFetch(
        `/api/user-management/users/${id}/logs?page=${page}&limit=${PAGE_SIZE}`,
      );
      if (!response.ok) {
        const { message } = await response.json();
        throw new Error(message);
      }
      return response.json();
    },
    enabled: !!id,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });

  const total = data?.pagination.total || 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Card>
      <CardHeader className="py-5">
        <div className="flex items-center justify-between gap-2.5">
          <h3 className="text-md font-semibold text-mono">Activity Logs</h3>
          <span className="text-sm text-muted-foreground">
            {total} record{total === 1 ? '' : 's'}
          </span>
        </div>
      </CardHeader>
      <CardTable>
        <ScrollArea>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[180px]">Event</TableHead>
                <TableHead className="min-w-[280px]">Description</TableHead>
                <TableHead className="min-w-[140px]">IP Address</TableHead>
                <TableHead className="min-w-[170px]">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Skeleton className="h-5 w-28" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-56" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-36" />
                    </TableCell>
                  </TableRow>
                ))}
              {!isLoading &&
                (data?.data || []).map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      <Badge variant={eventVariant(log.event)}>
                        {log.event?.replaceAll('_', ' ') || '-'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-secondary-foreground text-sm">
                      {log.description || '-'}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {log.ipAddress || '-'}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDateTime(new Date(log.createdAt))}
                    </TableCell>
                  </TableRow>
                ))}
              {!isLoading && (data?.data || []).length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-muted-foreground py-10 text-center text-sm"
                  >
                    No activity recorded yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </CardTable>
      <div className="card-footer justify-between flex flex-col-reverse sm:flex-row">
        <span className="text-muted-foreground text-sm">
          Page {page} of {pageCount}
        </span>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || isLoading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeftIcon /> Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pageCount || isLoading}
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
          >
            Next <ChevronRightIcon />
          </Button>
        </div>
      </div>
    </Card>
  );
}
