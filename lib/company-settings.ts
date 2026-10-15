import { prisma } from '@/lib/prisma';

export interface CompanySettings {
  timezone: string;
  currency: string;
  locale: string;
  dateFormat: string;
  timeFormat: string;
  emailFooter: string | null;
}

export const COMPANY_SETTINGS_DEFAULTS: CompanySettings = {
  timezone: 'UTC',
  currency: 'USD',
  locale: 'en',
  dateFormat: 'MMM D, YYYY',
  timeFormat: 'hh:mm A',
  emailFooter: null,
};

/**
 * Get-or-create the settings row for a company. Every company is guaranteed
 * a settings record, so consumers never null-check.
 */
export async function getCompanySettings(
  companyId: string,
): Promise<CompanySettings> {
  const row = await prisma.companySetting.upsert({
    where: { companyId },
    update: {},
    create: { companyId },
  });

  return {
    timezone: row.timezone,
    currency: row.currency,
    locale: row.locale,
    dateFormat: row.dateFormat,
    timeFormat: row.timeFormat,
    emailFooter: row.emailFooter,
  };
}

export async function updateCompanySettings(
  companyId: string,
  patch: Partial<CompanySettings>,
): Promise<CompanySettings> {
  await getCompanySettings(companyId); // ensure the row exists

  const row = await prisma.companySetting.update({
    where: { companyId },
    data: {
      ...(patch.timezone !== undefined ? { timezone: patch.timezone } : {}),
      ...(patch.currency !== undefined ? { currency: patch.currency } : {}),
      ...(patch.locale !== undefined ? { locale: patch.locale } : {}),
      ...(patch.dateFormat !== undefined
        ? { dateFormat: patch.dateFormat }
        : {}),
      ...(patch.timeFormat !== undefined
        ? { timeFormat: patch.timeFormat }
        : {}),
      ...(patch.emailFooter !== undefined
        ? { emailFooter: patch.emailFooter }
        : {}),
    },
  });

  return {
    timezone: row.timezone,
    currency: row.currency,
    locale: row.locale,
    dateFormat: row.dateFormat,
    timeFormat: row.timeFormat,
    emailFooter: row.emailFooter,
  };
}
