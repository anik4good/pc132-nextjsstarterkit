import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getClientIP } from '@/lib/api';
import {
  badRequest,
  isSuperAdmin,
  requireSession,
  requireUserManager,
  serverError,
  unauthorized,
} from '@/lib/api-helpers';
import {
  getCompanySettings,
  updateCompanySettings,
} from '@/lib/company-settings';
import { systemLog } from '@/services/system-log';

async function resolveCompanyId(
  session: NonNullable<Awaited<ReturnType<typeof requireSession>>>,
  request: NextRequest,
): Promise<string | null> {
  if (isSuperAdmin(session)) {
    // Superadmins manage any company; default to the ?companyId param.
    return request.nextUrl.searchParams.get('companyId') ?? null;
  }
  return session.user.companyId ?? null;
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    if (!session) return unauthorized();
    const denied = requireUserManager(session);
    if (denied) return denied;

    const companyId = await resolveCompanyId(session, request);
    if (!companyId) {
      return badRequest('companyId is required (superadmin has no company).');
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });
    if (!company) return badRequest('Company not found.');

    const settings = await getCompanySettings(companyId);
    return NextResponse.json({ data: { companyId, ...settings } });
  } catch (error) {
    return serverError(error, 'settings:get');
  }
}

const updateSettingsSchema = z.object({
  timezone: z.string().trim().min(1).max(64).optional(),
  currency: z.string().trim().length(3).optional(),
  locale: z.string().trim().min(2).max(8).optional(),
  dateFormat: z.string().trim().min(3).max(32).optional(),
  timeFormat: z.string().trim().min(3).max(32).optional(),
  emailFooter: z.string().trim().max(500).optional().or(z.literal('')),
});

export async function PUT(request: NextRequest) {
  try {
    const session = await requireSession();
    if (!session) return unauthorized();
    const denied = requireUserManager(session);
    if (denied) return denied;

    const companyId = await resolveCompanyId(session, request);
    if (!companyId) {
      return badRequest('companyId is required (superadmin has no company).');
    }
    if (!isSuperAdmin(session) && companyId !== session.user.companyId) {
      return badRequest('You can only update your own company settings.');
    }

    const body = await request.json().catch(() => null);
    const parsed = updateSettingsSchema.safeParse(body);
    if (!parsed.success || Object.keys(parsed.data).length === 0) {
      return badRequest('Provide at least one valid setting to update.');
    }

    const settings = await updateCompanySettings(companyId, parsed.data);

    await systemLog({
      event: 'SETTINGS_UPDATED',
      userId: session.user.id,
      companyId,
      entityType: 'CompanySetting',
      entityId: companyId,
      description: `Updated company settings (${Object.keys(parsed.data).join(', ')})`,
      ipAddress: getClientIP(request),
    });

    return NextResponse.json({
      message: 'Settings updated successfully.',
      data: { companyId, ...settings },
    });
  } catch (error) {
    return serverError(error, 'settings:update');
  }
}
