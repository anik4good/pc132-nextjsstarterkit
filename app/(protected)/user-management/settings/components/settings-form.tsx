'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { RiCheckboxCircleFill, RiErrorWarningFill } from '@remixicon/react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { LoaderCircleIcon } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { Alert, AlertIcon, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useCompanySelectQuery } from '../../companies/hooks/use-company-select-query';

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Istanbul',
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
];

const CURRENCIES = ['USD', 'EUR', 'GBP', 'AED', 'PKR', 'INR', 'AUD', 'CAD'];

const LOCALES = [
  { value: 'en', label: 'English' },
  { value: 'de', label: 'Deutsch' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'tr', label: 'Türkçe' },
  { value: 'ur', label: 'اردو' },
];

const DATE_FORMATS = ['MMM D, YYYY', 'DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'D MMMM YYYY'];
const TIME_FORMATS = ['hh:mm A', 'HH:mm', 'hh:mm:ss A', 'HH:mm:ss'];

const SettingsSchema = z.object({
  timezone: z.string().min(1),
  currency: z.string().length(3),
  locale: z.string().min(2),
  dateFormat: z.string().min(3),
  timeFormat: z.string().min(3),
  emailFooter: z.string().max(500).optional().or(z.literal('')),
});

type SettingsSchemaType = z.infer<typeof SettingsSchema>;

export default function SettingsForm() {
  const { data: session } = useSession();
  const isSuperAdmin = !!session?.user?.isSuperAdmin;
  const queryClient = useQueryClient();
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  const { data: companyList } = useCompanySelectQuery();

  // Non-superadmins are pinned to their own company; superadmins pick one.
  const activeCompanyId = useMemo(() => {
    if (isSuperAdmin) return selectedCompanyId;
    return session?.user?.companyId ?? null;
  }, [isSuperAdmin, selectedCompanyId, session]);

  const settingsQuery = useQuery({
    queryKey: ['company-settings', activeCompanyId],
    queryFn: async () => {
      const url = activeCompanyId
        ? `/api/user-management/settings?companyId=${activeCompanyId}`
        : '/api/user-management/settings';
      const response = await apiFetch(url);
      if (!response.ok) {
        const { message } = await response.json();
        throw new Error(message);
      }
      const result = await response.json();
      return result.data as SettingsSchemaType & { companyId: string };
    },
    enabled: !!activeCompanyId,
    retry: 1,
  });

  const form = useForm<SettingsSchemaType>({
    resolver: zodResolver(SettingsSchema),
    defaultValues: {
      timezone: 'UTC',
      currency: 'USD',
      locale: 'en',
      dateFormat: 'MMM D, YYYY',
      timeFormat: 'hh:mm A',
      emailFooter: '',
    },
  });

  useEffect(() => {
    if (settingsQuery.data) {
      form.reset({
        timezone: settingsQuery.data.timezone,
        currency: settingsQuery.data.currency,
        locale: settingsQuery.data.locale,
        dateFormat: settingsQuery.data.dateFormat,
        timeFormat: settingsQuery.data.timeFormat,
        emailFooter: settingsQuery.data.emailFooter ?? '',
      });
    }
  }, [settingsQuery.data, form]);

  const mutation = useMutation({
    mutationFn: async (values: SettingsSchemaType) => {
      const response = await apiFetch(
        `/api/user-management/settings?companyId=${activeCompanyId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(values),
        },
      );
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
              <RiCheckboxCircleFill />
            </AlertIcon>
            <AlertTitle>Settings updated successfully</AlertTitle>
          </Alert>
        ),
        { position: 'top-center' },
      );
      queryClient.invalidateQueries({
        queryKey: ['company-settings', activeCompanyId],
      });
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
          <Select
            onValueChange={(value) => setSelectedCompanyId(value)}
            value={selectedCompanyId || ''}
          >
            <SelectTrigger className="max-w-sm">
              <SelectValue placeholder="Choose a company to manage its settings" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {companyList?.map((company: { id: string; name: string }) => (
                  <SelectItem key={company.id} value={company.id}>
                    {company.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>
    );
  }

  if (settingsQuery.isLoading || !activeCompanyId) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preferences</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
            className="grid gap-5 sm:grid-cols-2"
          >
            <FormField
              control={form.control}
              name="timezone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Timezone</FormLabel>
                  <FormControl>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select timezone" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {TIMEZONES.map((tz) => (
                            <SelectItem key={tz} value={tz}>
                              {tz}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="currency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Currency</FormLabel>
                  <FormControl>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select currency" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {CURRENCIES.map((currency) => (
                            <SelectItem key={currency} value={currency}>
                              {currency}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="locale"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Language</FormLabel>
                  <FormControl>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select language" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {LOCALES.map((locale) => (
                            <SelectItem key={locale.value} value={locale.value}>
                              {locale.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="dateFormat"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date format</FormLabel>
                  <FormControl>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select date format" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {DATE_FORMATS.map((format) => (
                            <SelectItem key={format} value={format}>
                              {format}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="timeFormat"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Time format</FormLabel>
                  <FormControl>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select time format" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {TIME_FORMATS.map((format) => (
                            <SelectItem key={format} value={format}>
                              {format}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="emailFooter"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Email footer</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Optional footer appended to outgoing emails"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="sm:col-span-2">
              <Button type="submit" disabled={mutation.isPending || !form.formState.isDirty}>
                {mutation.isPending && <LoaderCircleIcon className="animate-spin" />}
                Save changes
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
