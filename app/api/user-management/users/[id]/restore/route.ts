import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getClientIP } from '@/lib/api';
import { systemLog } from '@/services/system-log';
import {
  notFound,
  requireSession,
  serverError,
  unauthorized,
} from '@/lib/api-helpers';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireSession();
    if (!session) return unauthorized();

    const { id } = await context.params;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return notFound('User not found.');

    const updated = await prisma.user.update({
      where: { id },
      data: { isTrashed: false },
    });

    await systemLog({
      event: 'USER_RESTORED',
      userId: session.user.id,
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
