import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession, serverError, unauthorized } from '@/lib/api-helpers';

/** Unread notification count for the topbar bell (polled). */
export async function GET() {
  try {
    const session = await requireSession();
    if (!session) return unauthorized();

    const count = await prisma.notification.count({
      where: { userId: session.user.id, readAt: null },
    });

    return NextResponse.json({ count });
  } catch (error) {
    return serverError(error, 'notifications:unread-count');
  }
}
