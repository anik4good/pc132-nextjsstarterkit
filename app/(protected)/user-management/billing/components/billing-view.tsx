'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RiCheckboxCircleFill, RiErrorWarningFill } from '@remixicon/react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { Alert, AlertIcon, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useCompanySelectQuery } from '../../companies/hooks/use-company-select-query';

interface BillingData {
  companyId: string;
  enabled: boolean;
  subscription: {
    status: string;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: string | null;
  } | null;
  plan: {
    id: string;
    slug: string;
    name: string;
    priceMonthly: number;
    currency: string;
    maxUsers: number | null;
    features: Record<string, string> | null;
  } | null;
  usersCount: number;
}

interface PlanRecord {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  priceMonthly: number;
  currency: string;
  maxUsers: number | null;
  features: Record<string, string> | null;
  isDefault: boolean;
  stripePriceId: string | null;
}

export default function BillingView() {
  const { data: session } = useSession();
  const isSuperAdmin = !!session?.user?.isSuperAdmin;
  const queryClient = useQueryClient();
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  const { data: companyList } = useCompanySelectQuery();

  const activeCompanyId = isSuperAdmin
    ? selectedCompanyId ?? session?.user?.companyId ?? null
    : session?.user?.companyId ?? null;

  const billingQuery = useQuery({
    queryKey: ['billing', activeCompanyId],
    queryFn: async () => {
      const url = activeCompanyId
        ? `/api/billing/subscription?companyId=${activeCompanyId}`
        : '/api/billing/subscription';
      const response = await apiFetch(url);
      if (!response.ok) {
        const { message } = await response.json();
        throw new Error(message);
      }
      const result = await response.json();
      return result.data as BillingData;
    },
    enabled: !!activeCompanyId,
    retry: 1,
  });

  const plansQuery = useQuery({
    queryKey: ['billing-plans'],
    queryFn: async () => {
      const response = await apiFetch('/api/billing/plans');
      if (!response.ok) throw new Error('Failed to load plans.');
      const result = await response.json();
      return result as { enabled: boolean; data: PlanRecord[] };
    },
    retry: 1,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['billing'] });
  };

  const checkout = useMutation({
    mutationFn: async (planId: string) => {
      const response = await apiFetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, ...(isSuperAdmin && activeCompanyId ? { companyId: activeCompanyId } : {}) }),
      });
      if (!response.ok) {
        const { message } = await response.json();
        throw new Error(message);
      }
      return (await response.json()) as { url: string };
    },
    onSuccess: (result) => {
      window.location.assign(result.url);
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

  const portal = useMutation({
    mutationFn: async () => {
      const url = activeCompanyId
        ? `/api/billing/portal?companyId=${activeCompanyId}`
        : '/api/billing/portal';
      const response = await apiFetch(url, { method: 'POST' });
      if (!response.ok) {
        const { message } = await response.json();
        throw new Error(message);
      }
      return (await response.json()) as { url: string };
    },
    onSuccess: (result) => {
      window.location.assign(result.url);
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

  if (isSuperAdmin && !activeCompanyId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Select a company</CardTitle>
        </CardHeader>
        <CardContent>
          <select
            className="border-input bg-background h-9 max-w-sm rounded-lg border px-3 text-sm"
            value={selectedCompanyId || ''}
            onChange={(e) => setSelectedCompanyId(e.target.value)}
          >
            <option value="" disabled>
              Choose a company…
            </option>
            {companyList?.map((company: { id: string; name: string }) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>
    );
  }

  if (billingQuery.isLoading || plansQuery.isLoading || !activeCompanyId) {
    return (
      <div className="grid gap-5">
        <Skeleton className="h-36 w-full" />
        <div className="grid gap-5 md:grid-cols-2">
          <Skeleton className="h-52 w-full" />
          <Skeleton className="h-52 w-full" />
        </div>
      </div>
    );
  }

  const billing = billingQuery.data;
  const plans = plansQuery.data?.data ?? [];
  const enabled = plansQuery.data?.enabled ?? false;
  const currentPlanId = billing?.plan?.id;
  const seatsPercent =
    billing?.plan?.maxUsers != null
      ? Math.min(100, Math.round((billing.usersCount / billing.plan.maxUsers) * 100))
      : 0;

  return (
    <div className="grid gap-5">
      {billing?.subscription?.status === 'past_due' && (
        <Alert variant="destructive">
          <AlertIcon>
            <RiErrorWarningFill />
          </AlertIcon>
          <AlertTitle>
            Your last payment failed. Update your payment method to avoid losing access.
          </AlertTitle>
        </Alert>
      )}

      {/* Current plan + usage */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2.5">
            Current plan
            {billing?.subscription && (
              <Badge
                variant={billing.subscription.status === 'active' ? 'success' : 'warning'}
                appearance="light"
              >
                {billing.subscription.status}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-2xl font-semibold">{billing?.plan?.name ?? '—'}</span>
            {billing?.plan && (
              <span className="text-muted-foreground text-sm">
                {billing.plan.priceMonthly === 0
                  ? 'Free'
                  : `${(billing.plan.priceMonthly / 100).toFixed(2)} ${billing.plan.currency} / month`}
              </span>
            )}
            {billing?.subscription?.cancelAtPeriodEnd && (
              <Badge variant="warning" appearance="light">
                Cancels at period end
              </Badge>
            )}
          </div>

          <div className="max-w-md space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Seats used</span>
              <span className="font-medium">
                {billing?.usersCount ?? 0} / {billing?.plan?.maxUsers ?? '∞'}
              </span>
            </div>
            {billing?.plan?.maxUsers != null && (
              <Progress value={seatsPercent} />
            )}
          </div>

          {enabled && billing?.subscription && (
            <Button
              variant="outline"
              size="sm"
              disabled={portal.isPending}
              onClick={() => portal.mutate()}
            >
              Manage billing (Stripe portal)
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Plans */}
      <div>
        {!enabled && (
          <Alert variant="mono" className="mb-5">
            <AlertIcon>
              <RiCheckboxCircleFill />
            </AlertIcon>
            <AlertTitle>
              Stripe is not configured — billing is running in plan-only mode. Set
              STRIPE_SECRET_KEY (and a STRIPE_WEBHOOK_SECRET) to enable upgrades and
              the customer portal.
            </AlertTitle>
          </Alert>
        )}
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => {
            const isCurrent = plan.id === currentPlanId;
            return (
              <Card key={plan.id} className={isCurrent ? 'border-primary' : ''}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    {plan.name}
                    {isCurrent && (
                      <Badge variant="success" appearance="light">
                        Current
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <span className="text-3xl font-semibold">
                      {plan.priceMonthly === 0
                        ? 'Free'
                        : `${(plan.priceMonthly / 100).toFixed(2)}`}
                    </span>
                    {plan.priceMonthly > 0 && (
                      <span className="text-muted-foreground text-sm">
                        {' '}
                        {plan.currency} / month
                      </span>
                    )}
                  </div>
                  {plan.description && (
                    <p className="text-muted-foreground text-sm">{plan.description}</p>
                  )}
                  <ul className="space-y-1.5">
                    {Object.entries(plan.features ?? {}).map(([key, label]) => (
                      <li key={key} className="flex items-center gap-2 text-sm">
                        <RiCheckboxCircleFill className="text-success size-4 shrink-0" />
                        {label}
                      </li>
                    ))}
                    {plan.maxUsers != null && (
                      <li className="text-muted-foreground text-xs">
                        Up to {plan.maxUsers} users
                      </li>
                    )}
                  </ul>
                  {!isCurrent && (
                    <Button
                      className="w-full"
                      disabled={!enabled || checkout.isPending || !plan.stripePriceId}
                      onClick={() => checkout.mutate(plan.id)}
                    >
                      {!enabled
                        ? 'Upgrade unavailable'
                        : plan.priceMonthly > 0
                          ? `Upgrade to ${plan.name}`
                          : `Switch to ${plan.name}`}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
