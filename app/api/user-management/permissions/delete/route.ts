import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getClientIP } from '@/lib/api';
import { systemLog } from '@/services/system-log';
import {
  badRequest,
  requireSession,
  serverError,
  unauthorized,
} from '@/lib/api-helpers';

/** Bulk delete of permissions, used by the UI's "delete group" action. */
export async function DELETE(request: NextRequest) {
  try {
    const session = await requireSession();
    if (!session) return unauthorized();

    const body = await request.json().catch(() => null);
    const parsed = z
      .object({ permissionIds: z.array(z.string()).min(1) })
      .safeParse(body);

    if (!parsed.success) {
      return badRequest('An array of permissionIds is required.');
    }

    const { permissionIds } = parsed.data;

    const result = await prisma.userPermission.deleteMany({
      where: { id: { in: permissionIds } },
    });

    await systemLog({
      event: 'PERMISSIONS_BULK_DELETED',
      userId: session.user.id,
      entityType: 'UserPermission',
      description: `Deleted ${result.count} permissions`,
      ipAddress: getClientIP(request),
    });

    return NextResponse.json({
      message: 'Permissions deleted successfully.',
      deleted: result.count,
    });
  } catch (error) {
    return serverError(error, 'permissions:bulk-delete');
  }
}
