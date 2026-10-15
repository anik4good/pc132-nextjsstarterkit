import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { notFound, requireSession, serverError, unauthorized } from '@/lib/api-helpers';

type RouteContext = { params: Promise<{ id: string }> };

/** Mark one of my notifications as read. */
export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const session = await requireSession();
    if (!session) return unauthorized();

    const { id } = await context.params;

    const notification = await prisma.notification.findUnique({ where: { id } });
    if (!notification || notification.userId !== session.user.id) {
      return notFound('Notification not found.');
    }

    await prisma.notification.update({
      where: { id },
      data: { readAt: notification.readAt ?? new Date() },
    });

    return NextResponse.json({ message: 'Notification marked as read.' });
  } catch (error) {
    return serverError(error, 'notifications:read');
  }
}
