import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  envelope,
  notFound,
  pagingParams,
  requireSession,
  serverError,
  unauthorized,
} from '@/lib/api-helpers';

type RouteContext = { params: Promise<{ id: string }> };

/** Activity (system) logs for a single user, newest first. */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireSession();
    if (!session) return unauthorized();

    const { id } = await context.params;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return notFound('User not found.');

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
