import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getClientIP } from '@/lib/api';
import { systemLog } from '@/services/system-log';
import {
  forbidden,
  isSuperAdmin,
  notFound,
  requireSession,
  requireUserManager,
  serverError,
  unauthorized,
} from '@/lib/api-helpers';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireSession();
    if (!session) return unauthorized();
    const denied = requireUserManager(session);
    if (denied) return denied;

    const { id } = await context.params;

    const user = await prisma.user.findUnique({
      where: { id },
      include: { role: { select: { isSuperAdmin: true } } },
    });
    if (!user) return notFound('User not found.');
    if (!isSuperAdmin(session)) {
      if (user.role.isSuperAdmin) {
        return forbidden(
          'Super admin users can only be managed by super admins.',
        );
      }
      if (user.companyId !== session.user.companyId) {
        return notFound('User not found.');
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { isTrashed: false },
    });

    await systemLog({
      event: 'USER_RESTORED',
      userId: session.user.id,
      companyId: updated.companyId,
      entityId: id,
      entityType: 'User',
      description: `Restored user ${updated.email} from trash`,
      ipAddress: getClientIP(request),
    });

    return NextResponse.json({ message: 'User restored successfully.' });
  } catch (error) {
    return serverError(error, 'users:restore');
  }
}
