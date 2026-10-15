'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { RiErrorWarningFill } from '@remixicon/react';
import { LoaderCircleIcon, LogIn, Search } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { getInitials } from '@/lib/helpers';
import { Alert, AlertIcon, AlertTitle } from '@/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { User } from '@/app/models/user';
import { Company } from '@/app/models/company';

/**
 * Impersonate flow: pick a user of the company, click, and the session
 * switches to that user (superadmin session is restorable via the banner).
 */
const CompanyImpersonateDialog = ({
  open,
  closeDialog,
  company,
}: {
  open: boolean;
  closeDialog: () => void;
  company: Company | null;
}) => {
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['impersonate-users', company?.id],
    queryFn: async () => {
      const response = await apiFetch(
        `/api/user-management/users?companyId=${company?.id}&limit=100&status=ACTIVE`,
      );
      if (!response.ok) {
        const { message } = await response.json();
        throw new Error(message);
      }
      return (await response.json()) as { data: User[] };
    },
    enabled: open && !!company?.id,
    staleTime: 30_000,
    retry: 1,
  });

  const users = useMemo(() => {
    const list = data?.data ?? [];
    const query = search.trim().toLowerCase();
    if (!query) return list;
    return list.filter(
      (user) =>
        (user.name ?? '').toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query),
    );
  }, [data, search]);

  const impersonate = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiFetch('/api/user-management/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
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
              <LogIn className="size-4" />
            </AlertIcon>
            <AlertTitle>
              Viewing the app as a {company?.name} user — use the banner to return.
            </AlertTitle>
          </Alert>
        ),
        { position: 'top-center' },
      );
      // Hard navigation so the swapped session cookie is picked up everywhere.
      window.location.assign('/');
    },
    onError: (error: Error) => {
      toast.custom(
        () => (
          <Alert variant="mono" icon="destructive" close={false}>
            <AlertIcon>
              <RiErrorWarningFill />
            </AlertIcon>
            <AlertTitle>{error.message}</AlertTitle>
          </Alert>
        ),
        { position: 'top-center' },
      );
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) {
          setSearch('');
          closeDialog();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log in as user — {company?.name}</DialogTitle>
        </DialogHeader>
        <DialogBody className="pt-3 space-y-4">
          <div className="relative">
            <Search className="text-muted-foreground absolute start-3 top-1/2 size-4 -translate-y-1/2" />
            <Input
              placeholder="Search by name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="ps-9"
            />
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : users.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              No active users found for this company.
            </p>
          ) : (
            <div className="max-h-80 space-y-1 overflow-y-auto pe-1">
              {users.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  disabled={impersonate.isPending}
                  onClick={() => impersonate.mutate(user.id)}
                  className="hover:bg-accent flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-start transition-colors disabled:opacity-50"
                >
                  <Avatar className="size-8">
                    {user.avatar ? (
                      <AvatarImage src={user.avatar} alt="" />
                    ) : null}
                    <AvatarFallback className="text-xs">
                      {getInitials(user.name || user.email)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {user.name || user.email}
                    </span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {user.email}
                    </span>
                  </span>
                  <Badge variant="secondary" appearance="light">
                    {user.role?.name}
                  </Badge>
                  <LogIn className="text-muted-foreground size-4 shrink-0" />
                </button>
              ))}
            </div>
          )}

          {impersonate.isPending && (
            <p className="text-muted-foreground flex items-center gap-2 text-xs">
              <LoaderCircleIcon className="size-3.5 animate-spin" />
              Switching session…
            </p>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
};

export default CompanyImpersonateDialog;
