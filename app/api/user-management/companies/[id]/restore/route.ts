import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getClientIP } from '@/lib/api';
import { systemLog } from '@/services/system-log';
import {
  forbidden,
  isSuperAdmin,
  notFound,
  requireSession,
  serverError,
  unauthorized,
} from '@/lib/api-helpers';

type RouteContext = { params: Promise<{ id: string }> };

/** Restore a trashed company (superadmin only). */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireSession();
    if (!session) return unauthorized();
    if (!isSuperAdmin(session)) {
      return forbidden('Super admin access required.');
    }

    const { id } = await context.params;

    const company = await prisma.company.findUnique({ where: { id } });
    if (!company) return notFound('Company not found.');

    const updated = await prisma.company.update({
      where: { id },
      data: { isTrashed: false, status: 'ACTIVE' },
    });

    await systemLog({
      event: 'COMPANY_RESTORED',
      userId: session.user.id,
      companyId: updated.id,
      entityId: id,
      entityType: 'Company',
      description: `Restored company ${updated.name} from trash`,
      ipAddress: getClientIP(request),
    });

    return NextResponse.json({ message: 'Company restored successfully.' });
  } catch (error) {
    return serverError(error, 'companies:restore');
  }
}
