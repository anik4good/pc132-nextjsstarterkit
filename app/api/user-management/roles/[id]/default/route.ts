import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getClientIP } from '@/lib/api';
import { systemLog } from '@/services/system-log';
import {
  badRequest,
  notFound,
  requireSession,
  serverError,
  unauthorized,
} from '@/lib/api-helpers';

type RouteContext = { params: Promise<{ id: string }> };

/** Make this role the default one for new signups (only one default at a time). */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireSession();
    if (!session) return unauthorized();

    const { id } = await context.params;

    const role = await prisma.userRole.findUnique({ where: { id } });
    if (!role) return notFound('Role not found.');
    if (role.isTrashed) return badRequest('This role is trashed.');

    await prisma.$transaction([
      prisma.userRole.updateMany({ data: { isDefault: false } }),
      prisma.userRole.update({ where: { id }, data: { isDefault: true } }),
    ]);

    await systemLog({
      event: 'ROLE_DEFAULT_SET',
      userId: session.user.id,
      entityId: id,
      entityType: 'UserRole',
      description: `Set ${role.name} as the default role`,
      ipAddress: getClientIP(request),
    });

    return NextResponse.json({ message: 'Default role set successfully.' });
  } catch (error) {
    return serverError(error, 'roles:default');
  }
}
