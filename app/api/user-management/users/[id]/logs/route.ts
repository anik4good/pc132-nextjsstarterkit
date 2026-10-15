import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  envelope,
  forbidden,
  isSuperAdmin,
  notFound,
  pagingParams,
  requireSession,
  serverError,
  unauthorized,
} from '@/lib/api-helpers';

type RouteContext = { params: Promise<{ id: string }> };

/** Activity (system) logs for a single user, newest first.
 *  Users may always read their own logs; managers may read logs of users
 *  inside their company; superadmins may read anyone's. */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireSession();
    if (!session) return unauthorized();

    const { id } = await context.params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, companyId: true, role: { select: { isSuperAdmin: true } } },
    });
    if (!user) return notFound('User not found.');

    const isSelf = session.user.id === id;
    if (!isSelf) {
      if (user.role.isSuperAdmin && !isSuperAdmin(session)) {
        return forbidden('Not allowed.');
      }
      if (
        !isSuperAdmin(session) &&
        user.companyId !== session.user.companyId
      ) {
        return notFound('User not found.');
      }
    }

    const { page, skip, take } = pagingParams(request);

    const where: Prisma.SystemLogWhereInput = { userId: id };

    const [logs, total] = await Promise.all([
      prisma.systemLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.systemLog.count({ where }),
    ]);

    return envelope(logs, total, page);
  } catch (error) {
    return serverError(error, 'users:logs');
  }
}
