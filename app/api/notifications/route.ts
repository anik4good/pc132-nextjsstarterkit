import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { envelope, pagingParams, requireSession, serverError, unauthorized } from '@/lib/api-helpers';

/** The signed-in user's notifications, newest first. */
export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    if (!session) return unauthorized();

    const { page, skip, take } = pagingParams(request);

    const where = { userId: session.user.id };

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.notification.count({ where }),
    ]);

    return envelope(notifications, total, page);
  } catch (error) {
    return serverError(error, 'notifications:list');
  }
}
