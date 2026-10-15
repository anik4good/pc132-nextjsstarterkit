import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  isSuperAdmin,
  requireSession,
  requireUserManager,
  serverError,
  unauthorized,
} from '@/lib/api-helpers';

/** Lightweight [{ id, name }] list for dropdowns and filters.
 *  Company admins never see the super admin role — they cannot assign it. */
export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    if (!session) return unauthorized();
    const denied = requireUserManager(session);
    if (denied) return denied;

    const roles = await prisma.userRole.findMany({
      where: {
        isTrashed: false,
        ...(isSuperAdmin(session) ? {} : { isSuperAdmin: false }),
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json(roles);
  } catch (error) {
    return serverError(error, 'roles:select');
  }
}
