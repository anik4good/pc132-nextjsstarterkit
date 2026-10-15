import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession, serverError, unauthorized } from '@/lib/api-helpers';

/** Mark all of my notifications as read. */
export async function POST() {
  try {
    const session = await requireSession();
    if (!session) return unauthorized();

    const result = await prisma.notification.updateMany({
      where: { userId: session.user.id, readAt: null },
      data: { readAt: new Date() },
    });

    return NextResponse.json({ message: 'All notifications marked as read.', count: result.count });
  } catch (error) {
    return serverError(error, 'notifications:read-all');
  }
}
