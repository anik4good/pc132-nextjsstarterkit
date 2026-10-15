import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  requireSession,
  requireUserManager,
  serverError,
  unauthorized,
} from '@/lib/api-helpers';

/** Lightweight [{ id, name, slug }] list for role-form checkboxes. */
export async function GET() {
  try {
    const session = await requireSession();
    if (!session) return unauthorized();
    const denied = requireUserManager(session);
    if (denied) return denied;

    const permissions = await prisma.userPermission.findMany({
      select: { id: true, name: true, slug: true },
      orderBy: { slug: 'asc' },
    });

    return NextResponse.json(permissions);
  } catch (error) {
    return serverError(error, 'permissions:select');
  }
}
