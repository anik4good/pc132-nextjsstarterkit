import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession, serverError, unauthorized } from '@/lib/api-helpers';

/** Lightweight [{ id, name }] list for dropdowns and filters. */
export async function GET() {
  try {
    const session = await requireSession();
    if (!session) return unauthorized();

    const roles = await prisma.userRole.findMany({
      where: { isTrashed: false },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json(roles);
  } catch (error) {
    return serverError(error, 'roles:select');
  }
}
