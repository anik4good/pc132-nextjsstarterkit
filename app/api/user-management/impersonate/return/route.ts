import { NextRequest, NextResponse } from 'next/server';
import { encode } from 'next-auth/jwt';
import { prisma } from '@/lib/prisma';
import { getClientIP } from '@/lib/api';
import {
  badRequest,
  requireSession,
  serverError,
  unauthorized,
} from '@/lib/api-helpers';
import { systemLog } from '@/services/system-log';

const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // matches lib/auth.ts

function sessionCookieName(): string {
  const secure = (process.env.NEXTAUTH_URL || '').startsWith('https://');
  return secure ? '__Secure-next-auth.session-token' : 'next-auth.session-token';
}

/**
 * End impersonation: restores the original superadmin's session from the
 * `impersonatedBy` marker in the current JWT and closes the audit entry.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    if (!session) return unauthorized();

    const auditorId = session.user.impersonatedBy;
    if (!auditorId) return badRequest('Not currently impersonating anyone.');

    const auditor = await prisma.user.findUnique({
      where: { id: auditorId },
      include: { role: true, company: true },
    });
    if (!auditor || auditor.isTrashed || auditor.status !== 'ACTIVE') {
      // The original account is gone — fall back to a clean sign-out.
      const response = NextResponse.json({
        message: 'Original account unavailable; signed out.',
      });
      response.cookies.set({
        name: sessionCookieName(),
        value: '',
        httpOnly: true,
        path: '/',
        maxAge: 0,
      });
      return response;
    }

    await prisma.impersonationLog.updateMany({
      where: { auditorId, userId: session.user.id, endedAt: null },
      data: { endedAt: new Date() },
    });

    await systemLog({
      event: 'IMPERSONATION_ENDED',
      userId: auditorId,
      companyId: session.user.companyId,
      entityId: session.user.id,
      entityType: 'User',
      description: `Stopped impersonating ${session.user.email}`,
      ipAddress: getClientIP(request),
    });

    const token = await encode({
      secret: process.env.NEXTAUTH_SECRET as string,
      maxAge: SESSION_MAX_AGE,
      token: {
        id: auditor.id,
        name: auditor.name ?? '',
        email: auditor.email,
        avatar: auditor.avatar ?? null,
        roleId: auditor.roleId,
        roleName: auditor.role?.name ?? null,
        roleSlug: auditor.role?.slug ?? null,
        isSuperAdmin: auditor.role?.isSuperAdmin ?? false,
        isCompanyAdmin: auditor.role?.isCompanyAdmin ?? false,
        companyId: auditor.companyId ?? null,
        companyName: auditor.company?.name ?? null,
        status: auditor.status,
        impersonatedBy: null,
      },
    });

    const response = NextResponse.json({
      message: `Returned to ${auditor.name || auditor.email}.`,
    });
    response.cookies.set({
      name: sessionCookieName(),
      value: token,
      httpOnly: true,
      sameSite: 'lax',
      secure: (process.env.NEXTAUTH_URL || '').startsWith('https://'),
      path: '/',
      maxAge: SESSION_MAX_AGE,
    });
    return response;
  } catch (error) {
    return serverError(error, 'impersonate:return');
  }
}
