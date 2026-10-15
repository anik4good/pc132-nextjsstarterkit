import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  isSuperAdmin,
  requireSession,
  serverError,
  unauthorized,
} from '@/lib/api-helpers';

/** Lightweight [{ id, name }] list for dropdowns and filters.
 *  Superadmins get every company; other users only their own. */
export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    if (!session) return unauthorized();

    // Optional superadmin-only override: ?exclude=<companyId>
    const excludeId = request.nextUrl.searchParams.get('exclude');

    const companies = await prisma.company.findMany({
      where: {
        isTrashed: false,
        ...(isSuperAdmin(session)
          ? {}
          : { id: session.user.companyId ?? '00000000-0000-0000-0000-000000000000' }),
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json(companies);
  } catch (error) {
    return serverError(error, 'companies:select');
  }
}
